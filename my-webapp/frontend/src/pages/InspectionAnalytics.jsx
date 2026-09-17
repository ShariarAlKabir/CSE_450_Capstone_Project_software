import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";

// Human-readable descriptions only. The severity itself is whatever the
// database recorded for that defect class, not a second copy of the mapping
// that could drift from app/quality.py.
const DEFECT_DESCRIPTIONS = {
    "Hole": "Critical weave opening / tear",
    "Yarn missing": "Structural warp/weft omission",
    "Oil Spot": "Liquid or grease surface contamination",
    "Contamination": "Foreign fiber or color fly",
    "Needle mark": "Knitting needle alignment flaw",
    "Setup": "Machine startup tension irregularity",
    "Miss loop": "Minor stitch loop defect",
};

export default function InspectionAnalytics() {
    const [inspections, setInspections] = useState([]);
    const [stats, setStats] = useState(null);
    const [statusFilter, setStatusFilter] = useState("All");
    const [gradeFilter, setGradeFilter] = useState("All");
    const [selectedDefectType, setSelectedDefectType] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [scope, setScope] = useState("Fabric");
    const [detection, setDetection] = useState(null);
    const [severityByType, setSeverityByType] = useState({});
    const [policy, setPolicy] = useState(null);

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/inspections`),
            axios.get(`${API_BASE_URL}/api/label/inspections`),
            axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope, period: "This year" } }),
            axios.get(`${API_BASE_URL}/api/economics/detection`, { params: { scope, period: "This year" } }),
            axios.get(`${API_BASE_URL}/api/fabric/defect-severities`, { params: { scope } }),
            axios.get(`${API_BASE_URL}/api/fabric/grading-policy`),
        ])
            .then(([fabricRes, labelRes, statRes, detectionRes, severityRes, policyRes]) => {
                const fabric = (fabricRes.data?.inspections || []).map((item) => ({ ...item, scope: "Fabric" }));
                const label = (labelRes.data?.inspections || []).map((item) => ({ ...item, scope: "Label" }));
                setInspections([...fabric, ...label]);
                setStats(statRes.data || null);
                setDetection(detectionRes.data || null);
                setSeverityByType(severityRes.data?.severities || {});
                setPolicy(policyRes.data || null);
            })
            .catch(() => {
                setInspections([]);
                setStats(null);
                setDetection(null);
                setSeverityByType({});
                setPolicy(null);
            });
    }, [scope]);

    // No fallback list: if the database returns nothing, the page says so
    // rather than drawing a plausible-looking distribution.
    const defectBreakdown = useMemo(() => stats?.defect_breakdown || [], [stats]);

    const totalDefectsCount = useMemo(() => {
        return defectBreakdown.reduce((acc, d) => acc + d.value, 0);
    }, [defectBreakdown]);

    const scopedInspections = useMemo(() => {
        return inspections.filter((i) => scope === "All" || i.scope === scope);
    }, [inspections, scope]);

    const scopeCounts = {
        All: inspections.length,
        Fabric: inspections.filter((i) => i.scope === "Fabric").length,
        Label: inspections.filter((i) => i.scope === "Label").length,
    };

    const filtered = useMemo(() => {
        return scopedInspections.filter((i) => {
            const matchesStatus = statusFilter === "All" || i.status === statusFilter;
            const matchesGrade = gradeFilter === "All" || i.grade === gradeFilter;
            const matchesSearch = i.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                i.roll.toLowerCase().includes(searchQuery.toLowerCase()) ||
                i.supplier.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesStatus && matchesGrade && matchesSearch;
        });
    }, [scopedInspections, statusFilter, gradeFilter, searchQuery]);

    const gradeStats = useMemo(() => {
        const total = scopedInspections.length || 1;
        const aCount = scopedInspections.filter((i) => i.grade === "A").length;
        const bCount = scopedInspections.filter((i) => i.grade === "B").length;
        const cCount = scopedInspections.filter((i) => i.grade === "C").length;
        const rCount = scopedInspections.filter((i) => i.grade === "Reject").length;
        return {
            a: { count: aCount, pct: Math.round((aCount / total) * 100) },
            b: { count: bCount, pct: Math.round((bCount / total) * 100) },
            c: { count: cCount, pct: Math.round((cCount / total) * 100) },
            r: { count: rCount, pct: Math.round((rCount / total) * 100) },
        };
    }, [scopedInspections]);

    return (
        <OperationsShell
            eyebrow="Quality inspection intelligence & defect analytics"
            title="Automated defect fingerprint, grading and verification."
            actions={
                <>
                    <button className="button button-quiet" onClick={() => window.print()}>Export inspection log</button>
                    <Link className="button button-primary" to="/fabric-inspection">Run visual AI scan</Link>
                </>
            }
        >
            {/* KPI Summary Cards */}
            <section className="kpi-grid">
                <div className="kpi-card">
                    <span>Total Inspected Rolls</span>
                    <strong>{scope === "All" ? (stats?.total_inspections ?? scopedInspections.length) : scopedInspections.length}</strong>
                    <small>{scope === "Label" ? "label samples" : "fabric rolls"} with a stored inspection record</small>
                </div>
                <div className="kpi-card">
                    <span>Defects Catalogued</span>
                    <strong>{totalDefectsCount}</strong>
                    <small>Across {defectBreakdown.length} distinct defect {defectBreakdown.length === 1 ? "class" : "classes"}</small>
                </div>
                <div className="kpi-card">
                    <span>Grade A Clearance Rate</span>
                    <strong className="positive">{gradeStats.a.pct}%</strong>
                    <small>{gradeStats.a.count} cleared first-pass</small>
                </div>
                <div className="kpi-card">
                    <span>Average Model Confidence</span>
                    <strong>{detection?.ai_confidence_pct != null ? `${detection.ai_confidence_pct}%` : "—"}</strong>
                    <small>
                        {detection?.sample_size
                            ? `Mean over ${Number(detection.sample_size).toLocaleString()} detections`
                            : "No detections on record"}
                    </small>
                </div>
            </section>

            {/* Interactive Defect Fingerprint & Grade Distribution */}
            <section className="dashboard-grid dashboard-grid--analytics">
                <article className="workspace-card workspace-card--large">
                    <div className="card-heading">
                        <div>
                            <span className="section-label">Defect Fingerprint & Frequency Analysis</span>
                            <h2>Detected Flaw Classes (Total: {totalDefectsCount})</h2>
                        </div>
                        <span className="trend-chip positive">RT-DETR Verified</span>
                    </div>

                    {/* Defect Horizontal Frequency Visualizer */}
                    <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
                        {defectBreakdown.map((item) => {
                            const pct = totalDefectsCount > 0 ? Math.round((item.value / totalDefectsCount) * 100) : 0;
                            const sev = severityByType[item.label] ?? 1;
                            const sevColor = sev === 4 ? "var(--danger)" : sev === 3 ? "#e5a43d" : "var(--accent)";

                            return (
                                <div
                                    key={item.label}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "150px 70px 1fr 45px",
                                        alignItems: "center",
                                        gap: "10px",
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        background: selectedDefectType === item.label ? "var(--accent-soft)" : "transparent",
                                        cursor: "pointer",
                                    }}
                                    onClick={() => setSelectedDefectType(selectedDefectType === item.label ? "All" : item.label)}
                                >
                                    <div>
                                        <strong style={{ fontSize: "0.78rem" }}>{item.label}</strong>
                                        <small style={{ display: "block", color: "var(--muted)", fontSize: "0.62rem" }}>
                                            {DEFECT_DESCRIPTIONS[item.label] || "Detected defect class"}
                                        </small>
                                    </div>
                                    <div>
                                        <span
                                            style={{
                                                padding: "2px 6px",
                                                borderRadius: "99px",
                                                fontSize: "0.58rem",
                                                fontFamily: "DM Mono",
                                                fontWeight: "600",
                                                color: sevColor,
                                                background: "#f0f4f0",
                                                border: `1px solid ${sevColor}`,
                                            }}
                                        >
                                            Sev {sev}
                                        </span>
                                    </div>
                                    <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", overflow: "hidden" }}>
                                        <div style={{ width: `${Math.max(6, pct * 4.5)}%`, height: "100%", background: sevColor, borderRadius: "inherit" }} />
                                    </div>
                                    <strong style={{ fontSize: "0.78rem", textAlign: "right" }}>{item.value}</strong>
                                </div>
                            );
                        })}
                        {!defectBreakdown.length && (
                            <p style={{ opacity: 0.7 }}>No defects recorded for this scope and period.</p>
                        )}
                    </div>
                </article>

                {/* Grade Distribution & Confidence Routing Guide */}
                <article className="workspace-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                        <div className="card-heading" style={{ marginBottom: "12px" }}>
                            <div>
                                <span className="section-label">Quality Outcome</span>
                                <h2>Grade Distribution</h2>
                            </div>
                        </div>

                        {/* Interactive Grade Pill Filter */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                            <div
                                style={{
                                    padding: "12px",
                                    borderRadius: "8px",
                                    background: gradeFilter === "A" ? "var(--accent-soft)" : "#f5f8f5",
                                    border: "1px solid #d4ded4",
                                    cursor: "pointer",
                                }}
                                onClick={() => setGradeFilter(gradeFilter === "A" ? "All" : "A")}
                            >
                                <span className="section-label" style={{ color: "#46a977" }}>Grade A (Pass)</span>
                                <h3 style={{ fontSize: "1.4rem", margin: "4px 0" }}>{gradeStats.a.count}</h3>
                                <small style={{ color: "var(--muted)", fontSize: "0.65rem" }}>{gradeStats.a.pct}% of total inspection</small>
                            </div>

                            <div
                                style={{
                                    padding: "12px",
                                    borderRadius: "8px",
                                    background: gradeFilter === "B" ? "var(--accent-soft)" : "#fbfdf8",
                                    border: "1px solid #e2ebd4",
                                    cursor: "pointer",
                                }}
                                onClick={() => setGradeFilter(gradeFilter === "B" ? "All" : "B")}
                            >
                                <span className="section-label" style={{ color: "#8bb769" }}>Grade B (Minor)</span>
                                <h3 style={{ fontSize: "1.4rem", margin: "4px 0" }}>{gradeStats.b.count}</h3>
                                <small style={{ color: "var(--muted)", fontSize: "0.65rem" }}>{gradeStats.b.pct}% minor issues</small>
                            </div>

                            <div
                                style={{
                                    padding: "12px",
                                    borderRadius: "8px",
                                    background: gradeFilter === "C" ? "var(--accent-soft)" : "#faf8f2",
                                    border: "1px solid #ebd9b5",
                                    cursor: "pointer",
                                }}
                                onClick={() => setGradeFilter(gradeFilter === "C" ? "All" : "C")}
                            >
                                <span className="section-label" style={{ color: "#e5a43d" }}>Grade C (Review)</span>
                                <h3 style={{ fontSize: "1.4rem", margin: "4px 0" }}>{gradeStats.c.count}</h3>
                                <small style={{ color: "var(--muted)", fontSize: "0.65rem" }}>Requires sign-off</small>
                            </div>

                            <div
                                style={{
                                    padding: "12px",
                                    borderRadius: "8px",
                                    background: gradeFilter === "Reject" ? "var(--accent-soft)" : "#faf2f0",
                                    border: "1px solid #ebd0cd",
                                    cursor: "pointer",
                                }}
                                onClick={() => setGradeFilter(gradeFilter === "Reject" ? "All" : "Reject")}
                            >
                                <span className="section-label" style={{ color: "var(--danger)" }}>Reject (Hold)</span>
                                <h3 style={{ fontSize: "1.4rem", margin: "4px 0" }}>{gradeStats.r.count}</h3>
                                <small style={{ color: "var(--muted)", fontSize: "0.65rem" }}>Lot quarantine</small>
                            </div>
                        </div>
                    </div>

                    {/* Confidence Routing Rule Guide */}
                    <div style={{ paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
                        <span className="section-label">Grading Policy</span>
                        <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "4px" }}>{policy?.description}</p>
                        <div className="confidence-rules" style={{ marginTop: "8px" }}>
                            {(policy?.bands || []).map((band) => (
                                <div key={band.grade}>
                                    <b>{band.grade}</b>
                                    <span>{band.label} — {band.routing}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </article>
            </section>

            {/* Live Inspections Queue */}
            <section className="workspace-card" style={{ marginTop: "14px" }}>
                <div className="card-heading" style={{ flexWrap: "wrap", gap: "12px" }}>
                    <div>
                        <span className="section-label">Inspection Queue Register</span>
                        <h2>Live Decisions ({filtered.length} Roll Records)</h2>
                    </div>
                </div>
                <div className="card-filters">
                    <div className="card-filters__group card-filters__group--grow">
                        <span className="filterbar__label">Find</span>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Inspection code or supplier"
                            aria-label="Search inspections"
                            className="card-filters__input"
                        />
                    </div>
                    <div className="card-filters__group">
                        <span className="filterbar__label">Status</span>
                        <div className="filter-pills">
                            {["All", "Needs review", "Approved", "Rejected"].map((st) => (
                                <button key={st} className={statusFilter === st ? "is-active" : ""} onClick={() => setStatusFilter(st)}>{st}</button>
                            ))}
                        </div>
                    </div>
                    <div className="card-filters__group">
                        <span className="filterbar__label">Domain</span>
                        <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                    </div>
                </div>

                <div className="inspection-queue" style={{ marginTop: "10px" }}>
                    {filtered.slice(0, 15).map((i) => (
                        <div className="inspection-queue__row" key={i.id}>
                            <div>
                                <strong>{i.id} · {i.roll}</strong>
                                <small>{i.supplier} · {i.defects} detected defects · {i.confidence != null ? `${i.confidence}% AI confidence` : "no detections"} · {i.time}</small>
                            </div>
                            <span className={`table-status table-status--${i.status.toLowerCase().replace(" ", "-")}`}>
                                {i.status}
                            </span>
                            <span className="inspection-grade" style={{ color: i.grade === "A" ? "var(--success)" : i.grade === "B" ? "#8bb769" : "var(--danger)" }}>
                                {i.grade}
                            </span>
                            <Link to={`/inspections/${i.scope === "Label" ? i.id : i.id.replace("IN-", "")}`} className="text-link" style={{ fontSize: "0.7rem" }}>
                                View Evidence →
                            </Link>
                        </div>
                    ))}
                </div>
            </section>
        </OperationsShell>
    );
}
