import base64
import os
from decimal import Decimal
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query

from app.db import get_db
from app.quality import (
    GRADE_BANDS,
    LABEL_GRADE_SQL,
    LABEL_VERDICT_SQL,
    SEVERITY_MAP,
    grade_from_points,
    points_per_100_yards,
    quality_from_points,
    severity_for,
    status_from_grade,
)
from app.supplier_watch import build_supplier_watch

try:
    from ultralytics import RTDETR
except Exception:  # pragma: no cover
    RTDETR = None

router = APIRouter(prefix="/api/fabric", tags=["Fabric"])

CLASS_NAMES = {
    0: "Miss loop",
    1: "Needle mark",
    2: "Setup",
    3: "Oil Spot",
    4: "Hole",
    5: "Contamination",
    6: "Yarn missing",
}

MODEL_VERSION = "rt-detr-v1.0"
MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "weights",
    "best.pt",
)
MODEL = None

# Scoring lives in app/quality.py so the seed, the live pipeline and the
# dashboards cannot drift apart. SEVERITY_MAP is re-exported for readability.
_grade_from_points = grade_from_points
_calculate_points_per_100 = points_per_100_yards
_get_severity_from_class_name = severity_for


def _generate_roll_code(cur, shipment_id: int) -> str:
    cur.execute(
        "SELECT shipment_code FROM fabric_shipments WHERE shipment_id = %s",
        (shipment_id,),
    )
    shipment = cur.fetchone()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    shipment_code = shipment["shipment_code"]
    cur.execute(
        "SELECT COUNT(*) AS total FROM fabric_rolls WHERE shipment_id = %s",
        (shipment_id,),
    )
    count_row = cur.fetchone()
    next_no = int(count_row["total"]) + 1
    return f"{shipment_code}-R{next_no}"


def _decimal_to_float(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def _normalize_row(row: Dict[str, Any]):
    if not row:
        return row
    return {key: _decimal_to_float(val) for key, val in row.items()}


@router.get("/health")
def health():
    return {"status": "ok", "message": "Fabric inspection API is running"}


@router.get("/suppliers")
def get_suppliers():
    """Fabric suppliers with their measured performance and commercial terms.

    Every derived column is computed here so the frontend never has to invent
    one:
      * avg_quality       - four-point score converted to 0-100, higher better
      * defect_rate       - defects per inspected roll (a real rate)
      * on_time_pct       - received_date <= promised_date
      * copq_amount       - recorded loss events for this supplier
      * annual_spend / unit_price / renewal_date - from supplier_contracts
    """
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.supplier_id, s.name, s.country, s.city, s.contact_person,
                       s.contact_email, s.contact_phone, s.supplier_rating,
                       s.supplier_tier, s.fabric_specialty,
                       COALESCE(sh.shipment_count, 0)  AS shipment_count,
                       COALESCE(sh.avg_quality, 0)     AS avg_shipment_quality,
                       COALESCE(sh.on_time_pct, 0)     AS on_time_pct,
                       ins.inspection_start, ins.inspection_end,
                       ins.quality_inspections, ins.quality_start, ins.quality_end,
                       COALESCE(ins.inspections, 0)    AS inspections,
                       ins.avg_points                  AS avg_points_per_100,
                       COALESCE(ins.total_defects, 0)  AS total_defects,
                       COALESCE(ins.rejects, 0)        AS rejects,
                       COALESCE(cq.copq_amount, 0)     AS copq_amount,
                       ct.annual_spend, ct.unit_price, ct.renewal_date,
                       ct.payment_terms, ct.contract_code
                FROM fabric_suppliers s
                LEFT JOIN (
                    SELECT supplier_id,
                           COUNT(*) AS shipment_count,
                           ROUND(AVG(quality_score), 2) AS avg_quality,
                           ROUND(100.0 * COUNT(*) FILTER (
                                   WHERE received_date IS NOT NULL
                                     AND promised_date IS NOT NULL
                                     AND received_date <= promised_date
                                 ) / NULLIF(COUNT(*) FILTER (
                                   WHERE received_date IS NOT NULL
                                     AND promised_date IS NOT NULL), 0), 1) AS on_time_pct
                    FROM fabric_shipments GROUP BY supplier_id
                ) sh ON sh.supplier_id = s.supplier_id
                LEFT JOIN (
                    SELECT sh2.supplier_id,
                           COUNT(*) AS inspections,
                           MIN(i.inspected_at)::date AS inspection_start,
                           MAX(i.inspected_at)::date AS inspection_end,
                           COUNT(i.points_per_100_yards) AS quality_inspections,
                           (MIN(i.inspected_at) FILTER (WHERE i.points_per_100_yards IS NOT NULL))::date AS quality_start,
                           (MAX(i.inspected_at) FILTER (WHERE i.points_per_100_yards IS NOT NULL))::date AS quality_end,
                           ROUND(AVG(i.points_per_100_yards), 2) AS avg_points,
                           SUM(i.total_defects_found) AS total_defects,
                           COUNT(*) FILTER (WHERE i.grade = 'Reject') AS rejects
                    FROM fabric_inspections i
                    JOIN fabric_rolls fr      ON fr.roll_id = i.roll_id
                    JOIN fabric_shipments sh2 ON sh2.shipment_id = fr.shipment_id
                    GROUP BY sh2.supplier_id
                ) ins ON ins.supplier_id = s.supplier_id
                LEFT JOIN (
                    SELECT sh3.supplier_id, SUM(c.amount) AS copq_amount
                    FROM copq_events c
                    JOIN fabric_inspections i ON i.inspection_id = c.fabric_inspection_id
                    JOIN fabric_rolls fr      ON fr.roll_id = i.roll_id
                    JOIN fabric_shipments sh3 ON sh3.shipment_id = fr.shipment_id
                    WHERE c.scope = 'Fabric'
                    GROUP BY sh3.supplier_id
                ) cq ON cq.supplier_id = s.supplier_id
                LEFT JOIN supplier_contracts ct
                       ON ct.fabric_supplier_id = s.supplier_id AND ct.scope = 'Fabric'
                ORDER BY s.name
                """
            )
            suppliers = []
            for row in cur.fetchall():
                data = _normalize_row(dict(row))
                inspections = int(data.get("inspections") or 0)
                avg_points = data.get("avg_points_per_100")

                data["scope"] = "Fabric"
                # Four-point penalty expressed on the shared 0-100 scale.
                data["avg_quality"] = (
                    quality_from_points(avg_points) if avg_points is not None else None
                )
                data["defect_rate"] = (
                    round(float(data.get("total_defects") or 0) / inspections, 2)
                    if inspections else 0.0
                )
                data["reject_rate"] = (
                    round(int(data.get("rejects") or 0) / inspections * 100, 1)
                    if inspections else 0.0
                )
                suppliers.append(data)
            return {"suppliers": suppliers}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/shipments")
def get_shipments():
    """Fabric shipments with inspection progress and lot value from the contract."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sh.shipment_id, sh.supplier_id, sh.shipment_code, sh.fabric_type,
                       sh.color, sh.sampling_stage, sh.quality_score, sh.total_rolls,
                       sh.shipment_date, sh.promised_date, sh.received_date, sh.notes,
                       CASE
                         WHEN sh.quality_score IS NULL THEN 'In transit'
                         WHEN sh.sampling_stage <> 'Final' THEN 'Inspecting'
                         WHEN sh.quality_score >= (
                                SELECT clearance_score FROM cost_parameters
                                WHERE scope = 'Fabric' AND effective_from <= CURRENT_DATE
                                ORDER BY effective_from DESC LIMIT 1
                              ) THEN 'Cleared'
                         ELSE 'Rejected'
                       END AS lifecycle,
                       s.name AS supplier,
                       COALESCE(r.inspected_rolls, 0) AS inspected_rolls,
                       GREATEST(sh.total_rolls - COALESCE(r.inspected_rolls, 0), 0) AS uninspected_rolls,
                       COALESCE(r.total_yards, 0) AS total_yards,
                       ct.unit_price,
                       ROUND(COALESCE(r.total_yards, 0) * COALESCE(ct.unit_price, 0), 2) AS lot_value,
                       (sh.received_date IS NOT NULL AND sh.promised_date IS NOT NULL
                        AND sh.received_date <= sh.promised_date) AS on_time
                FROM fabric_shipments sh
                JOIN fabric_suppliers s ON s.supplier_id = sh.supplier_id
                LEFT JOIN (
                    SELECT fr.shipment_id,
                           COUNT(i.inspection_id) AS inspected_rolls,
                           SUM(fr.roll_length_yards) AS total_yards
                    FROM fabric_rolls fr
                    LEFT JOIN fabric_inspections i ON i.roll_id = fr.roll_id
                    GROUP BY fr.shipment_id
                ) r ON r.shipment_id = sh.shipment_id
                LEFT JOIN supplier_contracts ct
                       ON ct.fabric_supplier_id = sh.supplier_id AND ct.scope = 'Fabric'
                ORDER BY sh.shipment_id DESC
                """
            )
            return {
                "shipments": [
                    {**_normalize_row(dict(row)), "scope": "Fabric"} for row in cur.fetchall()
                ]
            }
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _normalised(value: float, extent: float) -> float:
    """Clamp a pixel coordinate to the 0-1 fraction the database stores."""
    if not extent:
        return 0.0
    return round(min(1.0, max(0.0, float(value) / float(extent))), 4)


def _classify_defect(contour, image_shape):
    area = cv2.contourArea(contour)
    h, w = image_shape[:2]
    total_area = h * w
    area_ratio = area / max(total_area, 1)

    if area_ratio > 0.08:
        return "Hole"
    if area_ratio > 0.04:
        return "Oil Spot"
    if area_ratio > 0.015:
        return "Needle mark"
    if area_ratio > 0.008:
        return "Miss loop"
    return "Setup"


def _get_model():
    global MODEL
    if MODEL is not None:
        return MODEL

    if RTDETR is None:
        raise RuntimeError("ultralytics is not installed")

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found at {MODEL_PATH}")

    MODEL = RTDETR(str(MODEL_PATH))
    return MODEL


def _resize_for_inference(image_bgr: np.ndarray, max_side: int = 1024) -> np.ndarray:
    height, width = image_bgr.shape[:2]
    if max(height, width) <= max_side:
        return image_bgr

    scale = max_side / float(max(height, width))
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    return cv2.resize(image_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _annotate_image(image_bgr: np.ndarray, detections) -> str:
    annotated = image_bgr.copy()
    for box in detections:
        x1, y1, x2, y2 = map(float, box.xyxy[0].cpu().tolist())
        cls_id = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        class_name = CLASS_NAMES.get(cls_id, f"Class {cls_id}")
        label = f"{class_name} {conf:.2f}"

        cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
        cv2.putText(
            annotated,
            label,
            (int(x1), max(15, int(y1) - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

    _, encoded = cv2.imencode(".png", annotated)
    return base64.b64encode(encoded.tobytes()).decode("utf-8")


def _analyze_fabric_image(image_bgr: np.ndarray,
                          roll_length_yards: Optional[float] = None) -> Dict[str, Any]:
    """Detect defects on one image and score them with the four-point system.

    Two things here have to match what bulk_seed.sql writes, or a live
    inspection would not be comparable with the seeded history:

      * positions are NORMALISED to 0-1 of the image, not raw pixels. The
        column is NUMERIC(7,4) and the inspection detail page treats the value
        as a fraction, so pixel coordinates both overflowed and rendered wrong.
      * penalty points are SUM(severity), the actual four-point rule. The old
        `severity * confidence * 10` inflated every roll past the Reject
        threshold. Confidence is a detection property and stays on the defect
        row for routing, not for scoring.

    points_per_100_yards needs the roll length. When it is not supplied the
    caller aggregates across images and computes it once for the whole roll.
    """
    try:
        image_bgr = _resize_for_inference(image_bgr, max_side=1024)
        model = _get_model()
        results = model(image_bgr, conf=0.25, imgsz=512, verbose=False)
        result = results[0]

        height, width = image_bgr.shape[:2]
        detections = []
        for box in result.boxes:
            x1, y1, x2, y2 = map(float, box.xyxy[0].cpu().tolist())
            cls_id = int(box.cls[0].item())
            confidence = float(box.conf[0].item())
            class_name = CLASS_NAMES.get(cls_id, f"Class {cls_id}")
            detections.append(
                {
                    "image_index": len(detections) + 1,
                    "defect_type": class_name,
                    "severity": severity_for(class_name),
                    "confidence_score": round(confidence, 3),
                    "position_x": _normalised(((x1 + x2) / 2.0), width),
                    "position_y": _normalised(((y1 + y2) / 2.0), height),
                    "bbox": [round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)],
                }
            )

        total_defects = len(detections)
        total_penalty_points = float(sum(item["severity"] for item in detections))
        points_per_100 = points_per_100_yards(total_penalty_points, roll_length_yards) \
            if roll_length_yards else 0.0
        grade = grade_from_points(points_per_100)

        annotated_image = _annotate_image(image_bgr, result.boxes)

        return {
            "total_images_processed": 1,
            "total_defects_found": total_defects,
            "total_penalty_points": round(float(total_penalty_points), 2),
            "points_per_100_yards": points_per_100,
            "grade": grade,
            "status": status_from_grade(grade),
            "detections": detections,
            "model_version": MODEL_VERSION,
            "annotated_image": annotated_image,
        }
    except Exception:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        clean = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        img_h, img_w = image_bgr.shape[:2]
        defects: List[Dict[str, Any]] = []
        for idx, contour in enumerate(contours):
            area = cv2.contourArea(contour)
            if area < 80:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            defect_name = _classify_defect(contour, image_bgr.shape)
            confidence = min(0.99, max(0.45, area / 1500.0))
            defects.append(
                {
                    "image_index": idx + 1,
                    "defect_type": defect_name,
                    "severity": severity_for(defect_name),
                    "confidence_score": round(float(confidence), 3),
                    "position_x": _normalised(x + w / 2, img_w),
                    "position_y": _normalised(y + h / 2, img_h),
                }
            )

        total_defects = len(defects)
        total_penalty_points = float(sum(item["severity"] for item in defects))
        points_per_100 = points_per_100_yards(total_penalty_points, roll_length_yards) \
            if roll_length_yards else 0.0
        grade = grade_from_points(points_per_100)

        return {
            "total_images_processed": 1,
            "total_defects_found": total_defects,
            "total_penalty_points": round(float(total_penalty_points), 2),
            "points_per_100_yards": points_per_100,
            "grade": grade,
            "status": status_from_grade(grade),
            "detections": defects,
            "model_version": "heuristic-fabric-inspection-v1",
            "annotated_image": None,
        }


@router.post("/run")
async def run_inspection(
    supplier_id: int = Form(...),
    shipment_id: int = Form(...),
    roll_length_yards: float = Form(...),
    roll_width_inches: Optional[float] = Form(None),
    weight_kg: Optional[float] = Form(None),
    inspector_notes: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            roll_code = _generate_roll_code(cur, shipment_id)

        results_output = []
        total_defects_found = 0
        image_penalty = 0.0
        defect_summary: Dict[str, int] = {}

        for index, file in enumerate(files, start=1):
            if not file.filename:
                continue

            contents = await file.read()
            image_array = np.frombuffer(contents, dtype=np.uint8)
            image_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            if image_bgr is None:
                raise HTTPException(status_code=400, detail=f"Could not decode uploaded image: {file.filename}")

            result = _analyze_fabric_image(image_bgr)
            image_penalty += float(result.get("total_penalty_points") or 0)
            detections = []

            for det in result.get("detections", []):
                class_name = det.get("defect_type")
                total_defects_found += 1
                defect_summary[class_name] = defect_summary.get(class_name, 0) + 1
                detections.append(
                    {
                        "image_index": index,
                        "class_id": CLASS_NAMES.get(next((k for k, v in CLASS_NAMES.items() if v == class_name), 0), 0),
                        "class_name": class_name,
                        "severity": _get_severity_from_class_name(class_name),
                        "confidence": float(det.get("confidence_score", 0.0)),
                        "bbox": {
                            "x1": float(det.get("bbox", [0, 0, 0, 0])[0]),
                            "y1": float(det.get("bbox", [0, 0, 0, 0])[1]),
                            "x2": float(det.get("bbox", [0, 0, 0, 0])[2]),
                            "y2": float(det.get("bbox", [0, 0, 0, 0])[3]),
                        },
                        "position_x": det.get("position_x"),
                        "position_y": det.get("position_y"),
                    }
                )

            results_output.append(
                {
                    "filename": file.filename,
                    "image_index": index,
                    "detections": detections,
                    "annotated_image": result.get("annotated_image"),
                }
            )

        # The four-point score belongs to the ROLL, not to any one image, so it
        # is computed once here over every defect found across all the images.
        # /save no longer has to trust a score calculated in the browser.
        roll_points = points_per_100_yards(image_penalty, roll_length_yards)
        roll_grade = grade_from_points(roll_points)

        return {
            "roll_code": roll_code,
            "supplier_id": supplier_id,
            "shipment_id": shipment_id,
            "roll_length_yards": roll_length_yards,
            "roll_width_inches": roll_width_inches,
            "weight_kg": weight_kg,
            "inspector_notes": inspector_notes,
            "total_images_processed": len(files),
            "total_defects_found": total_defects_found,
            "total_penalty_points": round(image_penalty, 2),
            "points_per_100_yards": roll_points,
            "quality_score": quality_from_points(roll_points),
            "grade": roll_grade,
            "status": status_from_grade(roll_grade),
            "model_version": MODEL_VERSION,
            "defect_summary": defect_summary,
            "results": results_output,
        }
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.post("/save")
def save_inspection(payload: Dict[str, Any]):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM fabric_shipments WHERE shipment_id = %s", (payload.get("shipment_id"),))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Shipment not found")

            roll_code = payload.get("roll_code") or "R-01"
            cur.execute(
                """
                INSERT INTO fabric_rolls
                (shipment_id, roll_code, roll_length_yards, roll_width_inches, weight_kg, inspection_date, inspection_time, inspector_notes)
                VALUES (%s, %s, %s, %s, %s, CURRENT_DATE, CURRENT_TIME, %s)
                RETURNING *
                """,
                (
                    payload.get("shipment_id"),
                    roll_code,
                    payload.get("roll_length_yards"),
                    payload.get("roll_width_inches"),
                    payload.get("weight_kg"),
                    payload.get("inspector_notes"),
                ),
            )
            roll = cur.fetchone()

            # Score from the detections that are about to be written, using the
            # roll length that was just stored. The client's numbers are not
            # trusted: a browser-computed grade could contradict the defect rows
            # sitting next to it, which is exactly the drift this table had.
            detection_rows = [
                det
                for item in payload.get("detections", [])
                for det in item.get("detections", [])
            ]
            total_penalty_points = float(
                sum(severity_for(det.get("class_name")) for det in detection_rows)
            )
            points_per_100 = points_per_100_yards(
                total_penalty_points, roll["roll_length_yards"]
            )
            grade = grade_from_points(points_per_100)
            status = payload.get("status") or status_from_grade(grade)
            total_defects_found = len(detection_rows)

            cur.execute(
                """
                INSERT INTO fabric_inspections
                (roll_id, total_images_processed, total_defects_found, total_penalty_points, points_per_100_yards, grade, model_version, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    roll["roll_id"],
                    payload.get("total_images_processed", 0),
                    total_defects_found,
                    total_penalty_points,
                    points_per_100,
                    grade,
                    MODEL_VERSION,
                    status,
                ),
            )
            inspection = cur.fetchone()

            for item in payload.get("detections", []):
                image_index = item.get("image_index", 0)
                for det in item.get("detections", []):
                    cur.execute(
                        """
                        INSERT INTO fabric_defects
                        (inspection_id, image_index, defect_type, severity, confidence_score, position_x, position_y)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            inspection["inspection_id"],
                            image_index,
                            det.get("class_name"),
                            severity_for(det.get("class_name")),
                            det.get("confidence"),
                            det.get("position_x"),
                            det.get("position_y"),
                        ),
                    )

            conn.commit()
            return {
                "message": "Inspection saved successfully",
                "roll": _normalize_row(roll),
                "inspection": _normalize_row(inspection),
            }
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.post("/inspect")
async def inspect_fabric(
    file: UploadFile = File(...),
    supplier_id: int = Form(1),
    shipment_id: int = Form(1),
    roll_code: str = Form("R-01"),
    roll_length_yards: float = Form(...),
):
    """Analyse a single image without persisting it.

    roll_length_yards is required: points per 100 yards is a rate, and grading
    an image without knowing the length it represents would produce a grade
    that means nothing. The caller supplies the roll it came from.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if roll_length_yards <= 0:
        raise HTTPException(status_code=400, detail="roll_length_yards must be greater than 0")

    contents = await file.read()
    image_array = np.frombuffer(contents, dtype=np.uint8)
    image_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode uploaded image")

    result = _analyze_fabric_image(image_bgr, roll_length_yards=roll_length_yards)
    result["supplier_id"] = supplier_id
    result["shipment_id"] = shipment_id
    result["roll_code"] = roll_code
    result["roll_length_yards"] = roll_length_yards
    result["quality_score"] = quality_from_points(result["points_per_100_yards"])
    return result


@router.get("/summary")
def summary():
    """Model status plus the fabric types actually present in the shipments."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT fabric_type FROM fabric_shipments "
                "WHERE fabric_type IS NOT NULL ORDER BY fabric_type"
            )
            fabric_types = [r["fabric_type"] for r in cur.fetchall()]
        return {
            "fabric_types": fabric_types,
            "defect_classes": sorted(set(CLASS_NAMES.values())),
            "model_version": MODEL_VERSION,
            "status": "ready",
        }
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/grading-policy")
def grading_policy():
    """The rule that actually decides a roll's grade and review status.

    Served from app/quality.py so the screens describe what the pipeline does
    instead of stating a separate policy of their own.
    """
    bands = []
    previous = 0.0
    for limit, grade in GRADE_BANDS:
        bands.append({
            "grade": grade,
            "min_points": previous,
            "max_points": limit,
            "label": f"{previous:g}-{limit:g} points / 100 yards",
            "routing": status_from_grade(grade),
        })
        previous = limit
    bands.append({
        "grade": "Reject",
        "min_points": previous,
        "max_points": None,
        "label": f"over {previous:g} points / 100 yards",
        "routing": status_from_grade("Reject"),
    })
    return {
        "metric": "points_per_100_yards",
        "direction": "lower is better",
        "description": "Standard four-point system: each defect contributes its severity (1-4) as penalty points, normalised per 100 yards of roll.",
        "bands": bands,
        "severity_map": SEVERITY_MAP,
    }


@router.get("/defect-severities")
def defect_severities(scope: str = Query("Fabric")):
    """Severity actually recorded for each defect class.

    The UI used to keep its own copy of the severity map, which could drift
    from the one the detector and the database use. This returns the modal
    severity per class straight from the defect rows.
    """
    conn = get_db()
    try:
        with conn.cursor() as cur:
            severities: Dict[str, int] = {}

            if scope in ("Fabric", "All"):
                cur.execute(
                    "SELECT defect_type, MODE() WITHIN GROUP (ORDER BY severity) AS severity "
                    "FROM fabric_defects GROUP BY defect_type"
                )
                for row in cur.fetchall():
                    severities[row["defect_type"]] = int(row["severity"] or 1)

            if scope in ("Label", "All"):
                cur.execute(
                    "SELECT defect_type, MODE() WITHIN GROUP (ORDER BY severity) AS severity "
                    "FROM label_defects GROUP BY defect_type"
                )
                for row in cur.fetchall():
                    severities.setdefault(row["defect_type"], int(row["severity"] or 1))

            return {"scope": scope, "severities": severities}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/inspections")
def get_inspections(limit: int = Query(500, ge=1, le=5000)):
    """Return all inspections joined with roll, shipment, and supplier info."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    i.inspection_id,
                    fr.roll_code,
                    s.name AS supplier,
                    i.status,
                    i.grade,
                    -- real detector confidence: the mean over this roll's own
                    -- defect rows. NULL when nothing was detected, which the
                    -- caller renders as "no detections" rather than a number.
                    ROUND(AVG(d.confidence_score) * 100, 1) AS confidence,
                    i.total_defects_found AS defects,
                    i.total_penalty_points,
                    i.points_per_100_yards,
                    sh.shipment_code,
                    i.inspected_at
                FROM fabric_inspections i
                JOIN fabric_rolls fr ON i.roll_id = fr.roll_id
                JOIN fabric_shipments sh ON fr.shipment_id = sh.shipment_id
                JOIN fabric_suppliers s ON sh.supplier_id = s.supplier_id
                LEFT JOIN fabric_defects d ON d.inspection_id = i.inspection_id
                GROUP BY i.inspection_id, fr.roll_code, s.name, i.status, i.grade,
                         i.total_defects_found, i.total_penalty_points,
                         i.points_per_100_yards, sh.shipment_code, i.inspected_at
                ORDER BY i.inspected_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
            result = []
            for row in rows:
                d = _normalize_row(dict(row))
                d["id"] = f"IN-{d['inspection_id']}"
                d["roll"] = d.get("roll_code", "")
                # Map DB status to frontend display status
                status = d.get("status", "Pending Review")
                if status == "Pending Review":
                    d["status"] = "Needs review"
                # None when the roll has no detections at all - the UI shows
                # a dash instead of inventing a confidence.
                d["confidence"] = (
                    round(float(d["confidence"]), 1) if d.get("confidence") is not None else None
                )
                d["defects"] = int(d.get("defects") or 0)
                d["points_per_100_yards"] = _decimal_to_float(d.get("points_per_100_yards"))
                d["total_penalty_points"] = _decimal_to_float(d.get("total_penalty_points"))
                d["quality"] = quality_from_points(d.get("points_per_100_yards") or 0)
                d["grade"] = d.get("grade", "A")
                d["scope"] = "Fabric"
                # Format time
                if d.get("inspected_at"):
                    d["time"] = str(d["inspected_at"])[:16]
                else:
                    d["time"] = "N/A"
                result.append(d)
            return {"inspections": result}
    except Exception:
        return {"inspections": []}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/dashboard/stats")
def get_dashboard_stats(scope: str = Query("All"), period: str = Query("This month")):
    """Return KPI stats for the dashboard.

    Period semantics are identical for the fabric and label domains:
      * counts, grade distribution, defect breakdown and average quality are
        limited to the selected period
      * supplier counts are an all-time snapshot
      * the trend is the full monthly history (a chart needs a series)
    """
    period_intervals = {"This week": "7 days", "This month": "1 month", "This quarter": "3 months", "This year": "1 year"}
    interval = period_intervals.get(period, "1 month")
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # ---- suppliers (snapshot, not period filtered) ----
            cur.execute("SELECT COUNT(*) AS total FROM fabric_suppliers")
            fabric_suppliers = int(cur.fetchone()["total"])
            cur.execute("SELECT COUNT(*) AS total FROM label_suppliers")
            label_suppliers = int(cur.fetchone()["total"])

            # ---- shipments received in period ----
            cur.execute("SELECT COUNT(*) AS total FROM fabric_shipments WHERE received_date >= (CURRENT_DATE - %s::interval)::date", (interval,))
            fabric_shipments = int(cur.fetchone()["total"])
            cur.execute("SELECT COUNT(*) AS total FROM label_shipments WHERE received_date >= (CURRENT_DATE - %s::interval)::date", (interval,))
            label_shipments = int(cur.fetchone()["total"])

            # ---- inspections in period ----
            cur.execute("SELECT COUNT(*) AS total FROM fabric_inspections WHERE inspected_at >= NOW() - %s::interval", (interval,))
            fabric_inspections = int(cur.fetchone()["total"])
            cur.execute("SELECT COUNT(*) AS total FROM label_inspections WHERE inspected_at >= NOW() - %s::interval", (interval,))
            label_inspections = int(cur.fetchone()["total"])

            # ---- inspected units in period (fabric rolls / label samples) ----
            cur.execute("SELECT COUNT(*) AS total FROM fabric_rolls WHERE inspection_date >= (CURRENT_DATE - %s::interval)::date", (interval,))
            fabric_rolls = int(cur.fetchone()["total"])
            cur.execute("SELECT COUNT(*) AS total FROM label_samples WHERE captured_at >= NOW() - %s::interval", (interval,))
            label_samples = int(cur.fetchone()["total"])

            # ---- grade distribution in period ----
            cur.execute(
                "SELECT grade, COUNT(*) AS count FROM fabric_inspections "
                "WHERE grade IS NOT NULL AND inspected_at >= NOW() - %s::interval GROUP BY grade",
                (interval,),
            )
            fabric_grade = {"A": 0, "B": 0, "C": 0, "Reject": 0}
            for row in cur.fetchall():
                fabric_grade[row["grade"]] = int(row["count"])

            # Shared rule - see app/quality.py LABEL_GRADE_SQL.
            label_grade_sql = """
                SELECT {grade} AS grade, COUNT(*) AS count
                FROM label_inspections
                WHERE inspected_at >= NOW() - %s::interval
                GROUP BY 1
            """.format(grade=LABEL_GRADE_SQL.format(
                verdict_canonical=LABEL_VERDICT_SQL.format(verdict="verdict"),
                ssim="ssim_score"))
            cur.execute(label_grade_sql, (interval,))
            label_grade = {"A": 0, "B": 0, "C": 0, "Reject": 0}
            for row in cur.fetchall():
                label_grade[row["grade"]] = int(row["count"])

            # ---- average quality in period ----
            # points_per_100_yards is a PENALTY (lower is better). It becomes a
            # 0-100 "higher is better" score through app.quality.quality_from_points,
            # which is the same conversion the supplier watch and the trend use,
            # and the same scale as the label domain's ssim * 100.
            cur.execute(
                "SELECT AVG(points_per_100_yards) AS points FROM fabric_inspections "
                "WHERE points_per_100_yards IS NOT NULL AND inspected_at >= NOW() - %s::interval",
                (interval,),
            )
            fabric_points = cur.fetchone()["points"]
            fabric_quality = quality_from_points(fabric_points) if fabric_points is not None else 0.0

            cur.execute(
                "SELECT ROUND(AVG(ssim_score * 100)::numeric, 1) AS score FROM label_inspections "
                "WHERE ssim_score IS NOT NULL AND inspected_at >= NOW() - %s::interval",
                (interval,),
            )
            label_quality = float(cur.fetchone()["score"] or 0)

            # ---- defect breakdown in period ----
            cur.execute(
                """
                SELECT d.defect_type, COUNT(*) AS count
                FROM fabric_defects d
                JOIN fabric_inspections i ON i.inspection_id = d.inspection_id
                WHERE i.inspected_at >= NOW() - %s::interval
                GROUP BY d.defect_type
                ORDER BY count DESC
                """,
                (interval,),
            )
            fabric_defects = [{"label": r["defect_type"], "value": int(r["count"])} for r in cur.fetchall()]

            cur.execute(
                """
                SELECT d.defect_type, COUNT(*) AS count
                FROM label_defects d
                JOIN label_inspections i ON i.label_inspection_id = d.label_inspection_id
                WHERE i.inspected_at >= NOW() - %s::interval
                GROUP BY d.defect_type
                ORDER BY count DESC
                """,
                (interval,),
            )
            label_defects = [{"label": r["defect_type"], "value": int(r["count"])} for r in cur.fetchall()]

            # ---- monthly trend (full history, drives the chart) ----
            cur.execute(
                "SELECT date_trunc('month', inspected_at) AS month, "
                "       AVG(points_per_100_yards) AS points "
                "FROM fabric_inspections WHERE points_per_100_yards IS NOT NULL "
                "GROUP BY 1 ORDER BY 1"
            )
            fabric_rows = cur.fetchall()
            fabric_trend = [quality_from_points(r["points"]) for r in fabric_rows]
            fabric_trend_months = [str(r["month"])[:7] for r in fabric_rows]

            cur.execute(
                "SELECT date_trunc('month', inspected_at) AS month, "
                "       ROUND(AVG(ssim_score * 100)::numeric, 1) AS score "
                "FROM label_inspections WHERE ssim_score IS NOT NULL "
                "GROUP BY 1 ORDER BY 1"
            )
            label_rows = cur.fetchall()
            label_trend = [float(r["score"] or 0) for r in label_rows]
            label_trend_months = [str(r["month"])[:7] for r in label_rows]

            # Both sides are converted to the same 0-100 "higher is better"
            # scale BEFORE they are averaged. Previously the fabric penalty and
            # the label SSIM percentage were averaged directly, which mixed two
            # incomparable metrics.
            cur.execute(
                """
                SELECT mon, ROUND(AVG(score)::numeric, 1) AS score
                FROM (
                    SELECT date_trunc('month', inspected_at) AS mon,
                           GREATEST(0, 100 - LEAST(points_per_100_yards, 100)) AS score
                    FROM fabric_inspections WHERE points_per_100_yards IS NOT NULL
                    UNION ALL
                    SELECT date_trunc('month', inspected_at) AS mon, ssim_score * 100 AS score
                    FROM label_inspections WHERE ssim_score IS NOT NULL
                ) combined
                GROUP BY mon
                ORDER BY mon
                """
            )
            all_rows = cur.fetchall()
            all_trend = [float(r["score"] or 0) for r in all_rows]
            all_trend_months = [str(r["mon"])[:7] for r in all_rows]

            if scope == "Label":
                total_suppliers = label_suppliers
                total_shipments = label_shipments
                total_inspections = label_inspections
                total_rolls = label_samples
                grade_dist = label_grade
                defect_breakdown = label_defects
                trend = label_trend or [label_quality]
                trend_months = label_trend_months
                avg_quality = label_quality
            elif scope == "All":
                total_suppliers = fabric_suppliers + label_suppliers
                total_shipments = fabric_shipments + label_shipments
                total_inspections = fabric_inspections + label_inspections
                total_rolls = fabric_rolls + label_samples
                grade_dist = {key: fabric_grade[key] + label_grade[key] for key in fabric_grade}
                defect_breakdown = sorted(fabric_defects + label_defects, key=lambda item: item["value"], reverse=True)
                trend = all_trend or [0]
                trend_months = all_trend_months
                # Safe to blend now that both sides are on the same 0-100 scale.
                weighted = fabric_quality * fabric_inspections + label_quality * label_inspections
                avg_quality = round(weighted / total_inspections, 1) if total_inspections else 0
            else:
                total_suppliers = fabric_suppliers
                total_shipments = fabric_shipments
                total_inspections = fabric_inspections
                total_rolls = fabric_rolls
                grade_dist = fabric_grade
                defect_breakdown = fabric_defects
                trend = fabric_trend or [0]
                trend_months = fabric_trend_months
                avg_quality = fabric_quality

            # ---- suppliers needing attention (fabric, label, or both) ----
            if scope == "Label":
                supplier_watch = build_supplier_watch(cur, "Label")
            elif scope == "All":
                supplier_watch = sorted(
                    build_supplier_watch(cur, "Fabric") + build_supplier_watch(cur, "Label"),
                    key=lambda item: item["attention_score"],
                    reverse=True,
                )[:6]
            else:
                supplier_watch = build_supplier_watch(cur, "Fabric")

            # ---- inspection-time rates and the quality target (cost_parameters) ----
            cur.execute(
                """
                SELECT DISTINCT ON (scope) scope, manual_minutes_per_unit,
                       ai_minutes_per_unit, quality_target, currency
                FROM cost_parameters
                WHERE effective_from <= CURRENT_DATE
                ORDER BY scope, effective_from DESC
                """
            )
            rates = {r["scope"]: r for r in cur.fetchall()}
            if scope in rates:
                chosen = rates[scope]
                manual_minutes = float(chosen["manual_minutes_per_unit"])
                ai_minutes = float(chosen["ai_minutes_per_unit"])
                quality_target = float(chosen["quality_target"])
                currency = chosen["currency"]
            elif rates:
                # scope=All: weight each domain's rate by its inspection volume.
                fabric_rate = rates.get("Fabric")
                label_rate = rates.get("Label")
                denom = (fabric_inspections + label_inspections) or 1
                def _blend(key):
                    total = 0.0
                    if fabric_rate is not None:
                        total += float(fabric_rate[key]) * fabric_inspections
                    if label_rate is not None:
                        total += float(label_rate[key]) * label_inspections
                    return round(total / denom, 2)
                manual_minutes = _blend("manual_minutes_per_unit")
                ai_minutes = _blend("ai_minutes_per_unit")
                quality_target = _blend("quality_target")
                currency = (fabric_rate or label_rate)["currency"]
            else:
                manual_minutes = ai_minutes = quality_target = 0.0
                currency = "USD"

            minutes_saved = max(0.0, manual_minutes - ai_minutes)
            labor_hours_saved = round(int(total_inspections) * minutes_saved / 60, 1)

            return {
                "scope": scope,
                "period": period,
                "supplier_watch": supplier_watch,
                "total_suppliers": int(total_suppliers),
                "total_shipments": int(total_shipments),
                "total_inspections": int(total_inspections),
                "total_rolls": int(total_rolls),
                "avg_quality": round(float(avg_quality or 0), 1),
                "grade_distribution": [
                    {"label": "A", "value": grade_dist["A"], "tone": "grade-a"},
                    {"label": "B", "value": grade_dist["B"], "tone": "grade-b"},
                    {"label": "C", "value": grade_dist["C"], "tone": "grade-c"},
                    {"label": "Reject", "value": grade_dist["Reject"], "tone": "grade-r"},
                ],
                "defect_breakdown": defect_breakdown,
                "trend": trend,
                "trend_months": trend_months,
                # Inspection-time rates come from cost_parameters, not from
                # literals here, so the dashboard, the Reports page and the ROI
                # simulator all quote the same minutes.
                "labor_hours_saved": labor_hours_saved,
                "manual_minutes_per_item": manual_minutes,
                "ai_minutes_per_item": ai_minutes,
                "quality_target": quality_target,
                "currency": currency,
            }
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/suppliers/{supplier_id}")
def get_supplier_detail(supplier_id: int):
    """Return a single supplier with shipment count and inspection summary."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM fabric_suppliers WHERE supplier_id = %s",
                (supplier_id,),
            )
            supplier = cur.fetchone()
            if not supplier:
                raise HTTPException(status_code=404, detail="Supplier not found")

            cur.execute(
                "SELECT COUNT(*) AS total FROM fabric_shipments WHERE supplier_id = %s",
                (supplier_id,),
            )
            shipment_count = cur.fetchone()["total"]

            # Get recent inspection grades for heatmap
            cur.execute(
                """
                SELECT i.grade
                FROM fabric_inspections i
                JOIN fabric_rolls fr ON i.roll_id = fr.roll_id
                JOIN fabric_shipments sh ON fr.shipment_id = sh.shipment_id
                WHERE sh.supplier_id = %s AND i.grade IS NOT NULL
                ORDER BY i.inspected_at DESC
                LIMIT 12
                """,
                (supplier_id,),
            )
            grade_rows = cur.fetchall()
            # Only the grades that exist. This used to pad to twelve cells with
            # "a", so a supplier with two inspections displayed ten clean lots
            # that had never been inspected.
            grade_cell = {"A": "a", "B": "b", "C": "c", "Reject": "r"}
            heatmap = [grade_cell.get(row["grade"], "r") for row in grade_rows]

            result = _normalize_row(dict(supplier))
            result["shipment_count"] = int(shipment_count)
            result["heatmap"] = heatmap

            return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error fetching supplier detail")
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.put("/suppliers/{supplier_id}")
def update_supplier(supplier_id: int, payload: Dict[str, Any]):
    """Update supplier details."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM fabric_suppliers WHERE supplier_id = %s",
                (supplier_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Supplier not found")

            updates = []
            values = []
            allowed = ["name", "country", "city", "contact_person", "contact_email", "contact_phone", "supplier_rating"]
            for field in allowed:
                if field in payload:
                    updates.append(f"{field} = %s")
                    values.append(payload[field])

            if not updates:
                raise HTTPException(status_code=400, detail="No valid fields to update")

            values.append(supplier_id)
            cur.execute(
                f"UPDATE fabric_suppliers SET {', '.join(updates)} WHERE supplier_id = %s RETURNING *",
                values,
            )
            updated = cur.fetchone()
            conn.commit()
            return {"message": "Supplier updated", "supplier": _normalize_row(dict(updated))}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="Error updating supplier")
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.post('/suppliers')
def create_supplier(payload: Dict[str, Any]):
    """Register a new fabric supplier.

    supplier_rating is left NULL when the caller does not supply one. It used
    to default to 85, which gave a brand-new supplier with no history a
    respectable-looking rating that nothing had measured. The scorecards
    already render a missing rating as "-".
    """
    rating = payload.get('supplier_rating')
    rating = float(rating) if rating not in (None, "") else None

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO fabric_suppliers
                  (name, country, city, contact_person, contact_email, contact_phone,
                   supplier_rating, supplier_tier, fabric_specialty)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    payload.get('name'), payload.get('country'), payload.get('city'),
                    payload.get('contact_person'), payload.get('contact_email'),
                    payload.get('contact_phone'), rating,
                    payload.get('supplier_tier') or 'Conditional',
                    payload.get('fabric_specialty'),
                ),
            )
            row = cur.fetchone(); conn.commit(); return {'supplier': _normalize_row(dict(row))}
    except Exception:
        conn.rollback()
        raise
    finally: conn.close()

@router.post('/shipments')
def create_shipment(payload: Dict[str, Any]):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO fabric_shipments (supplier_id,shipment_code,shipment_date,received_date,total_rolls,fabric_type,color,sampling_stage,quality_score,notes) VALUES (%s,%s,COALESCE(%s,CURRENT_DATE),%s,%s,%s,%s,COALESCE(%s,'Initial')::sampling_stage_enum,%s,%s) RETURNING *", (payload.get('supplier_id'),payload.get('shipment_code'),payload.get('shipment_date'),payload.get('received_date'),payload.get('total_rolls',1),payload.get('fabric_type'),payload.get('color'),payload.get('sampling_stage'),payload.get('quality_score'),payload.get('notes')))
            row=cur.fetchone(); conn.commit(); return {'shipment': _normalize_row(dict(row))}
    finally: conn.close()

@router.get('/inspections/{inspection_id}')
def inspection_detail(inspection_id: int):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""SELECT i.inspection_id, i.total_images_processed, i.total_defects_found, i.total_penalty_points, i.points_per_100_yards, i.grade, i.model_version, i.status, i.inspected_at, fr.roll_code, fr.roll_length_yards, sh.shipment_code, s.name AS supplier FROM fabric_inspections i JOIN fabric_rolls fr ON fr.roll_id=i.roll_id JOIN fabric_shipments sh ON sh.shipment_id=fr.shipment_id JOIN fabric_suppliers s ON s.supplier_id=sh.supplier_id WHERE i.inspection_id=%s""", (inspection_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail='Inspection not found')
            cur.execute("SELECT defect_id, image_index, defect_type, severity, confidence_score, position_x, position_y FROM fabric_defects WHERE inspection_id=%s ORDER BY defect_id", (inspection_id,))
            defects = [_normalize_row(dict(item)) for item in cur.fetchall()]
            cur.execute("SELECT defect_type, COUNT(*) AS count FROM fabric_defects WHERE inspection_id=%s GROUP BY defect_type ORDER BY count DESC, defect_type", (inspection_id,))
            summary = [{"class": item["defect_type"], "count": int(item["count"])} for item in cur.fetchall()]
            # Report what is stored. This endpoint used to recompute the penalty
            # with the old severity * confidence * 10 formula, echo the penalty
            # as a quality score, and derive status with "points >= 80 is good",
            # which inverted the metric: a grade-A roll at 5 points read as
            # "Rejected" here while the queue showed it Approved.
            result = _normalize_row(dict(row))
            points = float(row.get("points_per_100_yards") or 0)
            result["points_per_100_yards"] = round(points, 2)
            result["quality_score"] = quality_from_points(points)
            result["total_penalty_points"] = _decimal_to_float(row.get("total_penalty_points"))
            result["total_defects_found"] = int(row.get("total_defects_found") or 0)
            result["defects"] = defects
            result["defect_summary"] = summary
            result["grading"] = {
                "metric": "points_per_100_yards",
                "direction": "lower is better",
                "grade_from_points": grade_from_points(points),
            }
            return result
    finally:
        conn.close()
