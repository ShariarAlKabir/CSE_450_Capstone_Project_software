import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import { TrendChart } from "../components/Visuals";

import DashboardActions from "../components/DashboardActions";
import DashboardCharts from "../components/DashboardCharts";

const scopes = ["Fabric", "Label", "All"];

function Home() {
    const [scope, setScope] = useState("Fabric");
    const [period, setPeriod] = useState("This month");
    const [stats, setStats] = useState(null);
    const [inspections, setInspections] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    useEffect(() => {
        let cancelled = false;
        axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope, period } })
            .then((response) => { if (!cancelled) setStats(response.data); })
            .catch(() => { if (!cancelled) setStats(null); });

        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/inspections`),
            axios.get(`${API_BASE_URL}/api/label/inspections`),
        ])
            .then(([fabricResponse, labelResponse]) => {
                const fabric = (fabricResponse.data?.inspections || []).map((item) => ({ ...item, scope: "Fabric" }));
                const label = (labelResponse.data?.inspections || []).map((item) => ({ ...item, scope: "Label" }));
                setInspections([...fabric, ...label]);
            })
            .catch(() => setInspections([]));

        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/label/suppliers`),
        ])
            .then(([fabricResponse, labelResponse]) => {
                const shape = (row, itemScope) => {
                    return {
                        id: `${itemScope === "Label" ? "lbl" : "sup"}-${String(row.supplier_id).padStart(2, "0")}`,
                        name: row.name,
                        initials: row.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
                        scope: itemScope,
                        tier: row.supplier_tier || "Conditional",
                        score: row.avg_quality != null ? Math.round(Number(row.avg_quality)) : null,
                        rejections: Number(row.rejects || 0),
                    };
                };
                setSuppliers([
                    ...(fabricResponse.data?.suppliers || []).map((row) => shape(row, "Fabric")),
                    ...(labelResponse.data?.suppliers || []).map((row) => shape(row, "Label")),
                ]);
            })
            .catch(() => setSuppliers([]));
        return () => { cancelled = true; };
    }, [scope, period]);

    const matchesScope = (item) => scope === "All" || item.scope === scope;
    const visibleInspections = inspections.filter(matchesScope);
    const analyticsLink = (view) => `/analytics/${view}?scope=${scope}&period=${encodeURIComponent(period)}`;

    const totalSuppliers = stats?.total_suppliers ?? suppliers.length;
    const totalShipments = stats?.total_shipments ?? 0;
    const totalInspections = stats?.total_inspections ?? inspections.length;
    const avgQuality = stats?.avg_quality ?? null;

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

            <DashboardActions scope={scope} />

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
                    <strong>{avgQuality ?? "—"}<em>/100</em></strong>
                    <span className="kpi-card__meter"><i style={{ "--progress": `${Math.min(avgQuality ?? 0, 100)}%` }} /></span>
                    <span className="kpi-card__action">Quality trends <b aria-hidden="true">→</b></span>
                </Link>
            </section>

            <section className="dashboard-grid dashboard-grid--analytics dashboard-grid--calm">
                <article className="workspace-card workspace-card--large quality-visual-card">
                    <div className="card-heading"><div><span className="section-label">Quality pulse / {scope}</span><h2>Quality trend</h2></div><Link className="visual-link" to={analyticsLink("quality")}>Explore <b>→</b></Link></div>
                    <Link className="interactive-chart" to={analyticsLink("quality")} aria-label="Open detailed quality analysis">
                        <TrendChart values={stats?.trend || []} months={stats?.trend_months} label="Accepted quality trend" />
                    </Link>
                    <div className="chart-legend"><span><i className="legend-dot legend-dot--accent" />Current <b>{avgQuality != null ? Math.round(avgQuality) : "—"}</b></span><span>Target <b>{stats?.quality_target ?? "—"}</b></span><Link to={analyticsLink("defects")}>Defects →</Link></div>
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

            {stats?.scope === scope && stats?.period === period
                ? <DashboardCharts key={`${scope}-${period}`} stats={stats} scope={scope} period={period} />
                : <p role="status">{stats ? "Updating inspection charts..." : "Inspection charts are unavailable until dashboard data loads."}</p>}

            <section className="dashboard-grid dashboard-grid--two">
                <article className="workspace-card attention-card">
                    <div className="card-heading"><div><span className="section-label">Decision required</span><h2>Supplier watch</h2></div><Link to="/suppliers">Open supplier detail</Link></div>
                    {(stats?.supplier_watch || []).map((supplier) => {
                        const supplierId = `${supplier.scope === "Label" ? "lbl" : "sup"}-${String(supplier.supplier_id).padStart(2, "0")}`;
                        const initials = supplier.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
                        return (
                            <Link to={`/suppliers?selected=${supplierId}`} className="attention-item" key={supplierId} style={{ textDecoration: "none", color: "inherit" }}>
                                <span className="avatar avatar--warning">{initials}</span>
                                <div>
                                    <strong>{supplier.name}</strong>
                                    <small>{supplier.scope} · {supplier.reason}</small>
                                </div>
                                <b>{Math.round(supplier.avg_quality)}</b>
                            </Link>
                        );
                    })}
                    {!stats?.supplier_watch?.length && (
                        <p style={{ padding: "14px 4px", opacity: 0.7 }}>No suppliers currently need attention.</p>
                    )}
                    <Link className="attention-callout" to="/suppliers">Compare suppliers <b>→</b></Link>
                </article>
                <article className="workspace-card">
                    <div className="card-heading"><div><span className="section-label">Recent inspections / {scope}</span><h2>Review queue</h2></div><Link to="/inspections">Detailed queue</Link></div>
                    <div className="compact-table">
                        {visibleInspections.slice(0, 3).map((inspection) => (
                            <Link to={`/inspections/${inspection.scope === "Label" ? inspection.id : String(inspection.id).replace("IN-", "")}`} className="compact-table__row" key={inspection.id}>
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
                <article className="workspace-card compact-activity"><div className="card-heading"><div><span className="section-label">Live feed</span><h2>Updates</h2></div><Link to="/notifications">View all →</Link></div>{visibleInspections.slice(0, 2).map((item) => <Link to={`/inspections/${item.scope === "Label" ? item.id : String(item.id).replace("IN-", "")}`} className="activity-item" key={item.id}><i className={"activity-item__dot activity-item__dot--" + (item.grade === "Reject" ? "danger" : item.status === "Approved" ? "success" : "warning")} /><div><strong>{item.id} · {item.supplier}</strong><small>{item.scope} · {item.grade} · {item.defects} defects</small></div><time>{item.time}</time></Link>)}</article>
            </section>
        </OperationsShell>
    );
}

export default Home;
