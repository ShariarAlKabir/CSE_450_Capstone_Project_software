import base64
import os
from decimal import Decimal
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.db import get_db

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

SEVERITY_MAP = {
    "Hole": 4,
    "Yarn missing": 4,
    "Oil Spot": 3,
    "Contamination": 3,
    "Needle mark": 2,
    "Setup": 2,
    "Miss loop": 1,
}


def _grade_from_points(points_per_100: float) -> str:
    if points_per_100 <= 10:
        return "A"
    if points_per_100 <= 20:
        return "B"
    if points_per_100 <= 30:
        return "C"
    return "Reject"


def _calculate_points_per_100(total_penalty_points: float, roll_length_yards: float) -> float:
    if roll_length_yards <= 0:
        return 0.0
    return round((total_penalty_points * 100) / roll_length_yards, 2)


def _get_severity_from_class_name(class_name: str) -> int:
    return SEVERITY_MAP.get(class_name, 1)


def _generate_roll_code(cur, shipment_id: int) -> str:
    cur.execute(
        "SELECT shipment_code FROM shipments WHERE shipment_id = %s",
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


def _fallback_suppliers() -> List[Dict[str, Any]]:
    return [
        {"supplier_id": 1, "name": "Bangladesh Textile Co.", "country": "Bangladesh", "city": "Dhaka"},
        {"supplier_id": 2, "name": "Apex Fabric Ltd.", "country": "Bangladesh", "city": "Chattogram"},
    ]


def _fallback_shipments() -> List[Dict[str, Any]]:
    return [
        {"shipment_id": 1, "supplier_id": 1, "shipment_code": "BT-2025-001", "fabric_type": "Denim", "color": "Indigo"},
        {"shipment_id": 2, "supplier_id": 2, "shipment_code": "AF-2025-210", "fabric_type": "Cotton", "color": "White"},
    ]


@router.get("/health")
def health():
    return {"status": "ok", "message": "Fabric inspection API is running"}


@router.get("/suppliers")
def get_suppliers():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT supplier_id, name, country, city, contact_person, contact_email, contact_phone, supplier_rating FROM suppliers ORDER BY name"
            )
            rows = cur.fetchall()
            return {"suppliers": [dict(row) for row in rows]}
    except Exception:
        return {"suppliers": _fallback_suppliers()}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/shipments")
def get_shipments():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT shipment_id, supplier_id, shipment_code, fabric_type, color, sampling_stage, quality_score FROM shipments ORDER BY shipment_id DESC"
            )
            rows = cur.fetchall()
            return {"shipments": [dict(row) for row in rows]}
    except Exception:
        return {"shipments": _fallback_shipments()}
    finally:
        try:
            conn.close()
        except Exception:
            pass


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


def _analyze_fabric_image(image_bgr: np.ndarray) -> Dict[str, Any]:
    try:
        image_bgr = _resize_for_inference(image_bgr, max_side=1024)
        model = _get_model()
        results = model(image_bgr, conf=0.25, imgsz=512, verbose=False)
        result = results[0]

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
                    "severity": SEVERITY_MAP.get(class_name, 1),
                    "confidence_score": round(confidence, 3),
                    "position_x": round(float((x1 + x2) / 2.0), 4),
                    "position_y": round(float((y1 + y2) / 2.0), 4),
                    "bbox": [round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)],
                }
            )

        total_defects = len(detections)
        total_penalty_points = sum(item["severity"] * (item["confidence_score"] * 10) for item in detections)
        points_per_100 = round((total_penalty_points * 100) / max(1.0, image_bgr.shape[1] / 10.0), 2)
        grade = _grade_from_points(points_per_100)

        annotated_image = _annotate_image(image_bgr, result.boxes)

        return {
            "total_images_processed": 1,
            "total_defects_found": total_defects,
            "total_penalty_points": round(float(total_penalty_points), 2),
            "points_per_100_yards": points_per_100,
            "grade": grade,
            "status": "Approved" if grade == "A" else "Rejected",
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
                    "severity": SEVERITY_MAP.get(defect_name, 1),
                    "confidence_score": round(float(confidence), 3),
                    "position_x": round(float(x + w / 2), 4),
                    "position_y": round(float(y + h / 2), 4),
                }
            )

        total_defects = len(defects)
        total_penalty_points = sum(item["severity"] * (item["confidence_score"] * 10) for item in defects)
        points_per_100 = round((total_penalty_points * 100) / max(1.0, image_bgr.shape[1] / 10.0), 2)
        grade = _grade_from_points(points_per_100)

        return {
            "total_images_processed": 1,
            "total_defects_found": total_defects,
            "total_penalty_points": round(float(total_penalty_points), 2),
            "points_per_100_yards": points_per_100,
            "grade": grade,
            "status": "Approved" if grade == "A" else "Rejected",
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
            cur.execute("SELECT 1 FROM shipments WHERE shipment_id = %s", (payload.get("shipment_id"),))
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

            total_penalty_points = float(payload.get("total_penalty_points", 0.0))
            points_per_100 = float(payload.get("points_per_100_yards", 0.0))
            grade = payload.get("grade") or _grade_from_points(points_per_100)
            status = payload.get("status") or "Pending Review"

            cur.execute(
                """
                INSERT INTO inspections
                (roll_id, total_images_processed, total_defects_found, total_penalty_points, points_per_100_yards, grade, model_version, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    roll["roll_id"],
                    payload.get("total_images_processed", 0),
                    payload.get("total_defects_found", 0),
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
                        INSERT INTO defects
                        (inspection_id, image_index, defect_type, severity, confidence_score, position_x, position_y)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            inspection["inspection_id"],
                            image_index,
                            det.get("class_name"),
                            det.get("severity", 1),
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
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    contents = await file.read()
    image_array = np.frombuffer(contents, dtype=np.uint8)
    image_bgr = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode uploaded image")

    result = _analyze_fabric_image(image_bgr)
    result["supplier_id"] = supplier_id
    result["shipment_id"] = shipment_id
    result["roll_code"] = roll_code
    return result


@router.get("/summary")
def summary():
    return {
        "fabric_types": ["Cotton", "Denim", "Knitted"],
        "model_version": MODEL_VERSION,
        "status": "ready",
    }
