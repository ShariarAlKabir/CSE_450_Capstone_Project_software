import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import OperationsShell from "../components/OperationsShell";
import { TrendChart } from "../components/Visuals";
import { activity } from "../data/operationsData";

const scopes = ["All", "Fabric", "Label"];

function Home() {
    const [scope, setScope] = useState("All");
    const [period, setPeriod] = useState("This month");
    const [stats, setStats] = useState(null);
    const [inspections, setInspections] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    useEffect(() => {
        axios.get("http://localhost:8000/api/fabric/dashboard/stats", { params: { scope, period } })
            .then((response) => setStats(response.data))
            .catch(() => setStats(null));

        axios.get("http://localhost:8000/api/fabric/inspections")
            .then((response) => setInspections(response.data?.inspections || []))
            .catch(() => setInspections([]));

        axios.get("http://localhost:8000/api/fabric/suppliers")
            .then((response) => {
                const rows = response.data?.suppliers || [];
                setSuppliers(rows.map((row) => {
                    const score = Math.round(Number(row.supplier_rating || 85));
                    return {
                        id: `sup-${String(row.supplier_id).padStart(2, "0")}`,
                        name: row.name,
                        initials: row.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
                        scope: "Fabric",
                        tier: score >= 90 ? "Preferred" : score >= 80 ? "Standard" : "Watchlist",
                        score,
                        rejections: score < 80 ? 1 : 0,
                        fingerprint: "Database-sourced supplier",
                    };
                }));
            })
            .catch(() => setSuppliers([]));
    }, [scope, period]);

    const matchesScope = (item) => scope === "All" || item.scope === scope;
    const visibleInspections = inspections.filter(matchesScope);
    const visibleSuppliers = suppliers.filter(matchesScope);
    const analyticsLink = (view) => `/analytics/${view}?scope=${scope}&period=${encodeURIComponent(period)}`;

    const totalSuppliers = stats?.total_suppliers ?? suppliers.length;
    const totalShipments = stats?.total_shipments ?? 0;
    const totalInspections = stats?.total_inspections ?? inspections.length;
    const avgQuality = stats?.avg_quality ?? 85;

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

            <section className="kpi-grid kpi-grid--linked" aria-label="Operational summary">
                <Link className="kpi-card kpi-card--suppliers" to={analyticsLink("suppliers")}>
                    <span className="kpi-card__header"><span><i />Active suppliers</span><small>{scope} / {period}</small></span>
                    <strong>{totalSuppliers}</strong>
                    <span className="kpi-card__meter"><i style={{ "--progress": `${Math.min(totalSuppliers * 8, 100)}%` }} /></span>
                    <span className="kpi-card__action">Supplier scorecards <b aria-hidden="true">→</b></span>
                </Link>
                <Link className="kpi-card kpi-card--shipments" to={analyticsLink("shipments")}>
                    <span className="kpi-card__header"><span><i />Inbound shipments</span><small>{scope} / {period}</small></span>
                    <strong>{totalShipments}</strong>
                    <span className="kpi-card__meter"><i style={{ "--progress": `${Math.min(totalShipments * 2, 100)}%` }} /></span>
                    <span className="kpi-card__action">Lifecycle and sampling <b aria-hidden="true">→</b></span>
                </Link>
                <Link className="kpi-card kpi-card--inspections" to={analyticsLink("inspections")}>
                    <span className="kpi-card__header"><span><i />Inspections</span><small>{scope} / {period}</small></span>
                    <strong>{totalInspections}</strong>
                    <span className="kpi-card__meter"><i style={{ "--progress": `${Math.min(totalInspections, 100)}%` }} /></span>
                    <span className="kpi-card__action">Confidence and outcomes <b aria-hidden="true">→</b></span>
                </Link>
                <Link className="kpi-card kpi-card--quality" to={analyticsLink("roi")}>
                    <span className="kpi-card__header"><span><i />Avg. quality score</span><small>{scope} / {period}</small></span>
                    <strong>{avgQuality}<em>/100</em></strong>
                    <span className="kpi-card__meter"><i style={{ "--progress": `${Math.min(avgQuality, 100)}%` }} /></span>
                    <span className="kpi-card__action">Quality trends <b aria-hidden="true">→</b></span>
                </Link>
            </section>

            <section className="dashboard-grid dashboard-grid--analytics dashboard-grid--calm">
                <article className="workspace-card workspace-card--large quality-visual-card">
                    <div className="card-heading"><div><span className="section-label">Quality pulse / {scope}</span><h2>Quality trend</h2></div><Link className="visual-link" to={analyticsLink("quality")}>Explore <b>→</b></Link></div>
                    <Link className="interactive-chart" to={analyticsLink("quality")} aria-label="Open detailed quality analysis">
                        <TrendChart values={stats?.trend || [avgQuality]} label="Accepted quality trend" />
                    </Link>
                    <div className="chart-legend"><span><i className="legend-dot legend-dot--accent" />Current <b>{Math.round(avgQuality)}</b></span><span>Target <b>92</b></span><Link to={analyticsLink("defects")}>Defects →</Link></div>
                </article>
                <article className="workspace-card roi-summary-card">
                    <div className="card-heading"><div><span className="section-label">Efficiency / {period}</span><h2>Time returned</h2></div><Link className="visual-link" to={analyticsLink("quality")}>Explore <b>→</b></Link></div>
                    <Link className="roi-summary-card__metric" to={analyticsLink("quality")}><strong>{stats?.labor_hours_saved ?? 0}<small>h</small></strong><span>saved with AI assistance</span></Link>
                    <div className="comparison-strip">
                        <div><span>Manual</span><i><b style={{ "--bar": "100%" }} /></i><strong>{stats?.manual_minutes_per_item ?? 0}m</strong></div>
                        <div><span>AI</span><i><b style={{ "--bar": `${Math.min(((stats?.ai_minutes_per_item ?? 0) / Math.max(stats?.manual_minutes_per_item ?? 1, 1)) * 100, 100)}%` }} /></i><strong>{stats?.ai_minutes_per_item ?? 0}m</strong></div>
                    </div>
                    <Link className="efficiency-badge" to={analyticsLink("quality")}>{Math.max((stats?.manual_minutes_per_item ?? 0) - (stats?.ai_minutes_per_item ?? 0), 0)} min faster per item <b>→</b></Link>
                </article>
            </section>

            <section className="dashboard-grid dashboard-grid--two">
                <article className="workspace-card attention-card">
                    <div className="card-heading"><div><span className="section-label">Decision required</span><h2>Supplier watch</h2></div><Link to="/suppliers">Open supplier detail</Link></div>
                    {visibleSuppliers.filter((supplier) => supplier.tier === "Watchlist" || supplier.rejections).map((supplier) => (
                        <Link to={`/suppliers?selected=${supplier.id}`} className="attention-item" key={supplier.id} style={{ textDecoration: "none", color: "inherit" }}>
                            <span className="avatar avatar--warning">{supplier.initials}</span>
                            <div><strong>{supplier.name}</strong><small>{supplier.scope} · {supplier.rejections} rejection streak · {supplier.fingerprint}</small></div>
                            <b>{supplier.score}</b>
                        </Link>
                    ))}
                    <Link className="attention-callout" to="/suppliers">Compare suppliers <b>→</b></Link>
                </article>
                <article className="workspace-card">
                    <div className="card-heading"><div><span className="section-label">Recent inspections / {scope}</span><h2>Review queue</h2></div><Link to="/inspections">Detailed queue</Link></div>
                    <div className="compact-table">
                        {visibleInspections.slice(0, 3).map((inspection) => (
                            <Link to="/fabric-inspection" className="compact-table__row" key={inspection.id}>
                                <span><b>{inspection.id}</b><small>{inspection.scope} · {inspection.roll} · {inspection.supplier}</small></span>
                                <span className={`table-status table-status--${inspection.status.toLowerCase().replace(" ", "-")}`}>{inspection.status}</span>
                                <strong>{inspection.grade}</strong>
                                <small>{inspection.time}</small>
                            </Link>
                        ))}
                    </div>
                </article>
            </section>

            <section className="dashboard-footer-grid">
                <article className="workspace-card dashboard-shortcuts">
                    <div className="card-heading"><div><span className="section-label">Explore</span><h2>Analytics</h2></div></div>
                    <div>
                        <Link to={analyticsLink("quality")}><i>Q</i><span>Quality<small>Performance</small></span><b>→</b></Link>
                        <Link to={analyticsLink("defects")}><i>D</i><span>Defects<small>Root causes</small></span><b>→</b></Link>
                        <Link to={analyticsLink("roi")}><i>R</i><span>ROI<small>Savings</small></span><b>→</b></Link>
                        <Link to={analyticsLink("shipments")}><i>S</i><span>Shipments<small>Flow</small></span><b>→</b></Link>
                    </div>
                </article>
                <article className="workspace-card compact-activity"><div className="card-heading"><div><span className="section-label">Live feed</span><h2>Updates</h2></div><Link to="/notifications">View all →</Link></div>{activity.slice(0, 2).map((item) => <Link to="/notifications" className="activity-item" key={item.title}><i className={"activity-item__dot activity-item__dot--" + item.tone} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><time>{item.time}</time></Link>)}</article>
            </section>
        </OperationsShell>
    );
}

export default Home;
