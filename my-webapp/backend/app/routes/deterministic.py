import os
import uuid
import cv2
import numpy as np
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from app.pipeline import LabelInspector, StructuralGate


router = APIRouter(
    prefix="/api/deterministic",
    tags=["Deterministic"]
)


# --------------------------------------------------
# Configuration
# --------------------------------------------------

REPORT_DIR = "app/generated_reports"

os.makedirs(REPORT_DIR, exist_ok=True)


# --------------------------------------------------
# Image Loading
# --------------------------------------------------

def load_image(file_bytes: bytes, max_dim=700):
    """
    Convert uploaded image bytes into an OpenCV BGR image.

    The image is resized if its largest dimension exceeds
    max_dim.
    """

    image_array = np.frombuffer(file_bytes, dtype=np.uint8)

    img = cv2.imdecode(
        image_array,
        cv2.IMREAD_COLOR
    )

    if img is None:
        raise ValueError("Could not decode image.")

    h, w = img.shape[:2]

    scale = max_dim / max(h, w)

    if scale < 1:
        img = cv2.resize(
            img,
            (
                int(w * scale),
                int(h * scale)
            )
        )

    return img


# --------------------------------------------------
# Target Size Estimation
# --------------------------------------------------

def estimate_target_size(golden_bgr):
    """
    Estimate target size directly from the golden image
    dimensions.

    Normalize so width <= height, matching
    StructuralGate.inspect().
    """

    h, w = golden_bgr.shape[:2]

    width = min(w, h)
    height = max(w, h)

    return (width, height)


# --------------------------------------------------
# Visualization
# --------------------------------------------------

def visualize(
    set_name,
    golden_bgr,
    candidate_bgr,
    report,
    output_path
):
    """
    Generate the 2x3 diagnostic visualization.

    The visualization contains:

    1. Golden reference
    2. Candidate + Gate 1 bounding box
    3. Gate 1 binary mask
    4. Registered candidate
    5. SSIM anomaly map
    6. Hotspots
    """

    fig, axes = plt.subplots(
        2,
        3,
        figsize=(15, 9)
    )

    fig.suptitle(
        f"Label Inspection — {set_name} — "
        f"verdict: {report.verdict}",
        fontsize=14
    )

    def show(
        ax,
        img_bgr,
        title,
        cmap=None
    ):

        if img_bgr is None:
            ax.set_title(
                title + " (n/a)"
            )
            ax.axis("off")
            return

        if cmap:
            ax.imshow(
                img_bgr,
                cmap=cmap
            )
        else:
            ax.imshow(
                cv2.cvtColor(
                    img_bgr,
                    cv2.COLOR_BGR2RGB
                )
            )

        ax.set_title(title)
        ax.axis("off")

    # ----------------------------------------------
    # Golden
    # ----------------------------------------------

    show(
        axes[0, 0],
        golden_bgr,
        "Golden Reference"
    )

    # ----------------------------------------------
    # Candidate + Gate 1 box
    # ----------------------------------------------

    cand_annot = candidate_bgr.copy()

    if report.gate1.box_points is not None:

        cv2.drawContours(
            cand_annot,
            [
                np.int32(
                    report.gate1.box_points
                )
            ],
            0,
            (0, 255, 0),
            2
        )

    if report.gate1.angle_deg is not None:

        gate1_title = (
            "Candidate + Gate1 box\n"
            f"skew={report.gate1.angle_deg:.2f} deg"
        )

    else:

        gate1_title = "Candidate + Gate1 box"

    show(
        axes[0, 1],
        cand_annot,
        gate1_title
    )

    # ----------------------------------------------
    # Gate 1 mask
    # ----------------------------------------------

    show(
        axes[0, 2],
        report.gate1.mask,
        "Gate 1 binary mask",
        cmap="gray"
    )

    # ----------------------------------------------
    # Gate 2
    # ----------------------------------------------

    if report.gate2 is not None:

        # Registered candidate

        show(
            axes[1, 0],
            report.gate2.aligned_candidate,
            "Aligned candidate (registered)"
        )

        # SSIM anomaly map

        ssim_vis = (
            (1 - report.gate2.ssim_map)
            * 255
        ).clip(
            0,
            255
        ).astype(
            np.uint8
        )

        show(
            axes[1, 1],
            ssim_vis,
            f"SSIM anomaly map\n"
            f"score={report.gate2.ssim_score:.3f}",
            cmap="inferno"
        )

        # Hotspots

        annotated = (
            report.gate2.aligned_candidate.copy()
        )

        for hs in report.gate2.hotspots:

            x, y, w, h = hs.bbox

            cv2.rectangle(
                annotated,
                (x, y),
                (x + w, y + h),
                (0, 0, 255),
                2
            )

            label = (
                f"{hs.defect_class} "
                f"({hs.confidence:.2f})"
                if hs.defect_class
                else "?"
            )

            cv2.putText(
                annotated,
                label,
                (x, max(0, y - 5)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (0, 0, 255),
                1,
                cv2.LINE_AA
            )

        show(
            axes[1, 2],
            annotated,
            f"Hot spots "
            f"({len(report.gate2.hotspots)})"
        )

    else:

        for ax in axes[1, :]:

            ax.axis("off")

            ax.set_title(
                "Gate 2 skipped "
                "(Gate 1 rejected)"
            )

    plt.tight_layout()

    plt.savefig(
        output_path,
        dpi=130,
        bbox_inches="tight"
    )

    plt.close(fig)


# --------------------------------------------------
# Convert report to JSON
# --------------------------------------------------

def create_result(report):

    result = {
        "verdict": str(report.verdict),
        "summary": report.summary(),
        "gate1": {},
        "gate2": None
    }

    # ----------------------------------------------
    # Gate 1
    # ----------------------------------------------

    gate1 = report.gate1

    result["gate1"] = {
        "angle_deg": (
            float(gate1.angle_deg)
            if gate1.angle_deg is not None
            else None
        ),

        "box_points": (
            np.asarray(
                gate1.box_points
            ).tolist()
            if gate1.box_points is not None
            else None
        )
    }

    # ----------------------------------------------
    # Gate 2
    # ----------------------------------------------

    if report.gate2 is not None:

        gate2 = report.gate2

        hotspots = []

        for hs in gate2.hotspots:

            hotspots.append(
                {
                    "bbox": list(hs.bbox),

                    "defect_class": (
                        hs.defect_class
                        if hs.defect_class
                        else None
                    ),

                    "confidence": (
                        float(hs.confidence)
                    )
                }
            )

        result["gate2"] = {
            "ssim_score": float(
                gate2.ssim_score
            ),

            "hotspot_count": len(
                gate2.hotspots
            ),

            "hotspots": hotspots
        }

    return result


# --------------------------------------------------
# Main Inspection API
# --------------------------------------------------

@router.post("/inspect")
async def inspect_label(
    golden: UploadFile = File(...),
    candidate: UploadFile = File(...)
):

    try:

        # ------------------------------------------
        # Read uploaded files
        # ------------------------------------------

        golden_bytes = await golden.read()

        candidate_bytes = await candidate.read()

        # ------------------------------------------
        # Convert to OpenCV images
        # ------------------------------------------

        golden_bgr = load_image(
            golden_bytes
        )

        candidate_bgr = load_image(
            candidate_bytes
        )

        # ------------------------------------------
        # Estimate target size
        # ------------------------------------------

        target_size = estimate_target_size(
            golden_bgr
        )

        # ------------------------------------------
        # Create inspector
        # ------------------------------------------

        inspector = LabelInspector(

            target_size_px=target_size,

            gate1_kwargs={
                "size_tolerance_pct": 0.35,
                "max_skew_deg": 6.0
            },

            gate2_kwargs={

                "ssim_defect_threshold": 0.55,

                "diff_noise_floor": 28,

                "min_hotspot_area": 25,

                "overall_ssim_reject_threshold": 0.80
            }
        )

        # ------------------------------------------
        # Run pipeline
        # ------------------------------------------

        report = inspector.inspect(
            golden_bgr,
            candidate_bgr
        )

        # ------------------------------------------
        # Generate unique report filename
        # ------------------------------------------

        report_id = str(
            uuid.uuid4()
        )

        output_filename = (
            f"{report_id}.png"
        )

        output_path = os.path.join(
            REPORT_DIR,
            output_filename
        )

        # ------------------------------------------
        # Generate visualization
        # ------------------------------------------

        visualize(
            "Deterministic Inspection",
            golden_bgr,
            candidate_bgr,
            report,
            output_path
        )

        # ------------------------------------------
        # Convert report to JSON
        # ------------------------------------------

        result = create_result(
            report
        )

        result["report_id"] = report_id

        result["visualization_url"] = (
            f"/api/deterministic/report/"
            f"{report_id}"
        )

        result["target_size"] = {
            "width": target_size[0],
            "height": target_size[1]
        }

        return result

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )


# --------------------------------------------------
# Report Image API
# --------------------------------------------------

@router.get("/report/{report_id}")
def get_report(report_id: str):

    path = os.path.join(
        REPORT_DIR,
        f"{report_id}.png"
    )

    if not os.path.exists(path):

        raise HTTPException(
            status_code=404,
            detail="Report not found."
        )

    return FileResponse(
        path,
        media_type="image/png"
    )