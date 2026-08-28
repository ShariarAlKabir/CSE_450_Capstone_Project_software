import { Link, useParams, useSearchParams } from "react-router-dom";

import OperationsShell from "../components/OperationsShell";
import { TrendChart } from "../components/Visuals";
import { defectBreakdown, inspections, shipments, suppliers, trendData } from "../data/operationsData";

const views = {
    quality: { title: "Quality performance analysis", label: "Quality criteria", metric: "94.2", suffix: "/100", detail: "Accepted quality is above the 92-point operating target." },
    defects: { title: "Defect cause analysis", label: "Defect criteria", metric: "2.6%", suffix: " defect rate", detail: "Oil spot and label print alignment are the largest avoidable sources of loss." },
    roi: { title: "AI value and resource analysis", label: "ROI criteria", metric: "$42,860", suffix: " saved", detail: "Time, labor, rework, and reject-avoidance savings are tracked monthly." },
    suppliers: { title: "Supplier scorecard analysis", label: "Supplier criteria", metric: "88.4", suffix: " average score", detail: "Compare quality, cost, delivery, defect rate, and concentration risk." },
    shipments: { title: "Shipment performance analysis", label: "Shipment criteria", metric: "89.1", suffix: " quality score", detail: "Track lifecycle, sampling stage, value exposure, and clearance performance." },
    inspections: { title: "Inspection confidence analysis", label: "Inspection criteria", metric: "96.8%", suffix: " confidence", detail: "Review automated decisions, manual review demand, and final approval outcomes." },
};

function AnalyticsDetail() {
    const { view = "quality" } = useParams();
    const [params, setParams] = useSearchParams();
    const config = views[view] || views.quality;
    const scope = params.get("scope") || "All";
    const period = params.get("period") || "This month";
    const supplier = params.get("supplier") || "All suppliers";
    const status = params.get("status") || "All statuses";
    const updateFilter = (key, value) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next); };
    const scopeMatches = (item) => scope === "All" || item.scope === scope || item.scope === "Both";
    const visibleInspections = inspections.filter(scopeMatches).filter((item) => status === "All statuses" || item.status === status).filter((item) => supplier === "All suppliers" || item.supplier === supplier);
    const visibleShipments = shipments.filter(scopeMatches).filter((item) => supplier === "All suppliers" || item.supplier === supplier);
    const rows = view === "shipments" ? visibleShipments : view === "suppliers" ? suppliers.filter(scopeMatches).filter((item) => supplier === "All suppliers" || item.name === supplier) : visibleInspections;

    return <OperationsShell eyebrow={`${config.label} / ${scope} / ${period}`} title={config.title} actions={<Link className="button button-quiet" to="/">Back to overview</Link>}>
        <section className="analytics-filterbar workspace-card"><div className="filter-pills">{["All", "Fabric", "Label"].map((item) => <button key={item} className={scope === item ? "is-active" : ""} onClick={() => updateFilter("scope", item)}>{item}</button>)}</div><label className="select-control">Period <select value={period} onChange={(event) => updateFilter("period", event.target.value)}><option>This week</option><option>This month</option><option>This quarter</option><option>This year</option></select></label><label className="select-control">Supplier <select value={supplier} onChange={(event) => updateFilter("supplier", event.target.value)}><option>All suppliers</option>{suppliers.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label className="select-control">Status <select value={status} onChange={(event) => updateFilter("status", event.target.value)}><option>All statuses</option><option>Approved</option><option>Needs review</option><option>Rejected</option></select></label></section>
        <section className="analytics-hero workspace-card"><div><span className="section-label">Filtered result</span><strong>{config.metric}<small>{config.suffix}</small></strong><p>{config.detail}</p></div><div className="analytics-hero__actions"><Link to="/reports">Export this view</Link><Link to="/inspections">Open inspection queue</Link></div></section>
        <section className="dashboard-grid dashboard-grid--analytics"><article className="workspace-card workspace-card--large"><div className="card-heading"><div><span className="section-label">Time series</span><h2>Performance across {period.toLowerCase()}</h2></div><span className="trend-chip positive">Filter active</span></div><TrendChart values={scope === "Label" ? [74, 79, 81, 80, 85, 86, 88, 91, 89, 93, 95, 96] : trendData} /><div className="chart-legend"><span>Scope <b>{scope}</b></span><span>Supplier <b>{supplier}</b></span></div></article><article className="workspace-card criterion-list"><span className="section-label">Criteria breakdown</span>{view === "roi" ? <><div><span>Labor savings</span><b>$12,840</b><small>612 h avoided</small></div><div><span>Reject avoidance</span><b>$18,700</b><small>47 rolls protected</small></div><div><span>Rework avoided</span><b>$8,940</b><small>128 operator hours</small></div><div><span>Inspection throughput</span><b>4.5x</b><small>Items per shift</small></div></> : defectBreakdown.slice(0, 4).map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}%</b><small>Open contributing inspections</small></div>)}</article></section>
        <section className="workspace-card analytics-table-card"><div className="card-heading"><div><span className="section-label">Detailed records</span><h2>{rows.length} records match your controls</h2></div><button className="button button-quiet" onClick={() => window.print()}>Print filtered view</button></div><div className="analytics-table"><div className="analytics-table__head"><span>Record</span><span>Scope</span><span>Supplier</span><span>Criteria</span><span>Status</span></div>{rows.map((row) => <div className="analytics-table__row" key={row.id}><b>{row.id || row.name}</b><span>{row.scope}</span><span>{row.supplier || row.name}</span><span>{row.quality ? `${row.quality} quality` : row.confidence ? `${row.confidence}% confidence` : `${row.defects || 0} defects`}</span><span>{row.stage || row.status || row.tier}</span></div>)}</div></section>
    </OperationsShell>;
}

export default AnalyticsDetail;
