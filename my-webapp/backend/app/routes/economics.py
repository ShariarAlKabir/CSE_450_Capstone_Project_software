"""Economic model endpoints: ROI, cost of poor quality, investment payback.

Nothing here invents a number. Every figure is either

  * an amount recorded in copq_events / system_investments / supplier_contracts, or
  * a volume counted from the inspection tables multiplied by a rate that is
    itself a row in cost_parameters.

The rates are operating assumptions rather than measurements, so every response
carries the `parameters` block that produced it and `basis: "modelled"` on the
derived figures. The UI labels them accordingly.
"""

from decimal import Decimal
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

from app.db import get_db

router = APIRouter(prefix="/api/economics", tags=["Economics"])

PERIOD_INTERVALS = {
    "This week": "7 days",
    "This month": "1 month",
    "This quarter": "3 months",
    "This year": "1 year",
}

PERIOD_MONTHS = {
    "This week": 0.25,
    "This month": 1.0,
    "This quarter": 3.0,
    "This year": 12.0,
}


def _f(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _interval(period: str) -> str:
    return PERIOD_INTERVALS.get(period, "1 month")


def _months(period: str) -> float:
    return PERIOD_MONTHS.get(period, 1.0)


def _load_parameters(cur, scope: str) -> Dict[str, Any]:
    """Newest effective cost_parameters row for a scope."""
    cur.execute(
        """
        SELECT scope, effective_from, manual_minutes_per_unit, ai_minutes_per_unit,
               hourly_labor_cost, reject_cost_per_unit, rework_cost_per_unit,
               manual_detection_rate, quality_target, currency
        FROM cost_parameters
        WHERE scope = %s AND effective_from <= CURRENT_DATE
        ORDER BY effective_from DESC
        LIMIT 1
        """,
        (scope,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=503,
            detail=f"No cost_parameters row for scope {scope}. Run bulk_seed.sql.",
        )
    return {
        "scope": row["scope"],
        "effective_from": str(row["effective_from"]),
        "manual_minutes_per_unit": _f(row["manual_minutes_per_unit"]),
        "ai_minutes_per_unit": _f(row["ai_minutes_per_unit"]),
        "hourly_labor_cost": _f(row["hourly_labor_cost"]),
        "reject_cost_per_unit": _f(row["reject_cost_per_unit"]),
        "rework_cost_per_unit": _f(row["rework_cost_per_unit"]),
        "manual_detection_rate": _f(row["manual_detection_rate"]),
        "quality_target": _f(row["quality_target"]),
        "currency": row["currency"],
    }


def _blend_parameters(fabric: Dict[str, Any], label: Dict[str, Any],
                      fabric_units: float, label_units: float) -> Dict[str, Any]:
    """Volume-weighted blend, so scope=All is not an unweighted mean."""
    total = fabric_units + label_units
    if total <= 0:
        weights = (0.5, 0.5)
    else:
        weights = (fabric_units / total, label_units / total)

    def mix(key: str) -> float:
        return round(fabric[key] * weights[0] + label[key] * weights[1], 2)

    return {
        "scope": "All",
        "effective_from": min(fabric["effective_from"], label["effective_from"]),
        "manual_minutes_per_unit": mix("manual_minutes_per_unit"),
        "ai_minutes_per_unit": mix("ai_minutes_per_unit"),
        "hourly_labor_cost": mix("hourly_labor_cost"),
        "reject_cost_per_unit": mix("reject_cost_per_unit"),
        "rework_cost_per_unit": mix("rework_cost_per_unit"),
        "manual_detection_rate": mix("manual_detection_rate"),
        "quality_target": mix("quality_target"),
        "currency": fabric["currency"],
        "blended_from": {"Fabric": round(weights[0], 3), "Label": round(weights[1], 3)},
    }


def _fabric_volumes(cur, interval: str) -> Dict[str, float]:
    cur.execute(
        """
        SELECT COUNT(*) AS inspections,
               COUNT(*) FILTER (WHERE grade = 'Reject')      AS rejects,
               COUNT(*) FILTER (WHERE grade IN ('C','Reject')) AS below_par,
               COALESCE(SUM(total_defects_found), 0)         AS defects
        FROM fabric_inspections
        WHERE inspected_at >= NOW() - %s::interval
        """,
        (interval,),
    )
    row = cur.fetchone()
    cur.execute(
        "SELECT COUNT(*) AS shipments FROM fabric_shipments "
        "WHERE received_date >= (CURRENT_DATE - %s::interval)::date",
        (interval,),
    )
    shipments = int(cur.fetchone()["shipments"])
    return {
        "inspections": int(row["inspections"]),
        "rejects": int(row["rejects"]),
        "below_par": int(row["below_par"]),
        "defects": int(row["defects"]),
        "shipments": shipments,
    }


def _label_volumes(cur, interval: str) -> Dict[str, float]:
    cur.execute(
        """
        SELECT COUNT(*) AS inspections,
               COUNT(*) FILTER (
                 WHERE UPPER(SPLIT_PART(verdict, '_', 1)) = 'REJECT')      AS rejects,
               COUNT(*) FILTER (
                 WHERE UPPER(SPLIT_PART(verdict, '_', 1)) IN ('REJECT','REVIEW')) AS below_par
        FROM label_inspections
        WHERE inspected_at >= NOW() - %s::interval
        """,
        (interval,),
    )
    row = cur.fetchone()
    cur.execute(
        """
        SELECT COALESCE(COUNT(d.label_defect_id), 0) AS defects
        FROM label_inspections i
        LEFT JOIN label_defects d ON d.label_inspection_id = i.label_inspection_id
        WHERE i.inspected_at >= NOW() - %s::interval
        """,
        (interval,),
    )
    defects = int(cur.fetchone()["defects"])
    cur.execute(
        "SELECT COUNT(*) AS shipments FROM label_shipments "
        "WHERE received_date >= (CURRENT_DATE - %s::interval)::date",
        (interval,),
    )
    shipments = int(cur.fetchone()["shipments"])
    return {
        "inspections": int(row["inspections"]),
        "rejects": int(row["rejects"]),
        "below_par": int(row["below_par"]),
        "defects": defects,
        "shipments": shipments,
    }


def _volumes(cur, scope: str, interval: str) -> Dict[str, float]:
    if scope == "Fabric":
        return _fabric_volumes(cur, interval)
    if scope == "Label":
        return _label_volumes(cur, interval)
    fabric = _fabric_volumes(cur, interval)
    label = _label_volumes(cur, interval)
    return {key: fabric[key] + label[key] for key in fabric}


def _parameters_for(cur, scope: str, interval: str) -> Dict[str, Any]:
    if scope in ("Fabric", "Label"):
        return _load_parameters(cur, scope)
    fabric_units = _fabric_volumes(cur, interval)["inspections"]
    label_units = _label_volumes(cur, interval)["inspections"]
    return _blend_parameters(
        _load_parameters(cur, "Fabric"),
        _load_parameters(cur, "Label"),
        fabric_units,
        label_units,
    )


def _investment(cur) -> Dict[str, Any]:
    cur.execute(
        "SELECT category, SUM(amount) AS amount, COUNT(*) AS items "
        "FROM system_investments GROUP BY category ORDER BY SUM(amount) DESC"
    )
    by_category = [
        {"category": r["category"], "amount": _f(r["amount"]), "items": int(r["items"])}
        for r in cur.fetchall()
    ]
    cur.execute("SELECT COALESCE(SUM(amount), 0) AS total, MIN(incurred_on) AS started FROM system_investments")
    row = cur.fetchone()
    return {
        "total": _f(row["total"]),
        "started_on": str(row["started"]) if row["started"] else None,
        "by_category": by_category,
    }


@router.get("/parameters")
def get_parameters(scope: str = Query("Fabric"), period: str = Query("This month")):
    """The cost assumptions behind every modelled figure. Editable via PUT."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            return {"scope": scope, "parameters": _parameters_for(cur, scope, _interval(period))}
    finally:
        conn.close()


@router.put("/parameters/{scope}")
def update_parameters(scope: str, payload: Dict[str, Any]):
    """Record a new effective-dated rate row. The ROI model picks it up at once."""
    if scope not in ("Fabric", "Label"):
        raise HTTPException(status_code=400, detail="scope must be Fabric or Label")

    fields = (
        "manual_minutes_per_unit", "ai_minutes_per_unit", "hourly_labor_cost",
        "reject_cost_per_unit", "rework_cost_per_unit", "manual_detection_rate",
        "quality_target",
    )
    conn = get_db()
    try:
        with conn.cursor() as cur:
            current = _load_parameters(cur, scope)
            merged = {key: float(payload.get(key, current[key])) for key in fields}
            cur.execute(
                """
                INSERT INTO cost_parameters
                  (scope, effective_from, manual_minutes_per_unit, ai_minutes_per_unit,
                   hourly_labor_cost, reject_cost_per_unit, rework_cost_per_unit,
                   manual_detection_rate, quality_target, currency)
                VALUES (%s, CURRENT_DATE, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (scope, effective_from) DO UPDATE SET
                  manual_minutes_per_unit = EXCLUDED.manual_minutes_per_unit,
                  ai_minutes_per_unit     = EXCLUDED.ai_minutes_per_unit,
                  hourly_labor_cost       = EXCLUDED.hourly_labor_cost,
                  reject_cost_per_unit    = EXCLUDED.reject_cost_per_unit,
                  rework_cost_per_unit    = EXCLUDED.rework_cost_per_unit,
                  manual_detection_rate   = EXCLUDED.manual_detection_rate,
                  quality_target          = EXCLUDED.quality_target
                """,
                (scope, merged["manual_minutes_per_unit"], merged["ai_minutes_per_unit"],
                 merged["hourly_labor_cost"], merged["reject_cost_per_unit"],
                 merged["rework_cost_per_unit"], merged["manual_detection_rate"],
                 merged["quality_target"], current["currency"]),
            )
            conn.commit()
            return {"scope": scope, "parameters": _load_parameters(cur, scope)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/model")
def get_model(scope: str = Query("Fabric"), period: str = Query("This month")):
    """Volumes from the inspection tables x rates from cost_parameters."""
    interval = _interval(period)
    months = _months(period)
    conn = get_db()
    try:
        with conn.cursor() as cur:
            params = _parameters_for(cur, scope, interval)
            vol = _volumes(cur, scope, interval)
            investment = _investment(cur)

            # Per-month normalisation so a "per month" label is honest whatever
            # period the user picked.
            per_month = (lambda n: round(n / months, 1)) if months else (lambda n: 0.0)
            inspections_pm = per_month(vol["inspections"])
            rejects_pm = per_month(vol["rejects"])

            minutes_saved = max(0.0, params["manual_minutes_per_unit"] - params["ai_minutes_per_unit"])
            hours_saved_pm = round(inspections_pm * minutes_saved / 60.0, 1)
            labor_savings_pm = round(hours_saved_pm * params["hourly_labor_cost"], 2)
            annual_labor = round(labor_savings_pm * 12, 2)

            # Rejects the model caught before the roll reached cutting. The
            # manual baseline would have missed (100 - manual_detection_rate)%
            # of them, and those are the ones that turn into scrap downstream.
            miss_rate = max(0.0, 100.0 - params["manual_detection_rate"]) / 100.0
            rejects_avoided_pm = round(rejects_pm * miss_rate, 1)
            annual_scrap = round(rejects_avoided_pm * params["reject_cost_per_unit"] * 12, 2)
            total_annual = round(annual_labor + annual_scrap, 2)

            monthly_total = total_annual / 12 if total_annual else 0.0
            payback_months = round(investment["total"] / monthly_total, 1) if monthly_total > 0 else None

            # Cumulative savings vs the investment, month by month, for the
            # payback tracker. Percent of the investment recovered.
            cumulative = []
            for month in range(1, 13):
                recovered = monthly_total * month
                cumulative.append({
                    "month": month,
                    "cumulative_savings": round(recovered, 2),
                    "percent_of_investment": (
                        round(recovered / investment["total"] * 100, 1)
                        if investment["total"] else 0.0
                    ),
                })

            cost_per_shipment = (
                round(total_annual / 12 / vol["shipments"], 2)
                if vol["shipments"] else 0.0
            )

            return {
                "scope": scope,
                "period": period,
                "currency": params["currency"],
                "basis": "modelled",
                "parameters": params,
                "volumes": {
                    **{k: int(v) for k, v in vol.items()},
                    "inspections_per_month": inspections_pm,
                    "rejects_per_month": rejects_pm,
                    "reject_rate_pct": (
                        round(vol["rejects"] / vol["inspections"] * 100, 1)
                        if vol["inspections"] else 0.0
                    ),
                    "defects_per_inspection": (
                        round(vol["defects"] / vol["inspections"], 1)
                        if vol["inspections"] else 0.0
                    ),
                },
                "savings": {
                    "minutes_saved_per_unit": round(minutes_saved, 1),
                    "labor_hours_saved_per_month": hours_saved_pm,
                    "labor_savings_per_month": labor_savings_pm,
                    "annual_labor_savings": annual_labor,
                    "rejects_avoided_per_month": rejects_avoided_pm,
                    "annual_scrap_savings": annual_scrap,
                    "total_annual_savings": total_annual,
                    "cost_saved_per_shipment": cost_per_shipment,
                    "speedup": (
                        round(params["manual_minutes_per_unit"] / params["ai_minutes_per_unit"], 1)
                        if params["ai_minutes_per_unit"] else None
                    ),
                },
                "investment": {
                    **investment,
                    "payback_months": payback_months,
                    "cumulative": cumulative,
                },
            }
    finally:
        conn.close()


@router.get("/copq")
def get_copq(scope: str = Query("Fabric"), period: str = Query("This year")):
    """Cost of poor quality, from the recorded loss events (not a fixed split)."""
    interval = _interval(period)
    conn = get_db()
    try:
        with conn.cursor() as cur:
            if scope in ("Fabric", "Label"):
                cur.execute(
                    """
                    SELECT category, SUM(amount) AS amount, COUNT(*) AS events
                    FROM copq_events
                    WHERE scope = %s AND occurred_on >= (CURRENT_DATE - %s::interval)::date
                    GROUP BY category ORDER BY SUM(amount) DESC
                    """,
                    (scope, interval),
                )
            else:
                cur.execute(
                    """
                    SELECT category, SUM(amount) AS amount, COUNT(*) AS events
                    FROM copq_events
                    WHERE occurred_on >= (CURRENT_DATE - %s::interval)::date
                    GROUP BY category ORDER BY SUM(amount) DESC
                    """,
                    (interval,),
                )
            rows = cur.fetchall()
            categories = [
                {"category": r["category"], "amount": _f(r["amount"]), "events": int(r["events"])}
                for r in rows
            ]
            total = sum(item["amount"] for item in categories)
            for item in categories:
                item["percent"] = round(item["amount"] / total * 100, 1) if total else 0.0

            params = _parameters_for(cur, scope, interval)
            return {
                "scope": scope,
                "period": period,
                "currency": params["currency"],
                "basis": "recorded",
                "total": round(total, 2),
                "categories": categories,
            }
    finally:
        conn.close()


@router.get("/forecast")
def get_forecast(scope: str = Query("Fabric")):
    """Next-quarter reject cost projected from the last two quarters' actuals."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            scope_clause = "" if scope not in ("Fabric", "Label") else "AND scope = %s"
            args = () if scope not in ("Fabric", "Label") else (scope,)

            cur.execute(
                f"""
                SELECT
                  COALESCE(SUM(amount) FILTER (
                    WHERE occurred_on >= (CURRENT_DATE - INTERVAL '3 months')::date), 0) AS recent,
                  COALESCE(SUM(amount) FILTER (
                    WHERE occurred_on <  (CURRENT_DATE - INTERVAL '3 months')::date
                      AND occurred_on >= (CURRENT_DATE - INTERVAL '6 months')::date), 0) AS prior
                FROM copq_events
                WHERE TRUE {scope_clause}
                """,
                args,
            )
            row = cur.fetchone()
            recent = _f(row["recent"])
            prior = _f(row["prior"])

            # Carry the observed quarter-on-quarter movement forward one quarter.
            if prior > 0:
                change_pct = (recent - prior) / prior
                projected = recent * (1 + change_pct)
            else:
                change_pct = 0.0
                projected = recent

            params = _parameters_for(cur, scope if scope in ("Fabric", "Label") else "Fabric", "3 months")
            return {
                "scope": scope,
                "basis": "modelled",
                "currency": params["currency"],
                "recent_quarter_cost": round(recent, 2),
                "prior_quarter_cost": round(prior, 2),
                "change_pct": round(change_pct * 100, 1),
                "projected_next_quarter_cost": round(max(projected, 0.0), 2),
                "direction": "down" if change_pct < 0 else ("up" if change_pct > 0 else "flat"),
            }
    finally:
        conn.close()


@router.get("/detection")
def get_detection(scope: str = Query("Fabric"), period: str = Query("This year")):
    """Model detection confidence vs the manual baseline rate."""
    interval = _interval(period)
    conn = get_db()
    try:
        with conn.cursor() as cur:
            if scope == "Label":
                cur.execute(
                    "SELECT AVG(confidence_score) AS c, COUNT(*) AS n FROM label_inspections "
                    "WHERE confidence_score IS NOT NULL AND inspected_at >= NOW() - %s::interval",
                    (interval,),
                )
            elif scope == "Fabric":
                cur.execute(
                    "SELECT AVG(d.confidence_score) AS c, COUNT(*) AS n FROM fabric_defects d "
                    "JOIN fabric_inspections i ON i.inspection_id = d.inspection_id "
                    "WHERE d.confidence_score IS NOT NULL AND i.inspected_at >= NOW() - %s::interval",
                    (interval,),
                )
            else:
                cur.execute(
                    """
                    SELECT AVG(c) AS c, COUNT(*) AS n FROM (
                      SELECT d.confidence_score AS c
                      FROM fabric_defects d JOIN fabric_inspections i ON i.inspection_id = d.inspection_id
                      WHERE d.confidence_score IS NOT NULL AND i.inspected_at >= NOW() - %s::interval
                      UNION ALL
                      SELECT confidence_score FROM label_inspections
                      WHERE confidence_score IS NOT NULL AND inspected_at >= NOW() - %s::interval
                    ) combined
                    """,
                    (interval, interval),
                )
            row = cur.fetchone()
            params = _parameters_for(cur, scope, interval)
            return {
                "scope": scope,
                "period": period,
                "basis": "measured",
                "ai_confidence_pct": round(_f(row["c"]) * 100, 1),
                "sample_size": int(row["n"] or 0),
                "manual_detection_rate_pct": params["manual_detection_rate"],
            }
    finally:
        conn.close()


@router.get("/contracts")
def get_contracts(scope: str = Query("Fabric")):
    """Commercial terms per supplier, for the supplier scorecards."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.contract_id, c.scope, c.contract_code, c.annual_spend,
                       c.unit_price, c.payment_terms, c.renewal_date, c.currency,
                       COALESCE(c.fabric_supplier_id, c.label_supplier_id) AS supplier_id
                FROM supplier_contracts c
                WHERE (%s NOT IN ('Fabric','Label')) OR c.scope = %s
                ORDER BY c.scope, supplier_id
                """,
                (scope, scope),
            )
            return {
                "contracts": [
                    {
                        "contract_id": r["contract_id"],
                        "scope": r["scope"],
                        "supplier_id": r["supplier_id"],
                        "contract_code": r["contract_code"],
                        "annual_spend": _f(r["annual_spend"]),
                        "unit_price": _f(r["unit_price"]),
                        "payment_terms": r["payment_terms"],
                        "renewal_date": str(r["renewal_date"]) if r["renewal_date"] else None,
                        "currency": r["currency"],
                    }
                    for r in cur.fetchall()
                ]
            }
    finally:
        conn.close()
