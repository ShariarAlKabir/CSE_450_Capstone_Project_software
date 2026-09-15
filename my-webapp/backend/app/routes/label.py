"""Label-domain API.

Mirrors the shapes returned by app.routes.fabric so the frontend can render
fabric and label records through the same components. Every value served here
is read from the label_* tables; nothing is derived from the fabric tables.
"""

from decimal import Decimal
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query

from app.db import get_db
from app.quality import (
    LABEL_GRADE_SQL,
    LABEL_VERDICT_SQL,
    canonical_verdict,
    label_grade,
    label_quality,
)
from app.supplier_watch import build_supplier_watch

router = APIRouter(prefix="/api/label", tags=["Label"])


def _to_float(value):
    return float(value) if isinstance(value, Decimal) else value


def _normalize(row):
    if not row:
        return row
    return {key: _to_float(val) for key, val in dict(row).items()}


# Shared with the dashboard's grade distribution - see app/quality.py.
_grade_from_verdict = label_grade


def _display_status(verdict: str, status: Any) -> str:
    """Queue status for a label inspection, from the canonical verdict."""
    canonical = canonical_verdict(verdict)
    if canonical == "PASS":
        return "Approved"
    if canonical == "REJECT":
        return "Rejected"
    if status in ("Approved", "Rejected", "Pending Review"):
        return status
    return "Needs review"


@router.get("/health")
def health():
    return {"status": "ok", "message": "Label inspection API is running"}


@router.get("/suppliers")
def get_suppliers():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.supplier_id, s.name, s.country, s.city, s.contact_person,
                       s.contact_email, s.contact_phone, s.supplier_rating,
                       s.supplier_tier, s.label_specialty,
                       COALESCE(sh.shipment_count, 0) AS shipment_count,
                       COALESCE(sh.avg_quality, 0)    AS avg_shipment_quality,
                       COALESCE(sh.on_time_pct, 0)    AS on_time_pct,
                       COALESCE(ins.inspections, 0)   AS inspections,
                       ins.avg_ssim,
                       COALESCE(ins.total_defects, 0) AS total_defects,
                       COALESCE(ins.rejects, 0)       AS rejects,
                       COALESCE(cq.copq_amount, 0)    AS copq_amount,
                       ct.annual_spend, ct.unit_price, ct.renewal_date,
                       ct.payment_terms, ct.contract_code
                FROM label_suppliers s
                LEFT JOIN (
                    SELECT supplier_id, COUNT(*) AS shipment_count,
                           ROUND(AVG(quality_score), 2) AS avg_quality,
                           ROUND(100.0 * COUNT(*) FILTER (
                                   WHERE received_date IS NOT NULL
                                     AND promised_date IS NOT NULL
                                     AND received_date <= promised_date
                                 ) / NULLIF(COUNT(*) FILTER (
                                   WHERE received_date IS NOT NULL
                                     AND promised_date IS NOT NULL), 0), 1) AS on_time_pct
                    FROM label_shipments
                    GROUP BY supplier_id
                ) sh ON sh.supplier_id = s.supplier_id
                LEFT JOIN (
                    SELECT sh2.supplier_id,
                           COUNT(*) AS inspections,
                           AVG(li.ssim_score) AS avg_ssim,
                           COALESCE(SUM(df.defect_count), 0) AS total_defects,
                           COUNT(*) FILTER (WHERE UPPER(SPLIT_PART(li.verdict, '_', 1)) = 'REJECT') AS rejects
                    FROM label_inspections li
                    JOIN label_samples ls    ON ls.sample_id = li.sample_id
                    JOIN label_shipments sh2 ON sh2.shipment_id = ls.shipment_id
                    LEFT JOIN (
                        SELECT label_inspection_id, COUNT(*) AS defect_count
                        FROM label_defects GROUP BY label_inspection_id
                    ) df ON df.label_inspection_id = li.label_inspection_id
                    GROUP BY sh2.supplier_id
                ) ins ON ins.supplier_id = s.supplier_id
                LEFT JOIN (
                    SELECT sh3.supplier_id, SUM(c.amount) AS copq_amount
                    FROM copq_events c
                    JOIN label_inspections li ON li.label_inspection_id = c.label_inspection_id
                    JOIN label_samples ls     ON ls.sample_id = li.sample_id
                    JOIN label_shipments sh3  ON sh3.shipment_id = ls.shipment_id
                    WHERE c.scope = 'Label'
                    GROUP BY sh3.supplier_id
                ) cq ON cq.supplier_id = s.supplier_id
                LEFT JOIN supplier_contracts ct
                       ON ct.label_supplier_id = s.supplier_id AND ct.scope = 'Label'
                ORDER BY s.name
                """
            )
            suppliers = []
            for row in cur.fetchall():
                data = _normalize(row)
                inspections = int(data.get("inspections") or 0)
                avg_ssim = data.get("avg_ssim")
                data["scope"] = "Label"
                # Same 0-100 scale the fabric side reports.
                data["avg_quality"] = label_quality(avg_ssim) if avg_ssim is not None else None
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
    except Exception:
        return {"suppliers": []}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/suppliers/{supplier_id}")
def get_supplier_detail(supplier_id: int):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.*, COALESCE(sh.shipment_count, 0) AS shipment_count,
                       COALESCE(sh.avg_quality, 0) AS avg_shipment_quality
                FROM label_suppliers s
                LEFT JOIN (
                    SELECT supplier_id, COUNT(*) AS shipment_count,
                           ROUND(AVG(quality_score), 2) AS avg_quality
                    FROM label_shipments
                    GROUP BY supplier_id
                ) sh ON sh.supplier_id = s.supplier_id
                WHERE s.supplier_id = %s
                """,
                (supplier_id,),
            )
            supplier = cur.fetchone()
            if not supplier:
                raise HTTPException(status_code=404, detail="Label supplier not found")

            cur.execute(
                """
                SELECT li.verdict
                FROM label_inspections li
                JOIN label_samples ls ON ls.sample_id = li.sample_id
                JOIN label_shipments sh ON sh.shipment_id = ls.shipment_id
                WHERE sh.supplier_id = %s
                ORDER BY li.inspected_at DESC
                LIMIT 12
                """,
                (supplier_id,),
            )
            # Only real inspections. This used to pad to twelve cells with "a",
            # inventing clean lots for a supplier that had fewer than twelve.
            heatmap = [
                {"PASS": "a", "REVIEW": "b", "REJECT": "r"}[canonical_verdict(row["verdict"])]
                for row in cur.fetchall()
            ]

            result = _normalize(supplier)
            result["heatmap"] = heatmap
            return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error fetching label supplier")
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/shipments")
def get_shipments():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sh.shipment_id, sh.supplier_id, s.name AS supplier,
                       sh.shipment_code, sh.shipment_date, sh.promised_date,
                       sh.received_date,
                       sh.total_labels, sh.label_type, sh.material,
                       sh.sampling_stage, sh.quality_score, sh.notes,
                       CASE
                         WHEN sh.quality_score IS NULL THEN 'In transit'
                         WHEN sh.sampling_stage <> 'Final' THEN 'Inspecting'
                         WHEN sh.quality_score >= (
                                SELECT clearance_score FROM cost_parameters
                                WHERE scope = 'Label' AND effective_from <= CURRENT_DATE
                                ORDER BY effective_from DESC LIMIT 1
                              ) THEN 'Cleared'
                         ELSE 'Rejected'
                       END AS lifecycle,
                       COALESCE(c.total_samples, 0) AS total_samples,
                       COALESCE(c.inspected_samples, 0) AS inspected_samples,
                       ct.unit_price,
                       ROUND(sh.total_labels * COALESCE(ct.unit_price, 0), 2) AS lot_value,
                       (sh.received_date IS NOT NULL AND sh.promised_date IS NOT NULL
                        AND sh.received_date <= sh.promised_date) AS on_time
                FROM label_shipments sh
                JOIN label_suppliers s ON s.supplier_id = sh.supplier_id
                LEFT JOIN supplier_contracts ct
                       ON ct.label_supplier_id = sh.supplier_id AND ct.scope = 'Label' 
                LEFT JOIN (
                    SELECT ls.shipment_id, COUNT(*) AS total_samples,
                           COUNT(DISTINCT li.label_inspection_id) AS inspected_samples
                    FROM label_samples ls
                    LEFT JOIN label_inspections li ON li.sample_id = ls.sample_id
                    GROUP BY ls.shipment_id
                ) c ON c.shipment_id = sh.shipment_id
                ORDER BY sh.shipment_id DESC
                """
            )
            return {"shipments": [_normalize(r) for r in cur.fetchall()]}
    except Exception:
        return {"shipments": []}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/templates")
def get_templates():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT t.template_id, t.template_code, t.brand_name, t.label_type,
                       t.garment_category, t.revision, t.status, t.artwork_uri,
                       t.created_at, s.name AS supplier,
                       COALESCE(sm.sample_count, 0) AS sample_count
                FROM label_templates t
                LEFT JOIN label_suppliers s ON s.supplier_id = t.supplier_id
                LEFT JOIN (
                    SELECT template_id, COUNT(*) AS sample_count
                    FROM label_samples GROUP BY template_id
                ) sm ON sm.template_id = t.template_id
                ORDER BY t.template_code
                """
            )
            return {"templates": [_normalize(r) for r in cur.fetchall()]}
    except Exception:
        return {"templates": []}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/samples")
def get_samples():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ls.sample_id, ls.sample_code, ls.sample_source,
                       ls.captured_at, ls.operator_name, ls.notes,
                       t.template_code, t.brand_name, t.label_type,
                       sh.shipment_code, sup.name AS supplier,
                       COALESCE(li.inspection_count, 0) AS inspection_count,
                       li.avg_ssim, li.last_status
                FROM label_samples ls
                JOIN label_templates t ON t.template_id = ls.template_id
                LEFT JOIN label_shipments sh ON sh.shipment_id = ls.shipment_id
                LEFT JOIN label_suppliers sup ON sup.supplier_id = sh.supplier_id
                LEFT JOIN (
                    SELECT sample_id, COUNT(*) AS inspection_count,
                           ROUND(AVG(ssim_score), 4) AS avg_ssim,
                           MAX(status) AS last_status
                    FROM label_inspections GROUP BY sample_id
                ) li ON li.sample_id = ls.sample_id
                ORDER BY ls.sample_id
                LIMIT 1000
                """
            )
            return {"samples": [_normalize(r) for r in cur.fetchall()]}
    except Exception:
        return {"samples": []}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/inspections")
def get_inspections(limit: int = Query(500, ge=1, le=5000)):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT li.label_inspection_id, li.report_id, li.verdict, li.verdict_detail,
                       li.sample_id, li.inspection_mode, li.ssim_score, li.hotspot_count,
                       li.confidence_score, li.status, li.inspected_at,
                       ls.sample_code, ls.sample_source,
                       t.template_code, t.brand_name,
                       sh.shipment_code, sup.name AS supplier,
                       COALESCE(df.defect_count, 0) AS defect_count
                FROM label_inspections li
                LEFT JOIN label_samples ls ON ls.sample_id = li.sample_id
                LEFT JOIN label_templates t ON t.template_id = li.reference_template_id
                LEFT JOIN label_shipments sh ON sh.shipment_id = ls.shipment_id
                LEFT JOIN label_suppliers sup ON sup.supplier_id = sh.supplier_id
                LEFT JOIN (
                    SELECT label_inspection_id, COUNT(*) AS defect_count
                    FROM label_defects GROUP BY label_inspection_id
                ) df ON df.label_inspection_id = li.label_inspection_id
                ORDER BY li.inspected_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            result: List[Dict[str, Any]] = []
            for row in cur.fetchall():
                d = _normalize(row)
                d["id"] = f"LB-{d['label_inspection_id']}"
                # An inspection run without a sample_id has no shipment and so
                # no supplier. Say that plainly instead of leaving the columns
                # blank or implying a supplier that was never recorded.
                d["is_ad_hoc"] = d.get("sample_id") is None
                d["roll"] = d.get("sample_code") or "Ad-hoc capture"
                d["supplier"] = d.get("supplier") or ("Not linked to a shipment" if d["is_ad_hoc"] else "Unknown supplier")
                d["grade"] = _grade_from_verdict(d.get("verdict"), d.get("ssim_score"))
                # None rather than 0% when the row carries no confidence, so the
                # UI shows a dash instead of an invented certainty.
                d["confidence"] = (
                    round(float(d["confidence_score"]) * 100, 1)
                    if d.get("confidence_score") is not None else None
                )
                d["defects"] = int(d.get("defect_count") or 0)
                d["status"] = _display_status(d.get("verdict"), d.get("status"))
                d["scope"] = "Label"
                d["time"] = str(d["inspected_at"])[:16] if d.get("inspected_at") else "N/A"
                result.append(d)
            return {"inspections": result}
    except Exception:
        return {"inspections": []}
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/inspections/{inspection_id}")
def get_inspection_detail(inspection_id: int):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT li.*, ls.sample_code, ls.sample_source, ls.operator_name,
                       t.template_code, t.brand_name, t.revision,
                       sh.shipment_code, sup.name AS supplier
                FROM label_inspections li
                LEFT JOIN label_samples ls ON ls.sample_id = li.sample_id
                LEFT JOIN label_templates t ON t.template_id = li.reference_template_id
                LEFT JOIN label_shipments sh ON sh.shipment_id = ls.shipment_id
                LEFT JOIN label_suppliers sup ON sup.supplier_id = sh.supplier_id
                WHERE li.label_inspection_id = %s
                """,
                (inspection_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Label inspection not found")

            cur.execute(
                """
                SELECT label_defect_id AS defect_id,
                       ROW_NUMBER() OVER (ORDER BY label_defect_id) AS image_index,
                       defect_type, severity, confidence_score,
                       position_x, position_y, notes
                FROM label_defects
                WHERE label_inspection_id = %s
                ORDER BY label_defect_id
                """,
                (inspection_id,),
            )
            defects = [_normalize(r) for r in cur.fetchall()]

            cur.execute(
                """
                SELECT defect_type, COUNT(*) AS count
                FROM label_defects
                WHERE label_inspection_id = %s
                GROUP BY defect_type
                ORDER BY count DESC, defect_type
                """,
                (inspection_id,),
            )
            summary = [{"class": r["defect_type"], "count": int(r["count"])} for r in cur.fetchall()]

            result = _normalize(row)
            result["id"] = f"LB-{result['label_inspection_id']}"
            result["roll_code"] = result.get("sample_code")
            result["total_defects_found"] = len(defects)
            # Same convention as the fabric domain: penalty points are the sum
            # of the recorded severities. The old severity * confidence * 10
            # produced a number that matched neither the defect rows nor the
            # fabric side.
            result["total_penalty_points"] = float(sum(int(d.get("severity") or 0) for d in defects))
            # Label quality on the shared 0-100 scale, so a label inspection and
            # a fabric inspection can be compared.
            result["quality_score"] = label_quality(result.get("ssim_score"))
            result["grade"] = _grade_from_verdict(result.get("verdict"), result.get("ssim_score"))
            result["status"] = _display_status(result.get("verdict"), result.get("status"))
            result["scope"] = "Label"
            result["defect_summary"] = summary
            result["defects"] = defects
            return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error fetching label inspection")
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.get("/dashboard/stats")
def get_dashboard_stats(period: str = Query("This month")):
    """Label-domain KPIs.

    Uses exactly the same period semantics as /api/fabric/dashboard/stats so
    that `?scope=Label` on the fabric endpoint and this endpoint agree.
    """
    period_intervals = {"This week": "7 days", "This month": "1 month", "This quarter": "3 months", "This year": "1 year"}
    interval = period_intervals.get(period, "1 month")
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # ---- suppliers (snapshot, not period filtered) ----
            cur.execute("SELECT COUNT(*) AS total FROM label_suppliers")
            total_suppliers = int(cur.fetchone()["total"])

            # ---- shipment / template counts ----
            cur.execute(
                "SELECT COUNT(*) AS total FROM label_shipments WHERE received_date >= (CURRENT_DATE - %s::interval)::date",
                (interval,),
            )
            total_shipments = int(cur.fetchone()["total"])

            cur.execute("SELECT COUNT(*) AS total FROM label_templates")
            total_templates = int(cur.fetchone()["total"])

            # ---- samples captured in period ----
            cur.execute(
                "SELECT COUNT(*) AS total FROM label_samples WHERE captured_at >= NOW() - %s::interval",
                (interval,),
            )
            total_samples = int(cur.fetchone()["total"])

            # ---- inspections in period ----
            cur.execute(
                "SELECT COUNT(*) AS total FROM label_inspections WHERE inspected_at >= NOW() - %s::interval",
                (interval,),
            )
            total_inspections = int(cur.fetchone()["total"])

            cur.execute(
                "SELECT ROUND(AVG(ssim_score * 100)::numeric, 1) AS score FROM label_inspections "
                "WHERE ssim_score IS NOT NULL AND inspected_at >= NOW() - %s::interval",
                (interval,),
            )
            avg_quality = float(cur.fetchone()["score"] or 0)

            # ---- verdict distribution in period ----
            cur.execute(
                "SELECT {canon} AS verdict, COUNT(*) AS count FROM label_inspections "
                "WHERE inspected_at >= NOW() - %s::interval GROUP BY 1".format(
                    canon=LABEL_VERDICT_SQL.format(verdict="verdict")),
                (interval,),
            )
            # Every verdict in the table is counted, including gate variants
            # such as REJECT_GATE2. Previously only three keys were emitted, so
            # the distribution did not add up to total_inspections.
            # The SQL above already canonicalises, so every row lands in one of
            # these three buckets and the distribution sums to the total.
            verdicts = {"PASS": 0, "REVIEW": 0, "REJECT": 0}
            for row in cur.fetchall():
                key = canonical_verdict(row["verdict"])
                verdicts[key] = verdicts.get(key, 0) + int(row["count"])

            # ---- grade distribution, derived the same way as the fabric endpoint ----
            cur.execute(
                """
                SELECT {grade} AS grade, COUNT(*) AS count
                FROM label_inspections
                WHERE inspected_at >= NOW() - %s::interval
                GROUP BY 1
                """.format(grade=LABEL_GRADE_SQL.format(
                    verdict_canonical=LABEL_VERDICT_SQL.format(verdict="verdict"),
                    ssim="ssim_score")),
                (interval,),
            )
            grade_dist = {"A": 0, "B": 0, "C": 0, "Reject": 0}
            for row in cur.fetchall():
                grade_dist[row["grade"]] = int(row["count"])

            # ---- defect breakdown in period ----
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
            defect_breakdown = [{"label": r["defect_type"], "value": int(r["count"])} for r in cur.fetchall()]

            # ---- monthly trend (full history, drives the chart) ----
            cur.execute(
                "SELECT date_trunc('month', inspected_at) AS month, "
                "       ROUND(AVG(ssim_score * 100)::numeric, 1) AS score "
                "FROM label_inspections WHERE ssim_score IS NOT NULL "
                "GROUP BY 1 ORDER BY 1"
            )
            trend_rows = cur.fetchall()
            trend = [float(r["score"] or 0) for r in trend_rows]
            trend_months = [str(r["month"])[:7] for r in trend_rows]

            # Inspection-time rates come from cost_parameters so this endpoint
            # and /api/fabric/dashboard/stats?scope=Label quote the same minutes.
            cur.execute(
                """
                SELECT manual_minutes_per_unit, ai_minutes_per_unit, quality_target, currency
                FROM cost_parameters
                WHERE scope = 'Label' AND effective_from <= CURRENT_DATE
                ORDER BY effective_from DESC LIMIT 1
                """
            )
            rate = cur.fetchone()
            manual_minutes = float(rate["manual_minutes_per_unit"]) if rate else 0.0
            ai_minutes = float(rate["ai_minutes_per_unit"]) if rate else 0.0
            quality_target = float(rate["quality_target"]) if rate else 0.0
            currency = rate["currency"] if rate else "USD"
            labor_hours_saved = round(
                total_inspections * max(0.0, manual_minutes - ai_minutes) / 60, 1
            )

            return {
                "scope": "Label",
                "period": period,
                "supplier_watch": build_supplier_watch(cur, "Label"),
                "total_suppliers": total_suppliers,
                "total_shipments": total_shipments,
                "total_inspections": total_inspections,
                "total_rolls": total_samples,
                "avg_quality": round(avg_quality, 1),
                "grade_distribution": [
                    {"label": "A", "value": grade_dist["A"], "tone": "grade-a"},
                    {"label": "B", "value": grade_dist["B"], "tone": "grade-b"},
                    {"label": "C", "value": grade_dist["C"], "tone": "grade-c"},
                    {"label": "Reject", "value": grade_dist["Reject"], "tone": "grade-r"},
                ],
                "defect_breakdown": defect_breakdown,
                "trend": trend,
                "trend_months": trend_months,
                "labor_hours_saved": labor_hours_saved,
                "manual_minutes_per_item": manual_minutes,
                "ai_minutes_per_item": ai_minutes,
                "quality_target": quality_target,
                "currency": currency,
                # label-only extras
                "total_templates": total_templates,
                "total_samples": total_samples,
                "verdict_distribution": [
                    {"label": "PASS", "value": verdicts["PASS"], "tone": "grade-a"},
                    {"label": "REVIEW", "value": verdicts["REVIEW"], "tone": "grade-b"},
                    {"label": "REJECT", "value": verdicts["REJECT"], "tone": "grade-r"},
                ],
            }
    finally:
        try:
            conn.close()
        except Exception:
            pass
