"""Supplier attention scoring, shared by the fabric and label dashboards.

Both domains are scored on the same 0-100 "higher is better" quality scale:
the fabric side converts its four-point penalty (see app.quality), the label
side uses ssim_score * 100.

A supplier is flagged when its inspection history shows something worth acting
on. Attention score combines, in priority order:

  1. a negative recent-vs-prior-quarter quality delta (degrading quality)
  2. a high share of rejected inspections
  3. a high share of below-par grades / verdicts
  4. a low absolute quality level

Everything is derived from the label_* / fabric_* tables - no stored flag.
"""

FABRIC_SQL = """
WITH ins AS (
    SELECT sh.supplier_id,
           -- points_per_100_yards is a four-point PENALTY (lower is better).
           -- Convert to the shared 0-100 quality scale before any averaging or
           -- trend comparison, otherwise every delta below reads backwards.
           -- Must match app.quality.quality_from_points.
           GREATEST(0, 100 - LEAST(i.points_per_100_yards, 100)) AS quality,
           i.grade::text  AS grade,
           i.status::text AS status,
           i.inspected_at
    FROM fabric_inspections i
    JOIN fabric_rolls fr ON fr.roll_id = i.roll_id
    JOIN fabric_shipments sh ON sh.shipment_id = fr.shipment_id
    WHERE i.points_per_100_yards IS NOT NULL
)
SELECT s.supplier_id, s.name, s.country, s.city,
       s.supplier_rating, s.supplier_tier,
       AVG(ins.quality) AS avg_quality,
       COUNT(*)         AS inspections,
       AVG(CASE WHEN ins.inspected_at >= NOW() - INTERVAL '3 months'
                THEN ins.quality END) AS recent_quality,
       AVG(CASE WHEN ins.inspected_at <  NOW() - INTERVAL '3 months'
                 AND ins.inspected_at >= NOW() - INTERVAL '6 months'
                THEN ins.quality END) AS prior_quality,
       COUNT(*) FILTER (WHERE ins.grade IN ('C', 'Reject')) AS below_par,
       COUNT(*) FILTER (WHERE ins.status = 'Rejected')      AS rejected,
       regr_slope(ins.quality, EXTRACT(EPOCH FROM ins.inspected_at) / 86400.0) AS slope_per_day
FROM ins
JOIN fabric_suppliers s ON s.supplier_id = ins.supplier_id
GROUP BY s.supplier_id, s.name, s.country, s.city, s.supplier_rating, s.supplier_tier
"""

LABEL_SQL = """
WITH ins AS (
    SELECT sh.supplier_id,
           li.ssim_score * 100 AS quality,
           -- Canonical verdict: the exact-match filters below missed
           -- REJECT_GATE1/REJECT_GATE2 entirely, so gate rejections never
           -- counted towards a supplier's attention score.
           UPPER(SPLIT_PART(li.verdict, '_', 1)) AS verdict,
           li.inspected_at
    FROM label_inspections li
    JOIN label_samples smp ON smp.sample_id = li.sample_id
    JOIN label_shipments sh ON sh.shipment_id = smp.shipment_id
    WHERE li.ssim_score IS NOT NULL
)
SELECT s.supplier_id, s.name, s.country, s.city,
       s.supplier_rating, s.supplier_tier,
       AVG(ins.quality) AS avg_quality,
       COUNT(*)         AS inspections,
       AVG(CASE WHEN ins.inspected_at >= NOW() - INTERVAL '3 months'
                THEN ins.quality END) AS recent_quality,
       AVG(CASE WHEN ins.inspected_at <  NOW() - INTERVAL '3 months'
                 AND ins.inspected_at >= NOW() - INTERVAL '6 months'
                THEN ins.quality END) AS prior_quality,
       COUNT(*) FILTER (WHERE ins.verdict IN ('REVIEW', 'REJECT')) AS below_par,
       COUNT(*) FILTER (WHERE ins.verdict = 'REJECT')              AS rejected,
       regr_slope(ins.quality, EXTRACT(EPOCH FROM ins.inspected_at) / 86400.0) AS slope_per_day
FROM ins
JOIN label_suppliers s ON s.supplier_id = ins.supplier_id
GROUP BY s.supplier_id, s.name, s.country, s.city, s.supplier_rating, s.supplier_tier
"""


def _score_row(row, domain):
    inspections = int(row["inspections"] or 0)
    avg_quality = float(row["avg_quality"] or 0)

    recent = row["recent_quality"]
    prior = row["prior_quality"]
    window_delta = (float(recent) - float(prior)) if recent is not None and prior is not None else None
    slope = row["slope_per_day"]
    # slope is points/day -> express it as points per quarter (90 days)
    slope_delta = float(slope) * 90.0 if slope is not None else None
    delta = window_delta if window_delta is not None else slope_delta
    delta_basis = "quarter" if window_delta is not None else "year"

    rejected = int(row["rejected"] or 0)
    below_par = int(row["below_par"] or 0)
    reject_rate = (rejected / inspections) if inspections else 0.0
    below_par_rate = (below_par / inspections) if inspections else 0.0

    score = 0.0
    reasons = []

    if delta is not None and delta < 0:
        score += min(abs(delta), 6.0) * 4.0
        if delta <= -0.8:
            label = "vs prior quarter" if delta_basis == "quarter" else "over the year"
            reasons.append(f"quality down {abs(delta):.1f} pts {label}")

    if reject_rate >= 0.06:
        score += reject_rate * 60.0
        reasons.append(f"{round(reject_rate * 100)}% rejected")

    if below_par_rate >= 0.12:
        score += below_par_rate * 30.0
        reasons.append(f"{round(below_par_rate * 100)}% below par")

    if avg_quality < 86:
        score += (86 - avg_quality) * 1.2
        reasons.append(f"avg quality {avg_quality:.1f}")

    return {
        "supplier_id": row["supplier_id"],
        "name": row["name"],
        "scope": domain,
        "location": f'{row["city"] or "N/A"}, {row["country"] or "N/A"}',
        "rating": round(float(row["supplier_rating"] or 0), 1),
        "tier": row["supplier_tier"] or "Conditional",
        "avg_quality": round(avg_quality, 1),
        "quality_delta": round(delta, 1) if delta is not None else None,
        "quality_delta_basis": delta_basis,
        "reject_rate": round(reject_rate * 100, 1),
        "below_par_rate": round(below_par_rate * 100, 1),
        "inspections": inspections,
        "attention_score": round(score, 1),
        "trend": "Declining" if (delta is not None and delta < 0) else ("Improving" if (delta or 0) > 0 else "Stable"),
        "reason": " · ".join(reasons) if reasons else "monitor closely",
    }


def build_supplier_watch(cur, domain, limit=6):
    """Return the highest-attention suppliers for one domain."""
    cur.execute(FABRIC_SQL if domain == "Fabric" else LABEL_SQL)
    rows = [_score_row(row, domain) for row in cur.fetchall()]
    rows = [row for row in rows if row["attention_score"] > 0]
    rows.sort(key=lambda row: row["attention_score"], reverse=True)
    return rows[:limit]
