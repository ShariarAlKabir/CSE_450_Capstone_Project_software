"""People and alerts: the signed-in user, inspection notes, and the alert feed.

The notification badge and the notifications page are served by the same
endpoint, so the count in the sidebar is always the number of alerts the page
will actually show.
"""

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query

from app.db import get_db
from app.quality import canonical_verdict
from app.supplier_watch import build_supplier_watch

router = APIRouter(prefix="/api/workspace", tags=["Workspace"])


def _user_row(row) -> Dict[str, Any]:
    return {
        "user_id": row["user_id"],
        "full_name": row["full_name"],
        "initials": row["initials"],
        "role": row["role"],
        "job_title": row["job_title"],
        "location": row["location"],
        "email": row["email"],
        "is_current": row["is_current"],
    }


@router.get("/user")
def get_current_user():
    """The signed-in user. One row in app_users carries is_current."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, full_name, initials, role, job_title, location, email, is_current "
                "FROM app_users WHERE is_current ORDER BY user_id LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No current user in app_users.")
            return _user_row(row)
    finally:
        conn.close()


@router.get("/users")
def list_users():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, full_name, initials, role, job_title, location, email, is_current "
                "FROM app_users ORDER BY user_id"
            )
            return {"users": [_user_row(r) for r in cur.fetchall()]}
    finally:
        conn.close()


@router.get("/notes")
def list_notes(limit: int = Query(10, ge=1, le=100)):
    """Notes left on the inspection queue, newest first."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT n.note_id, n.body, n.created_at, n.scope,
                       n.fabric_inspection_id, n.label_inspection_id,
                       u.full_name, u.initials, u.role,
                       fr.roll_code, ls.sample_code
                FROM inspection_notes n
                JOIN app_users u ON u.user_id = n.user_id
                LEFT JOIN fabric_inspections fi ON fi.inspection_id = n.fabric_inspection_id
                LEFT JOIN fabric_rolls fr       ON fr.roll_id = fi.roll_id
                LEFT JOIN label_inspections li  ON li.label_inspection_id = n.label_inspection_id
                LEFT JOIN label_samples ls      ON ls.sample_id = li.sample_id
                ORDER BY n.created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            notes = []
            for r in cur.fetchall():
                reference = r["roll_code"] or r["sample_code"]
                inspection_id = (
                    f"IN-{r['fabric_inspection_id']}" if r["fabric_inspection_id"]
                    else (f"LB-{r['label_inspection_id']}" if r["label_inspection_id"] else None)
                )
                notes.append({
                    "note_id": r["note_id"],
                    "author": r["full_name"],
                    "initials": r["initials"],
                    "role": r["role"],
                    "body": r["body"],
                    "scope": r["scope"],
                    "inspection_id": inspection_id,
                    "reference": reference,
                    "created_at": str(r["created_at"])[:16],
                })
            return {"notes": notes}
    finally:
        conn.close()


@router.post("/notes")
def create_note(payload: Dict[str, Any]):
    """Persist a note typed on the inspection queue."""
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="body is required")

    conn = get_db()
    try:
        with conn.cursor() as cur:
            user_id = payload.get("user_id")
            if not user_id:
                cur.execute("SELECT user_id FROM app_users WHERE is_current ORDER BY user_id LIMIT 1")
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="No current user in app_users.")
                user_id = row["user_id"]

            scope = payload.get("scope")
            cur.execute(
                """
                INSERT INTO inspection_notes
                  (user_id, scope, fabric_inspection_id, label_inspection_id, body)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING note_id, created_at
                """,
                (
                    user_id,
                    scope if scope in ("Fabric", "Label") else None,
                    payload.get("fabric_inspection_id"),
                    payload.get("label_inspection_id"),
                    body,
                ),
            )
            created = cur.fetchone()
            conn.commit()
            return {"note_id": created["note_id"], "created_at": str(created["created_at"])[:16]}
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _negated_time(value: str):
    """Sort key that orders timestamp strings newest-first."""
    return tuple(-ord(ch) for ch in str(value))


def _inspection_alerts(cur, scope: str, limit: int) -> List[Dict[str, Any]]:
    alerts: List[Dict[str, Any]] = []

    if scope in ("Fabric", "All"):
        cur.execute(
            """
            SELECT i.inspection_id, i.grade::text AS grade, i.status::text AS status,
                   i.total_defects_found, i.points_per_100_yards, i.inspected_at,
                   fr.roll_code, s.name AS supplier
            FROM fabric_inspections i
            JOIN fabric_rolls fr      ON fr.roll_id = i.roll_id
            JOIN fabric_shipments sh  ON sh.shipment_id = fr.shipment_id
            JOIN fabric_suppliers s   ON s.supplier_id = sh.supplier_id
            WHERE i.status <> 'Approved'
            ORDER BY i.inspected_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        for r in cur.fetchall():
            rejected = r["grade"] == "Reject" or r["status"] == "Rejected"
            alerts.append({
                "id": f"fabric-{r['inspection_id']}",
                "kind": "Rejection streak" if rejected else "Inspection queue",
                "title": f"IN-{r['inspection_id']} {'rejected' if rejected else 'needs review'} on {r['roll_code']}",
                "detail": (
                    f"{r['supplier']} · {r['total_defects_found']} defects · "
                    f"{float(r['points_per_100_yards'] or 0):.1f} points/100yd · grade {r['grade']}."
                ),
                "time": str(r["inspected_at"])[:16],
                "tone": "danger" if rejected else "warning",
                "scope": "Fabric",
                "link": f"/inspections/{r['inspection_id']}",
            })

    if scope in ("Label", "All"):
        cur.execute(
            """
            SELECT li.label_inspection_id, li.verdict, li.ssim_score, li.status,
                   li.inspected_at, ls.sample_code, sup.name AS supplier,
                   COALESCE(df.defect_count, 0) AS defect_count
            FROM label_inspections li
            LEFT JOIN label_samples ls    ON ls.sample_id = li.sample_id
            LEFT JOIN label_shipments sh  ON sh.shipment_id = ls.shipment_id
            LEFT JOIN label_suppliers sup ON sup.supplier_id = sh.supplier_id
            LEFT JOIN (
              SELECT label_inspection_id, COUNT(*) AS defect_count
              FROM label_defects GROUP BY label_inspection_id
            ) df ON df.label_inspection_id = li.label_inspection_id
            WHERE UPPER(SPLIT_PART(li.verdict, '_', 1)) <> 'PASS'
            ORDER BY li.inspected_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        for r in cur.fetchall():
            rejected = canonical_verdict(r["verdict"]) == "REJECT"
            alerts.append({
                "id": f"label-{r['label_inspection_id']}",
                "kind": "Rejection streak" if rejected else "Inspection queue",
                "title": f"LB-{r['label_inspection_id']} {'rejected' if rejected else 'needs review'} on {r['sample_code'] or 'sample'}",
                "detail": (
                    f"{r['supplier'] or 'Unknown supplier'} · {int(r['defect_count'])} defects · "
                    f"SSIM {float(r['ssim_score'] or 0) * 100:.1f}% · {r['verdict']}."
                ),
                "time": str(r["inspected_at"])[:16],
                "tone": "danger" if rejected else "warning",
                "scope": "Label",
                "link": f"/inspections/LB-{r['label_inspection_id']}",
            })

    return alerts


@router.get("/alerts")
def get_alerts(scope: str = Query("All"), limit: int = Query(25, ge=1, le=100)):
    """One source for both the sidebar badge and the notifications page."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            inspection_alerts = _inspection_alerts(cur, scope, limit)

            supplier_alerts: List[Dict[str, Any]] = []
            domains = ["Fabric", "Label"] if scope == "All" else [scope]
            for domain in domains:
                for supplier in build_supplier_watch(cur, domain):
                    supplier_alerts.append({
                        "id": f"watch-{domain}-{supplier['supplier_id']}",
                        "kind": "Supplier tier change",
                        "title": f"{supplier['name']} on watchlist",
                        "detail": (
                            f"{supplier['tier']} tier · {supplier['reason']} · "
                            f"{supplier['inspections']} inspections on record."
                        ),
                        "time": "Live",
                        "tone": "danger" if supplier["reject_rate"] >= 10 else "warning",
                        "scope": domain,
                        "link": f"/suppliers?selected={'lbl' if domain == 'Label' else 'sup'}-{str(supplier['supplier_id']).zfill(2)}",
                    })

            # Supplier alerts are all "danger", so sorting on tone alone would
            # push every inspection alert off the end of the feed. Give the
            # watchlist at most a third of the space and fill the rest with the
            # newest inspection alerts.
            supplier_alerts.sort(key=lambda a: a["tone"] != "danger")
            # Newest first within each tone. This sorted ascending, so the feed
            # showed the oldest open inspections and a just-recorded one never
            # reached the visible window.
            inspection_alerts.sort(key=lambda a: (a["tone"] != "danger", _negated_time(a["time"])))

            supplier_slots = max(1, limit // 3)
            alerts = supplier_alerts[:supplier_slots]
            alerts += inspection_alerts[: max(0, limit - len(alerts))]
            # Backfill if one side had fewer than its share.
            if len(alerts) < limit:
                remaining = [a for a in supplier_alerts[supplier_slots:] if a not in alerts]
                alerts += remaining[: limit - len(alerts)]

            counts: Dict[str, int] = {}
            for alert in alerts:
                counts[alert["kind"]] = counts.get(alert["kind"], 0) + 1

            return {
                "scope": scope,
                "alerts": alerts,
                "total": len(alerts),
                "counts_by_kind": counts,
            }
    finally:
        conn.close()
