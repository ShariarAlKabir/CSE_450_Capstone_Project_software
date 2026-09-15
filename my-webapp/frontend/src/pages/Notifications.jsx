import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";

const KINDS = ["All", "Unread", "Inspection queue", "Supplier tier change", "Rejection streak"];

function Notifications() {
    const [alerts, setAlerts] = useState([]);
    const [readIds, setReadIds] = useState(() => new Set());
    const [filter, setFilter] = useState("All");
    const [scope, setScope] = useState("All");

    // Same endpoint the sidebar badge uses, so the count and this list agree.
    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/workspace/alerts`, { params: { scope, limit: 40 } })
            .then((response) => setAlerts(response.data?.alerts || []))
            .catch(() => setAlerts([]));
    }, [scope]);

    const scopeCounts = useMemo(() => ({
        All: alerts.length,
        Fabric: alerts.filter((item) => item.scope === "Fabric").length,
        Label: alerts.filter((item) => item.scope === "Label").length,
    }), [alerts]);

    const visible = alerts.filter((alert) => {
        if (filter === "All") return true;
        if (filter === "Unread") return !readIds.has(alert.id);
        return alert.kind === filter;
    });

    const markRead = (id) => setReadIds((current) => new Set(current).add(id));
    const markAllRead = () => setReadIds(new Set(alerts.map((alert) => alert.id)));

    return (
        <OperationsShell
            eyebrow="Control room alerts"
            title="Know what needs attention first."
            actions={<button className="button button-quiet" onClick={markAllRead}>Mark all as read</button>}
        >
            <section className="workspace-card notification-toolbar" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <div className="filter-pills">
                    {KINDS.map((item) => (
                        <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>
                            {item}
                        </button>
                    ))}
                </div>
                <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
            </section>

            <section className="workspace-card notification-list">
                {visible.map((alert) => {
                    const unread = !readIds.has(alert.id);
                    return (
                        <article className={`notification-item notification-item--${alert.tone} ${unread ? "is-unread" : ""}`} key={alert.id}>
                            <span className="notification-item__kind">{alert.kind}</span>
                            <div>
                                <h2>{alert.title}</h2>
                                <p>{alert.detail}</p>
                                {alert.link && <Link className="text-link" to={alert.link}>Open record →</Link>}
                            </div>
                            <time>{alert.time}</time>
                            <button onClick={() => markRead(alert.id)}>{unread ? "Mark read" : "Read"}</button>
                        </article>
                    );
                })}
                {!visible.length && <p style={{ padding: "16px 4px", opacity: 0.7 }}>Nothing needs attention for this filter.</p>}
            </section>
        </OperationsShell>
    );
}

export default Notifications;
