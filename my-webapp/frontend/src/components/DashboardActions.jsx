import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../config.js";

export default function DashboardActions({ scope }) {
    const [result, setResult] = useState(null);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        axios.get(`${API_BASE_URL}/api/workspace/dashboard-actions`, { params: { scope }, signal: controller.signal })
            .then(({ data }) => setResult({ scope, retry, data }))
            .catch(() => { if (!controller.signal.aborted) setResult({ scope, retry, error: true }); });
        return () => controller.abort();
    }, [scope, retry]);
    const current = result?.scope === scope && result?.retry === retry ? result : null;
    const groups = [
        { key: "pending", title: "Pending inspections", note: "Shipments awaiting or undergoing inspection", action: "Open shipment", empty: "No shipments waiting for inspection." },
        { key: "rejected", title: "Rejected shipments", note: "Final sampling failed the clearance threshold", action: "Review shipment", empty: "No rejected shipments." },
        { key: "approval", title: "Awaiting approval", note: "Inspection decisions still needing review · oldest first", action: "Review evidence", empty: "No inspections awaiting a decision." },
    ];
    return <section className="dashboard-actions" aria-label="Work needing attention">
        <div className="card-heading"><div><span className="section-label">Needs attention · {scope}</span><h2>Your next actions</h2><p>Current recorded workload across all dates, independent of the chart period.</p></div><button className="button button-quiet" onClick={() => setRetry((value) => value + 1)} disabled={!current}>Refresh</button></div>
        {current?.error ? <p role="alert">Could not load the action queue. <button className="button button-quiet" onClick={() => setRetry((value) => value + 1)}>Retry</button></p> : <div className="dashboard-actions__grid" aria-busy={!current}>
            {groups.map((group) => <article className={`workspace-card dashboard-action dashboard-action--${group.key}`} key={group.key}>
                <h3>{group.title}</h3><strong className="dashboard-action__count">{current ? current.data[group.key].count.toLocaleString() : "…"}</strong><p>{group.note}</p>
                {!current ? <p role="status">Loading queue…</p> : current.data[group.key].items.length ? <ul>{current.data[group.key].items.map((item) => <li key={`${item.scope}-${item.id}`}><Link to={group.key === "approval" ? `/inspections/${item.id}` : `/shipments?scope=${item.scope}&selected=${encodeURIComponent(item.id)}`}><span><b>{item.id}</b><small>{item.scope}{item.supplier ? ` · ${item.supplier}` : " · Needs review"}</small></span><span>{group.action} →</span></Link></li>)}</ul> : <p className="dashboard-action__empty">{group.empty}</p>}
                {current && current.data[group.key].count > 3 && <small>Showing 3 of {current.data[group.key].count.toLocaleString()} items</small>}
            </article>)}
        </div>}
    </section>;
}
