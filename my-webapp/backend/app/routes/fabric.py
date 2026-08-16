import base64
import os
from typing import Any, Dict, List

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
        model = _get_model()
        results = model(image_bgr, conf=0.25, imgsz=640, verbose=False)
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
        "model_version": "heuristic-fabric-inspection-v1",
        "status": "ready",
    }
