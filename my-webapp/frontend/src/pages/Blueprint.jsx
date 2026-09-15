import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";

const pipeline = [
    ["Register the source", "Fabric mills and label printers are stored with a rating, tier, location and contact record."],
    ["Log the shipment", "Every inbound lot is tracked through its lifecycle stages from booking to quality clearance."],
    ["Break it into units", "Fabric shipments become rolls; label shipments become templates and samples that carry the batch."],
    ["Inspect and detect", "Rolls run through visual defect detection, labels through golden-reference or similarity comparison."],
    ["Score the outcome", "Each inspection carries a quality score, grade or verdict, confidence and a list of detected defects."],
    ["Act on the signal", "Rejections, below-par grades and degrading trends feed the supplier watchlist, alerts and reports."],
];

const modules = [
    {
        to: "/",
        title: "Dashboard",
        blurb: "The operational summary that opens the platform.",
        points: [
            "Scope controls switch the whole view between Fabric, Label or both.",
            "Period controls re-cut every figure by week, month, quarter or year.",
            "KPI cards link straight into the matching analytics deep dive.",
            "Supplier watch ranks the sources that need attention first.",
            "The review queue surfaces the latest inspections still awaiting a decision.",
        ],
    },
    {
        to: "/suppliers",
        title: "Suppliers",
        blurb: "One registry for fabric mills and label printers.",
        points: [
            "Search, scope and tier filters narrow a live supplier list.",
            "Sort by overall score, quality, cost efficiency, delivery or name.",
            "Selecting a supplier opens its score breakdown, contacts and quality history.",
            "Tick two suppliers to compare them side by side on key metrics.",
            "The scatter plot maps price exposure against defect rate.",
        ],
    },
    {
        to: "/shipments",
        title: "Shipments",
        blurb: "Inbound logistics with a decision path per lot.",
        points: [
            "Each shipment shows its supplier, value, quantity and current stage.",
            "Lifecycle tracking follows the lot from booking through inspection to clearance.",
            "The detail panel expands quality progress and shipment facts.",
            "New shipments can be recorded against any registered supplier.",
        ],
    },
    {
        to: "/inspections",
        title: "Inspections",
        blurb: "The control room for inspection decisions.",
        points: [
            "Queue filters separate needs-review, approved and rejected work.",
            "Each row shows detected defects and model confidence for the unit.",
            "Fabric rolls run through visual AI; labels run through verification tools.",
            "Confidence routing decides what auto-clears and what needs an inspector.",
            "Evidence links open the full inspection record.",
        ],
    },
    {
        to: "/analytics/quality",
        title: "Analytics",
        blurb: "Trend, cost and confidence models built on inspection history.",
        points: [
            "Quality trend tracks the accepted score over time against target.",
            "Defect analysis breaks volume down by defect type and source.",
            "Supplier scorecards and shipment lifecycle views compare performance.",
            "Inspection confidence shows how automated decisions were routed.",
            "The ROI model converts inspection time and reject cost into savings.",
        ],
    },
    {
        to: "/reports",
        title: "Reports and alerts",
        blurb: "What leaves the platform and what it flags.",
        points: [
            "Management packs export as spreadsheet or printable report files.",
            "Forecasting projects next-quarter reject cost from the current mix.",
            "Notifications raise rejection streaks and suppliers slipping down tiers.",
            "Account settings describe the roles and access levels in use.",
        ],
    },
];

const count = (payload, key) => (payload?.[key] || []).length;

function Blueprint() {
    const [totals, setTotals] = useState(null);

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/label/suppliers`),
            axios.get(`${API_BASE_URL}/api/fabric/shipments`),
            axios.get(`${API_BASE_URL}/api/label/shipments`),
            axios.get(`${API_BASE_URL}/api/fabric/inspections`),
            axios.get(`${API_BASE_URL}/api/label/inspections`),
            axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope: "All", period: "This year" } }),
        ])
            .then(([fabricSuppliers, labelSuppliers, fabricShipments, labelShipments, fabricInspections, labelInspections, combinedStats]) => {
                setTotals({
                    suppliers: count(fabricSuppliers.data, "suppliers") + count(labelSuppliers.data, "suppliers"),
                    shipments: count(fabricShipments.data, "shipments") + count(labelShipments.data, "shipments"),
                    inspections: count(fabricInspections.data, "inspections") + count(labelInspections.data, "inspections"),
                    // The dashboard blends the two domains by inspection volume;
                    // averaging the two endpoint results unweighted gave a
                    // different "average quality" on this page than on the
                    // dashboard for the same data.
                    quality: combinedStats.data?.avg_quality ?? null,
                });
            })
            .catch(() => setTotals(null));
    }, []);

    const stats = [
        ["Suppliers on record", totals?.suppliers, "Fabric mills and label printers"],
        ["Shipments logged", totals?.shipments, "Both quality domains combined"],
        ["Inspections completed", totals?.inspections, "Every scored unit on file"],
        ["Average quality", totals?.quality, "Blended fabric and label score"],
    ];

    return (
        <OperationsShell
            eyebrow="Platform blueprint"
            title="Inside the quality control room."
            actions={<><Link className="button button-quiet" to="/reports">Reports</Link><Link className="button button-primary" to="/inspections">Open inspections</Link></>}
        >
            <section className="guide-stats" aria-label="Platform totals">
                {stats.map(([label, value, note]) => (
                    <div className="guide-stat" key={label}>
                        <span>{label}</span>
                        <strong>{value ?? "—"}</strong>
                        <small>{note}</small>
                    </div>
                ))}
            </section>

            <section className="workspace-card">
                <div className="card-heading">
                    <div><span className="section-label">The purpose</span><h2>Turn inbound textile quality into a decision, not a folder of forms.</h2></div>
                </div>
                <p className="guide-lead">
                    The platform tracks fabric and label quality from the supplier through shipment and inspection to the accept, review or reject
                    decision. It keeps both domains in one operational view while storing them separately, and every number shown in the interface is
                    read back from that stored inspection history.
                </p>
                <div className="guide-flow">
                    {pipeline.map(([title, body], index) => (
                        <div className="guide-step" key={title}>
                            <b>{String(index + 1).padStart(2, "0")}</b>
                            <strong>{title}</strong>
                            <p>{body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="guide-modules">
                {modules.map((module) => (
                    <article className="workspace-card guide-module" key={module.title}>
                        <header>
                            <h3>{module.title}</h3>
                            <Link to={module.to}>Open →</Link>
                        </header>
                        <p className="guide-module__blurb">{module.blurb}</p>
                        <ul>
                            {module.points.map((point) => <li key={point}>{point}</li>)}
                        </ul>
                    </article>
                ))}
            </section>

            <section className="dashboard-grid dashboard-grid--two">
                <article className="workspace-card">
                    <div className="card-heading"><div><span className="section-label">Scoring</span><h2>How the supplier watch is built</h2></div></div>
                    <ul className="guide-list">
                        <li>A negative quarter-on-quarter quality delta, based on the supplier&apos;s own inspection history.</li>
                        <li>A rising share of rejected inspections in the recent window.</li>
                        <li>A rising share of below-par grades or label verdicts.</li>
                        <li>A low absolute quality score compared with the rest of the network.</li>
                    </ul>
                    <p className="guide-note">Each factor adds to an attention score, so the sources that appear first are the ones where a decision is most likely to pay off. The reason text on every row names the signals that triggered it.</p>
                </article>
                <article className="workspace-card">
                    <div className="card-heading"><div><span className="section-label">Data</span><h2>Where the numbers come from</h2></div></div>
                    <ul className="guide-list">
                        <li>Fabric and label data live in separate table families, so a mill and a printer never share a row.</li>
                        <li>Shipments, units, inspections and defects are linked by keys so a score can always be traced to its source.</li>
                        <li>The interface reads everything from the API and stores nothing locally.</li>
                        <li>Filters, trends and watchlists are computed from inspection records rather than hardcoded values.</li>
                    </ul>
                    <p className="guide-note">That means the guide you are reading describes behaviour, while the totals at the top of the page are live counts from the same database that powers every other screen.</p>
                </article>
            </section>
        </OperationsShell>
    );
}

export default Blueprint;
