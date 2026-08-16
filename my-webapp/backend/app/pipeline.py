from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import matplotlib
import matplotlib.pyplot as plt
import numpy as np
from skimage.metrics import structural_similarity as ssim

matplotlib.use("Agg")


@dataclass
class Gate1Result:
    passed: bool
    reasons: List[str] = field(default_factory=list)
    width_px: Optional[float] = None
    height_px: Optional[float] = None
    angle_deg: Optional[float] = None
    num_components: Optional[int] = None
    mask: Optional[np.ndarray] = None
    box_points: Optional[np.ndarray] = None


@dataclass
class HotSpot:
    bbox: Tuple[int, int, int, int]
    area: int
    crop: np.ndarray
    defect_class: Optional[str] = None
    confidence: Optional[float] = None


@dataclass
class Gate2Result:
    passed: bool
    reasons: List[str] = field(default_factory=list)
    aligned_candidate: Optional[np.ndarray] = None
    ssim_score: Optional[float] = None
    ssim_map: Optional[np.ndarray] = None
    diff_map: Optional[np.ndarray] = None
    combined_defect_mask: Optional[np.ndarray] = None
    hotspots: List[HotSpot] = field(default_factory=list)
    homography: Optional[np.ndarray] = None
    num_good_matches: Optional[int] = None
    hotspot_area_frac: Optional[float] = None
    max_hotspot_area_frac: Optional[float] = None
    severity_frac: Optional[float] = None
    diff_severity_frac: Optional[float] = None


@dataclass
class InspectionReport:
    verdict: str
    gate1: Gate1Result
    gate2: Optional[Gate2Result] = None

    def summary(self) -> str:
        lines = [f"VERDICT: {self.verdict}"]
        lines.append("-- Gate 1 (Structural) --")
        lines.append(f"  passed: {self.gate1.passed}")
        if self.gate1.width_px is not None:
            lines.append(f"  size(px): {self.gate1.width_px:.1f} x {self.gate1.height_px:.1f}")
        if self.gate1.angle_deg is not None:
            lines.append(f"  skew angle: {self.gate1.angle_deg:.2f} deg")
        if self.gate1.num_components is not None:
            lines.append(f"  components found: {self.gate1.num_components}")
        for r in self.gate1.reasons:
            lines.append(f"  - {r}")
        if self.gate2 is not None:
            lines.append("-- Gate 2 (Content) --")
            lines.append(f"  passed: {self.gate2.passed}")
            if self.gate2.ssim_score is not None:
                lines.append(f"  SSIM score: {self.gate2.ssim_score:.4f}")
            if self.gate2.num_good_matches is not None:
                lines.append(f"  registration matches used: {self.gate2.num_good_matches}")
            lines.append(f"  hot spots found: {len(self.gate2.hotspots)}")
            for i, hs in enumerate(self.gate2.hotspots):
                cls = hs.defect_class or "unclassified"
                conf = f"{hs.confidence:.2f}" if hs.confidence is not None else "n/a"
                lines.append(f"    [{i}] bbox={hs.bbox} area={hs.area} class={cls} conf={conf}")
        return "\n".join(lines)


class StructuralGate:
    def __init__(
        self,
        target_size_px: Tuple[float, float],
        size_tolerance_pct: float = 0.12,
        max_skew_deg: float = 4.0,
        min_area_frac: float = 0.05,
    ):
        self.target_w, self.target_h = target_size_px
        self.size_tolerance_pct = size_tolerance_pct
        self.max_skew_deg = max_skew_deg
        self.min_area_frac = min_area_frac

    @staticmethod
    def _binarize(gray: np.ndarray) -> np.ndarray:
        _, th1 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        th2 = cv2.bitwise_not(th1)

        def largest_component_frac(mask):
            n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
            if n <= 1:
                return 0.0
            areas = stats[1:, cv2.CC_STAT_AREA]
            return areas.max() / mask.size

        f1, f2 = largest_component_frac(th1), largest_component_frac(th2)
        chosen = th1 if 0.05 < f1 and f1 >= f2 else th2
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        chosen = cv2.morphologyEx(chosen, cv2.MORPH_CLOSE, kernel, iterations=2)
        chosen = cv2.morphologyEx(chosen, cv2.MORPH_OPEN, kernel, iterations=1)
        return chosen

    def inspect(self, image_bgr: np.ndarray) -> Gate1Result:
        reasons: List[str] = []
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        mask = self._binarize(gray)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return Gate1Result(passed=False, reasons=["No label contour detected."], mask=mask)

        img_area = image_bgr.shape[0] * image_bgr.shape[1]
        significant = [c for c in contours if cv2.contourArea(c) > self.min_area_frac * img_area]

        num_components = len(significant)
        if num_components == 0:
            return Gate1Result(passed=False, reasons=["Label region too small / not found."], mask=mask)
        if num_components > 1:
            areas = sorted([cv2.contourArea(c) for c in significant], reverse=True)
            if areas[1] > 0.5 * areas[0]:
                reasons.append(
                    f"Continuous ribbon / uncut units detected ({num_components} "
                    f"comparable-sized components; expected a single separated label)."
                )

        main_contour = max(significant, key=cv2.contourArea)
        rect = cv2.minAreaRect(main_contour)
        (rw, rh) = rect[1]
        angle = rect[2]
        box_points = cv2.boxPoints(rect)

        skew = angle % 90
        skew = min(skew, 90 - skew)

        width_px, height_px = min(rw, rh), max(rw, rh)

        if skew > self.max_skew_deg:
            reasons.append(f"Slanted cut detected: corner skew {skew:.2f} deg (tolerance {self.max_skew_deg} deg).")

        w_lo = self.target_w * (1 - self.size_tolerance_pct)
        w_hi = self.target_w * (1 + self.size_tolerance_pct)
        h_lo = self.target_h * (1 - self.size_tolerance_pct)
        h_hi = self.target_h * (1 + self.size_tolerance_pct)

        if not (w_lo <= width_px <= w_hi):
            reasons.append(
                f"Width out of spec: {width_px:.1f}px not in [{w_lo:.1f}, {w_hi:.1f}]px (chopped/oversized unit)."
            )
        if not (h_lo <= height_px <= h_hi):
            reasons.append(
                f"Height out of spec: {height_px:.1f}px not in [{h_lo:.1f}, {h_hi:.1f}]px (chopped/oversized unit)."
            )

        passed = len(reasons) == 0
        return Gate1Result(
            passed=passed,
            reasons=reasons,
            width_px=width_px,
            height_px=height_px,
            angle_deg=skew,
            num_components=num_components,
            mask=mask,
            box_points=box_points,
        )


class ContentGate:
    def __init__(
        self,
        ssim_win_size: int = 7,
        ssim_defect_threshold: float = 0.55,
        diff_noise_floor: int = 28,
        min_hotspot_area: int = 40,
        overall_ssim_reject_threshold: float = 0.75,
        min_good_matches: int = 8,
        orb_features: int = 3000,
        severity_frac_reject_threshold: float = 0.15,
        max_hotspot_frac_reject_threshold: float = 0.45,
        diff_severity_frac_reject_threshold: float = 0.05,
    ):
        self.ssim_win_size = ssim_win_size
        self.ssim_defect_threshold = ssim_defect_threshold
        self.diff_noise_floor = diff_noise_floor
        self.min_hotspot_area = min_hotspot_area
        self.overall_ssim_reject_threshold = overall_ssim_reject_threshold
        self.min_good_matches = min_good_matches
        self.severity_frac_reject_threshold = severity_frac_reject_threshold
        self.max_hotspot_frac_reject_threshold = max_hotspot_frac_reject_threshold
        self.diff_severity_frac_reject_threshold = diff_severity_frac_reject_threshold
        self.orb = cv2.ORB_create(nfeatures=orb_features)

    @staticmethod
    def _foreground_mask(gray: np.ndarray) -> np.ndarray:
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, th = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if (th > 0).mean() > 0.6:
            th = cv2.bitwise_not(th)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        th = cv2.dilate(th, kernel, iterations=2)
        return th

    @staticmethod
    def _is_sane_homography(H: np.ndarray, w: int, h: int) -> bool:
        if H is None or not np.all(np.isfinite(H)):
            return False
        corners = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
        try:
            warped = cv2.perspectiveTransform(corners, H).reshape(-1, 2)
        except cv2.error:
            return False
        if not np.all(np.isfinite(warped)):
            return False
        area = cv2.contourArea(warped.astype(np.float32))
        orig_area = w * h
        if area < 0.25 * orig_area or area > 4.0 * orig_area:
            return False
        return True

    def register(self, golden_gray: np.ndarray, candidate_gray: np.ndarray):
        h, w = golden_gray.shape[:2]

        golden_fg = self._foreground_mask(golden_gray)
        cand_fg = self._foreground_mask(candidate_gray)

        kp1, des1 = self.orb.detectAndCompute(golden_gray, golden_fg)
        kp2, des2 = self.orb.detectAndCompute(candidate_gray, cand_fg)

        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            return None, 0

        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        matches = bf.knnMatch(des1, des2, k=2)

        good = []
        for m_n in matches:
            if len(m_n) != 2:
                continue
            m, n = m_n
            if m.distance < 0.75 * n.distance:
                good.append(m)

        if len(good) < self.min_good_matches:
            return None, len(good)

        src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

        A, _ = cv2.estimateAffinePartial2D(dst_pts, src_pts, method=cv2.RANSAC, ransacReprojThreshold=5.0)
        H_affine = np.vstack([A, [0, 0, 1]]).astype(np.float64) if A is not None else None

        H_proj, proj_inlier_mask = cv2.findHomography(dst_pts, src_pts, cv2.RANSAC, 5.0)
        num_inliers = int(proj_inlier_mask.sum()) if proj_inlier_mask is not None else 0
        inlier_ratio = num_inliers / len(good) if good else 0.0

        use_projective = (
            H_proj is not None
            and self._is_sane_homography(H_proj, w, h)
            and num_inliers >= 40
            and inlier_ratio >= 0.6
        )

        if use_projective:
            return H_proj, len(good)
        if H_affine is not None:
            return H_affine, len(good)
        if H_proj is not None and self._is_sane_homography(H_proj, w, h):
            return H_proj, len(good)
        return None, len(good)

    @staticmethod
    def _to_gray_equalized(img_bgr: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        return clahe.apply(gray)

    @staticmethod
    def _match_illumination(reference_gray: np.ndarray, target_gray: np.ndarray) -> np.ndarray:
        from skimage.exposure import match_histograms

        matched = match_histograms(target_gray, reference_gray)
        return matched.astype(np.uint8)

    def _ssim_map(self, golden_gray: np.ndarray, aligned_gray: np.ndarray):
        score, full_map = ssim(golden_gray, aligned_gray, win_size=self.ssim_win_size, full=True)
        return score, full_map

    def _diff_map(self, golden_gray: np.ndarray, aligned_gray: np.ndarray):
        diff = cv2.absdiff(golden_gray, aligned_gray)
        _, thresh = cv2.threshold(diff, self.diff_noise_floor, 255, cv2.THRESH_BINARY)
        return diff, thresh

    @staticmethod
    def _foreground_area(mask: np.ndarray) -> int:
        return int(np.count_nonzero(mask))

    def inspect(self, golden_bgr: np.ndarray, candidate_bgr: np.ndarray) -> Gate2Result:
        reasons: List[str] = []

        golden_gray_raw = cv2.cvtColor(golden_bgr, cv2.COLOR_BGR2GRAY)
        cand_gray_raw = cv2.cvtColor(candidate_bgr, cv2.COLOR_BGR2GRAY)

        H, n_matches = self.register(golden_gray_raw, cand_gray_raw)
        h, w = golden_bgr.shape[:2]

        if H is None:
            reasons.append(f"Feature-based registration failed (matches={n_matches}); falling back to direct resize alignment.")
            aligned_bgr = cv2.resize(candidate_bgr, (w, h))
        else:
            aligned_bgr = cv2.warpPerspective(candidate_bgr, H, (w, h))

        golden_gray = self._to_gray_equalized(golden_bgr)
        aligned_gray = self._to_gray_equalized(aligned_bgr)
        aligned_gray = self._match_illumination(golden_gray, aligned_gray)

        _, golden_fg = cv2.threshold(golden_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        golden_fg_frac = (golden_fg > 0).mean()
        if golden_fg_frac > 0.5:
            golden_fg = cv2.bitwise_not(golden_fg)

        _, aligned_fg = cv2.threshold(aligned_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        aligned_fg_frac = (aligned_fg > 0).mean()
        if aligned_fg_frac > 0.5:
            aligned_fg = cv2.bitwise_not(aligned_fg)

        fg_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        golden_fg = cv2.dilate(golden_fg, fg_kernel, iterations=2)
        aligned_fg = cv2.dilate(aligned_fg, fg_kernel, iterations=2)
        comparison_mask = cv2.bitwise_and(golden_fg, aligned_fg)
        if self._foreground_area(comparison_mask) == 0:
            comparison_mask = golden_fg

        mask_for_ssim = cv2.erode(
            comparison_mask,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
            iterations=1,
        )
        if self._foreground_area(mask_for_ssim) == 0:
            mask_for_ssim = comparison_mask

        masked_golden = golden_gray.copy()
        masked_aligned = aligned_gray.copy()
        masked_aligned[mask_for_ssim == 0] = masked_golden[mask_for_ssim == 0]

        masked_golden = cv2.GaussianBlur(masked_golden, (3, 3), 0)
        masked_aligned = cv2.GaussianBlur(masked_aligned, (3, 3), 0)

        ssim_score, ssim_map = self._ssim_map(masked_golden, masked_aligned)
        ssim_map = ssim_map.astype(np.float32)
        ssim_map[mask_for_ssim == 0] = 1.0

        diff_map, diff_thresh = self._diff_map(golden_gray, aligned_gray)

        ssim_defect_mask = ((ssim_map < self.ssim_defect_threshold) * 255).astype(np.uint8)
        step1_or = cv2.bitwise_or(ssim_defect_mask, diff_thresh)
        step2_and = cv2.bitwise_and(step1_or, comparison_mask)

        kernel3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        step3_open = cv2.morphologyEx(step2_and, cv2.MORPH_OPEN, kernel3)
        kernel9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        combined = cv2.morphologyEx(step3_open, cv2.MORPH_CLOSE, kernel9, iterations=2)

        contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        hotspots: List[HotSpot] = []
        for c in contours:
            area = cv2.contourArea(c)
            if area < self.min_hotspot_area:
                continue
            x, y, ww, hh = cv2.boundingRect(c)
            pad = 6
            x0, y0 = max(0, x - pad), max(0, y - pad)
            x1, y1 = min(w, x + ww + pad), min(h, y + hh + pad)
            crop = aligned_bgr[y0:y1, x0:x1].copy()
            hotspots.append(HotSpot(bbox=(x0, y0, x1 - x0, y1 - y0), area=int(area), crop=crop))

        hotspots.sort(key=lambda hs: hs.area, reverse=True)

        hotspot_area = sum(hs.area for hs in hotspots)
        reject_hotspot_area = max(self.min_hotspot_area * 3, int(0.01 * self._foreground_area(comparison_mask)))
        high_ssim_hotspot_count = 10

        fg_area = max(1, self._foreground_area(comparison_mask))
        weighted_severity = 0.0
        diff_weighted_severity = 0.0
        max_hotspot_area = 0
        for hs in hotspots:
            x, y, ww, hh = hs.bbox
            local_ssim = ssim_map[y:y + hh, x:x + ww]
            local_diff = diff_map[y:y + hh, x:x + ww]
            severity_weight = max(0.0, 1.0 - float(local_ssim.mean()))
            diff_weight = float(local_diff.mean()) / 255.0
            weighted_severity += hs.area * severity_weight
            diff_weighted_severity += hs.area * diff_weight
            max_hotspot_area = max(max_hotspot_area, hs.area)

        severity_frac = weighted_severity / fg_area
        diff_severity_frac = diff_weighted_severity / fg_area
        max_hotspot_frac = max_hotspot_area / fg_area
        hotspot_area_frac = hotspot_area / fg_area

        if ssim_score < self.overall_ssim_reject_threshold:
            if hotspot_area >= reject_hotspot_area:
                reasons.append(
                    f"Overall SSIM {ssim_score:.3f} below threshold {self.overall_ssim_reject_threshold} with {hotspot_area}px of hotspot evidence — print content does not match the golden reference closely enough."
                )
            else:
                reasons.append(
                    f"Overall SSIM {ssim_score:.3f} is below threshold, but hotspot evidence is too small ({hotspot_area}px < {reject_hotspot_area}px) to reject."
                )
        elif len(hotspots) >= high_ssim_hotspot_count:
            reasons.append(f"High-SSIM sample still has {len(hotspots)} hot spots — likely a real defect cluster.")

        severity_reject = severity_frac >= self.severity_frac_reject_threshold
        diff_severity_reject = diff_severity_frac >= self.diff_severity_frac_reject_threshold
        max_hotspot_reject = max_hotspot_frac >= self.max_hotspot_frac_reject_threshold
        if severity_reject or max_hotspot_reject:
            reasons.append(
                f"Localized textured defect evidence: severity_frac={severity_frac:.3f} (threshold {self.severity_frac_reject_threshold}), max_hotspot_frac={max_hotspot_frac:.3f} (threshold {self.max_hotspot_frac_reject_threshold}) — a concentrated, structurally dissimilar region was found even though global SSIM/hotspot-count stayed in the 'clean-looking' range."
            )
        if diff_severity_reject:
            reasons.append(
                f"Localized flat/tonal defect evidence: diff_severity_frac={diff_severity_frac:.3f} (threshold {self.diff_severity_frac_reject_threshold}) — a concentrated region with a large raw pixel-value mismatch was found."
            )
        if hotspots:
            reasons.append(f"{len(hotspots)} hot spot(s) require classification.")

        passed = not (
            (ssim_score < self.overall_ssim_reject_threshold and hotspot_area >= reject_hotspot_area)
            or (len(hotspots) >= high_ssim_hotspot_count)
            or severity_reject
            or max_hotspot_reject
            or diff_severity_reject
        )

        return Gate2Result(
            passed=passed,
            reasons=reasons,
            aligned_candidate=aligned_bgr,
            ssim_score=float(ssim_score),
            ssim_map=ssim_map,
            diff_map=diff_map,
            combined_defect_mask=combined,
            hotspots=hotspots,
            homography=H,
            num_good_matches=n_matches,
            hotspot_area_frac=float(hotspot_area_frac),
            max_hotspot_area_frac=float(max_hotspot_frac),
            severity_frac=float(severity_frac),
            diff_severity_frac=float(diff_severity_frac),
        )


DEFAULT_DEFECT_CLASSES = [
    "Ink Bleed",
    "Missing Stitch",
    "Lamination Scuff",
    "Text/Number Mismatch",
    "Blur",
]


class HeuristicHotSpotClassifier:
    def __init__(self, classes: Optional[List[str]] = None):
        self.classes = classes or DEFAULT_DEFECT_CLASSES

    @staticmethod
    def _color_stats(crop_bgr: np.ndarray):
        hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
        sat_mean = hsv[..., 1].mean()
        val_std = hsv[..., 2].std()
        return sat_mean, val_std

    @staticmethod
    def _edge_density(crop_bgr: np.ndarray) -> float:
        gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        return edges.mean() / 255.0

    def classify(self, hotspot: HotSpot, golden_crop: Optional[np.ndarray] = None):
        crop = hotspot.crop
        if crop.size == 0:
            return "Unclassified", 0.0

        sat_mean, val_std = self._color_stats(crop)
        edge_density = self._edge_density(crop)
        h, w = crop.shape[:2]
        aspect = w / max(h, 1)

        if sat_mean > 60 and val_std > 45:
            return "Ink Bleed", 0.55
        if edge_density > 0.18 and 0.4 < aspect < 2.5:
            return "Text/Number Mismatch", 0.55
        if val_std < 15 and edge_density < 0.05:
            return "Lamination Scuff", 0.5
        if edge_density < 0.08:
            return "Missing Stitch", 0.45
        return "Blur", 0.4


class CNNHotSpotClassifier:
    def __init__(self, classes: Optional[List[str]] = None, weights_path: Optional[str] = None, device: str = "cpu"):
        import torch
        import torch.nn as nn
        from torchvision import models, transforms

        self.torch = torch
        self.device = device
        self.classes = classes or DEFAULT_DEFECT_CLASSES

        backbone = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
        backbone.classifier[1] = nn.Linear(backbone.last_channel, len(self.classes))
        self.model = backbone.to(device).eval()

        if weights_path:
            state = torch.load(weights_path, map_location=device)
            self.model.load_state_dict(state)

        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

    def classify(self, hotspot: HotSpot, golden_crop: Optional[np.ndarray] = None):
        crop_rgb = cv2.cvtColor(hotspot.crop, cv2.COLOR_BGR2RGB)
        tensor = self.transform(crop_rgb).unsqueeze(0).to(self.device)
        with self.torch.no_grad():
            logits = self.model(tensor)
            probs = self.torch.softmax(logits, dim=1)[0]
            conf, idx = probs.max(dim=0)
        return self.classes[int(idx)], float(conf)


class LabelInspector:
    def __init__(
        self,
        target_size_px: Tuple[float, float],
        gate1_kwargs: Optional[dict] = None,
        gate2_kwargs: Optional[dict] = None,
        classifier=None,
    ):
        self.gate1 = StructuralGate(target_size_px, **(gate1_kwargs or {}))
        self.gate2 = ContentGate(**(gate2_kwargs or {}))
        self.classifier = classifier or HeuristicHotSpotClassifier()

    def inspect(self, golden_bgr: np.ndarray, candidate_bgr: np.ndarray) -> InspectionReport:
        g1 = self.gate1.inspect(candidate_bgr)
        if not g1.passed:
            return InspectionReport(verdict="REJECT_GATE1", gate1=g1)

        g2 = self.gate2.inspect(golden_bgr, candidate_bgr)
        for hs in g2.hotspots:
            cls, conf = self.classifier.classify(hs)
            hs.defect_class = cls
            hs.confidence = conf

        verdict = "PASS" if g2.passed else "REJECT_GATE2"
        return InspectionReport(verdict=verdict, gate1=g1, gate2=g2)


__all__ = ["LabelInspector", "StructuralGate", "InspectionReport", "Gate1Result", "Gate2Result", "HotSpot"]
