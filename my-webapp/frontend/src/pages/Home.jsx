import { useState } from "react";
import { Link } from "react-router-dom";

import OperationsShell from "../components/OperationsShell";
import { TrendChart } from "../components/Visuals";
import { activity, inspections, suppliers, trendData } from "../data/operationsData";

const scopes = ["All", "Fabric", "Label", "Both"];

function Home() {
    const [scope, setScope] = useState("All");
    const [period, setPeriod] = useState("This month");
    const matchesScope = (item) => scope === "All" || item.scope === scope || item.scope === "Both";
    const visibleInspections = inspections.filter(matchesScope);
    const visibleSuppliers = suppliers.filter(matchesScope);
    const analyticsLink = (view) => `/analytics/${view}?scope=${scope}&period=${encodeURIComponent(period)}`;

    return (
        <OperationsShell
            eyebrow="Operations overview"
            title="A quieter view of quality and cost."
            actions={<><Link className="button button-quiet" to="/reports">Reports</Link><Link className="button button-primary" to="/inspections">Start inspection</Link></>}
        >
            <section className="dashboard-controls workspace-card">
                <div><span className="section-label">View controls</span><strong>Scope your operational view</strong></div>
                <div className="filter-pills">{scopes.map((item) => <button key={item} className={scope === item ? "is-active" : ""} onClick={() => setScope(item)}>{item}</button>)}</div>
                <label className="select-control">Period <select value={period} onChange={(event) => setPeriod(event.target.value)}><option>This week</option><option>This month</option><option>This quarter</option><option>This year</option></select></label>
            </section>

            <section className="kpi-grid kpi-grid--linked">
                <Link className="kpi-card" to={analyticsLink("suppliers")}><span>Active suppliers</span><strong>{scope === "All" ? 24 : visibleSuppliers.length}</strong><small>View supplier scorecards -&gt;</small></Link>
                <Link className="kpi-card" to={analyticsLink("shipments")}><span>Inbound shipments</span><strong>{scope === "Label" ? 11 : scope === "Fabric" ? 26 : 37}</strong><small>View lifecycle and sampling -&gt;</small></Link>
                <Link className="kpi-card" to={analyticsLink("inspections")}><span>Inspections</span><strong>{scope === "All" ? 486 : visibleInspections.length * 94}</strong><small>View confidence and outcomes -&gt;</small></Link>
                <Link className="kpi-card" to={analyticsLink("roi")}><span>AI value created</span><strong>{scope === "Label" ? "$12.4k" : scope === "Fabric" ? "$30.5k" : "$42.9k"}</strong><small>View time, cost, and payback -&gt;</small></Link>
            </section>

            <section className="dashboard-grid dashboard-grid--analytics dashboard-grid--calm">
                <article className="workspace-card workspace-card--large">
                    <div className="card-heading"><div><span className="section-label">Quality pulse / {scope}</span><h2>Accepted quality is trending above target</h2></div><Link to={analyticsLink("quality")}>Open detailed analysis</Link></div>
                    <TrendChart values={scope === "Label" ? [82, 84, 83, 87, 88, 90, 91, 90, 93, 94, 95, 96] : trendData} label="Accepted quality trend" />
                    <div className="chart-legend"><span><i className="legend-dot legend-dot--accent" />Current score <b>{scope === "Label" ? 96 : 94}</b></span><span>Target <b>92</b></span><Link to={analyticsLink("defects")}>Defect breakdown -&gt;</Link></div>
                </article>
                <article className="workspace-card roi-summary-card">
                    <div className="card-heading"><div><span className="section-label">AI vs. manual / {period}</span><h2>Resources returned to the team</h2></div><Link to={analyticsLink("roi")}>Details</Link></div>
                    <div className="roi-summary-card__metric"><strong>{scope === "Label" ? "164 h" : "612 h"}</strong><span>Labor hours saved</span></div>
                    <div className="comparison-strip"><div><span>Manual</span><b>{scope === "Label" ? "12" : "18"} min / item</b></div><div><span>AI assisted</span><b>4 min / item</b></div></div>
                    <p>Open the detailed ROI timeline to filter labor, rework, reject avoidance, and payback by month, supplier, or inspection scope.</p>
                </article>
            </section>

            <section className="dashboard-grid dashboard-grid--two">
                <article className="workspace-card attention-card"><div className="card-heading"><div><span className="section-label">Decision required</span><h2>Supplier watch</h2></div><Link to={analyticsLink("suppliers")}>Open supplier detail</Link></div>{visibleSuppliers.filter((supplier) => supplier.tier === "Watchlist" || supplier.rejections).map((supplier) => <div className="attention-item" key={supplier.id}><span className="avatar avatar--warning">{supplier.initials}</span><div><strong>{supplier.name}</strong><small>{supplier.scope} · {supplier.rejections} rejection streak · {supplier.fingerprint}</small></div><b>{supplier.score}</b></div>)}<div className="attention-callout">Recommendation: use the supplier comparison view before allocating the next production order.</div></article>
                <article className="workspace-card"><div className="card-heading"><div><span className="section-label">Recent inspections / {scope}</span><h2>Review queue</h2></div><Link to={analyticsLink("inspections")}>Detailed queue</Link></div><div className="compact-table">{visibleInspections.slice(0, 3).map((inspection) => <Link to={inspection.scope === "Label" ? "/label-inspection" : "/fabric-inspection"} className="compact-table__row" key={inspection.id}><span><b>{inspection.id}</b><small>{inspection.scope} · {inspection.roll} · {inspection.supplier}</small></span><span className={`table-status table-status--${inspection.status.toLowerCase().replace(" ", "-")}`}>{inspection.status}</span><strong>{inspection.grade}</strong><small>{inspection.time}</small></Link>)}</div></article>
            </section>

            <section className="dashboard-footer-grid"><article className="workspace-card dashboard-shortcuts"><span className="section-label">Detail shortcuts</span><div><Link to={analyticsLink("quality")}>Quality performance <b>-&gt;</b></Link><Link to={analyticsLink("defects")}>Defect causes <b>-&gt;</b></Link><Link to={analyticsLink("roi")}>Savings timeline <b>-&gt;</b></Link><Link to={analyticsLink("shipments")}>Shipment performance <b>-&gt;</b></Link></div></article><article className="workspace-card compact-activity"><div className="card-heading"><div><span className="section-label">Control room</span><h2>Latest updates</h2></div><Link to="/notifications">All alerts</Link></div>{activity.slice(0, 2).map((item) => <div className="activity-item" key={item.title}><i className={`activity-item__dot activity-item__dot--${item.tone}`} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><time>{item.time}</time></div>)}</article></section>
        </OperationsShell>
    );
}

export default Home;
