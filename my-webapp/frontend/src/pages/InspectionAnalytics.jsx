import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";

const SEVERITY_INFO = {
    "Hole": { severity: 4, desc: "Critical weave opening / tear" },
    "Yarn missing": { severity: 4, desc: "Structural warp/weft omission" },
    "Oil Spot": { severity: 3, desc: "Liquid or grease surface contamination" },
    "Contamination": { severity: 3, desc: "Foreign fiber or color fly" },
    "Needle mark": { severity: 2, desc: "Knitting needle alignment flaw" },
    "Setup": { severity: 2, desc: "Machine startup tension irregularity" },
    "Miss loop": { severity: 1, desc: "Minor stitch loop defect" },
};

export default function InspectionAnalytics() {
    const [inspections, setInspections] = useState([]);
    const [stats, setStats] = useState(null);
    const [statusFilter, setStatusFilter] = useState("All");
    const [gradeFilter, setGradeFilter] = useState("All");
    const [selectedDefectType, setSelectedDefectType] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [scope, setScope] = useState("All");

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/inspections`),
            axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`),
        ])
            .then(([inspRes, statRes]) => {
                setInspections(inspRes.data?.inspections || []);
                setStats(statRes.data || null);
            })
            .catch(() => {
                setInspections([]);
                setStats(null);
            });
    }, []);

    const defectBreakdown = useMemo(() => {
        return stats?.defect_breakdown || [
            { label: "Needle mark", value: 18 },
            { label: "Setup", value: 18 },
            { label: "Contamination", value: 17 },
            { label: "Oil Spot", value: 17 },
            { label: "Yarn missing", value: 17 },
            { label: "Miss loop", value: 17 },
            { label: "Hole", value: 16 },
        ];
    }, [stats]);

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
                    <small>100% camera scanned</small>
                </div>
                <div className="kpi-card">
                    <span>Defects Catalogued</span>
                    <strong>{totalDefectsCount}</strong>
                    <small>Across 7 distinct defect classes</small>
                </div>
                <div className="kpi-card">
                    <span>Grade A Clearance Rate</span>
                    <strong className="positive">{gradeStats.a.pct}%</strong>
                    <small>{gradeStats.a.count} cleared first-pass</small>
                </div>
                <div className="kpi-card">
                    <span>Average Model Confidence</span>
                    <strong>96.4%</strong>
                    <small>High certainty routing</small>
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
                            const sev = SEVERITY_INFO[item.label]?.severity || 1;
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
                                            {SEVERITY_INFO[item.label]?.desc}
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
                        <span className="section-label">Confidence Policy Router</span>
                        <div className="confidence-rules" style={{ marginTop: "8px" }}>
                            <div>
                                <b>95%+</b>
                                <span>Auto-cleared (Grade A high certainty)</span>
                            </div>
                            <div>
                                <b>80–94%</b>
                                <span>Inspector verification before release</span>
                            </div>
                            <div>
                                <b>&lt;80%</b>
                                <span>Quarantined for manager sign-off</span>
                            </div>
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
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by code or supplier..."
                            style={{ padding: "6px 10px", border: "1px solid var(--line)", borderRadius: "6px", fontSize: "0.72rem" }}
                        />
                        <div className="filter-pills">
                            {["All", "Needs review", "Approved", "Rejected"].map((st) => (
                                <button
                                    key={st}
                                    className={statusFilter === st ? "is-active" : ""}
                                    onClick={() => setStatusFilter(st)}
                                >
                                    {st}
                                </button>
                            ))}
                        </div>
                        <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                    </div>
                </div>

                <div className="inspection-queue" style={{ marginTop: "10px" }}>
                    {filtered.slice(0, 15).map((i) => (
                        <div className="inspection-queue__row" key={i.id}>
                            <div>
                                <strong>{i.id} · {i.roll}</strong>
                                <small>{i.supplier} · {i.defects} detected defects · {i.confidence}% AI confidence · {i.time}</small>
                            </div>
                            <span className={`table-status table-status--${i.status.toLowerCase().replace(" ", "-")}`}>
                                {i.status}
                            </span>
                            <span className="inspection-grade" style={{ color: i.grade === "A" ? "var(--success)" : i.grade === "B" ? "#8bb769" : "var(--danger)" }}>
                                {i.grade}
                            </span>
                            <Link to="/fabric-inspection" className="text-link" style={{ fontSize: "0.7rem" }}>
                                View Evidence →
                            </Link>
                        </div>
                    ))}
                </div>
            </section>
        </OperationsShell>
    );
}
