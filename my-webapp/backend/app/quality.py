"""One definition of the fabric quality metric, shared by every caller.

The fabric domain scores a roll with the standard textile four-point system:

    total_penalty_points = SUM(severity of each detected defect)   (1..4 each)
    points_per_100_yards = total_penalty_points * 100 / roll_length_yards
    grade                = A <=10, B <=20, C <=30, else Reject

LOWER IS BETTER. Because the dashboards want a "higher is better" score on a
0-100 scale next to the label domain's SSIM percentage, penalty points are
converted with `quality_from_points`. Both the seed (bulk_seed.sql) and the
live inspection path use the thresholds below, so a freshly inspected roll and
a seeded roll mean the same thing and can share an average.

The label domain's comparable score is ssim_score * 100, which is already
"higher is better" on the same scale.
"""

# Four-point banding. Keep in sync with bulk_seed.sql step 6b.
GRADE_BANDS = ((10.0, "A"), (20.0, "B"), (30.0, "C"))

SEVERITY_MAP = {
    "Hole": 4,
    "Yarn missing": 4,
    "Oil Spot": 3,
    "Contamination": 3,
    "Needle mark": 2,
    "Setup": 2,
    "Miss loop": 1,
}

# SQL fragments so the database does the same arithmetic as Python.
# `points_expr` must name a column holding points_per_100_yards.
FABRIC_QUALITY_SQL = "GREATEST(0, 100 - LEAST({points}, 100))"
FABRIC_GRADE_SQL = (
    "CASE WHEN {points} <= 10 THEN 'A' WHEN {points} <= 20 THEN 'B' "
    "WHEN {points} <= 30 THEN 'C' ELSE 'Reject' END"
)


def severity_for(defect_type: str) -> int:
    """Penalty points a single defect of this class contributes."""
    return SEVERITY_MAP.get(defect_type, 1)


def grade_from_points(points_per_100_yards: float) -> str:
    """Four-point grade for a roll. Lower points is better."""
    points = float(points_per_100_yards or 0)
    for limit, grade in GRADE_BANDS:
        if points <= limit:
            return grade
    return "Reject"


def points_per_100_yards(total_penalty_points: float, roll_length_yards: float) -> float:
    """Normalise raw penalty points to the per-100-yard rate."""
    length = float(roll_length_yards or 0)
    if length <= 0:
        return 0.0
    return round((float(total_penalty_points) * 100.0) / length, 2)


def quality_from_points(points_per_100: float) -> float:
    """Express four-point penalty as a 0-100 score where higher is better.

    This is the only place penalty points become a "quality score", so the
    dashboard, the trend chart and the supplier watch cannot drift apart.
    """
    return round(max(0.0, 100.0 - min(float(points_per_100 or 0), 100.0)), 1)


def status_from_grade(grade: str) -> str:
    """Default routing for a newly graded roll, before anyone reviews it."""
    if grade == "A":
        return "Approved"
    if grade == "Reject":
        return "Rejected"
    return "Pending Review"


# ---------------------------------------------------------------- label domain
# The label domain's comparable score is ssim_score * 100. One grading rule,
# used by both /api/label/inspections and the dashboard's grade distribution,
# which previously disagreed: the dashboard graded any non-PASS row with
# ssim >= 0.90 as B, while the inspection list graded ssim >= 0.95 as A.
# The only verdict values that may be stored, matched by the CHECK constraint
# on label_inspections.verdict.
LABEL_VERDICTS = ("PASS", "REVIEW", "REJECT")

# Normalises any legacy or differently-cased spelling to the canonical value.
# Used when reading, so rows written before the constraint still behave.
LABEL_VERDICT_SQL = "UPPER(SPLIT_PART({verdict}, '_', 1))"


def canonical_verdict(verdict) -> str:
    """Canonical PASS / REVIEW / REJECT for any spelling a writer might use.

    'Pass' -> PASS, 'Review' -> REVIEW, 'REJECT_GATE2' -> REJECT.
    Anything unrecognised is treated as REVIEW: an unknown verdict means the
    label has not been cleared, so it must not silently pass.
    """
    head = str(verdict or "").split("_")[0].strip().upper()
    return head if head in LABEL_VERDICTS else "REVIEW"


# A REJECT is grade Reject whatever its SSIM. Previously a REJECT_GATE2 row with
# ssim 0.93 graded B, because only the exact string 'PASS' was special-cased and
# everything else fell through to the SSIM bands.
# The verdict decides first; SSIM only refines a REVIEW.
#
# A REVIEW with no SSIM is grade C ("requires sign-off"), not Reject. The
# non-deterministic classifier produces exactly that shape - a REVIEW with a
# class confidence and no SSIM - and it used to fall through the SSIM bands to
# Reject, so a label merely flagged for review was graded as a failure.
LABEL_GRADE_SQL = """
CASE
  WHEN {verdict_canonical} = 'REJECT' THEN 'Reject'
  WHEN {verdict_canonical} = 'PASS'   THEN 'A'
  WHEN {ssim} IS NULL                 THEN 'C'
  WHEN {ssim} >= 0.95                 THEN 'A'
  WHEN {ssim} >= 0.90                 THEN 'B'
  WHEN {ssim} >= 0.85                 THEN 'C'
  ELSE 'Reject'
END
"""


def label_grade(verdict, ssim) -> str:
    """Grade a label inspection. Mirrors LABEL_GRADE_SQL exactly."""
    canonical = canonical_verdict(verdict)
    if canonical == "REJECT":
        return "Reject"
    if canonical == "PASS":
        return "A"
    if ssim is None:
        return "C"
    score = float(ssim)
    if score >= 0.95:
        return "A"
    if score >= 0.90:
        return "B"
    if score >= 0.85:
        return "C"
    return "Reject"


def label_quality(ssim) -> float:
    """Label quality on the shared 0-100 scale."""
    return round(float(ssim or 0) * 100, 1)
