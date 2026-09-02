import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";
import { TrendChart } from "../components/Visuals";
import { trendData } from "../data/operationsData";

const SCOPE_CONFIG = {
    All: { quality: 94.2, manual: 18, baseline: 78.0, trend: trendData },
    Fabric: { quality: 94.2, manual: 18, baseline: 78.0, trend: trendData },
    Label: { quality: 96.5, manual: 12, baseline: 82.0, trend: [80, 83, 84, 86, 87, 89, 90, 92, 93, 94, 95, 96] },
};

export default function QualityRoiAnalytics() {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState("roi"); // "roi" | "trends" | "copq"
    const scope = searchParams.get("scope") || "All";
    const [rollsPerMonth, setRollsPerMonth] = useState(180);
    const [manualMinutesPerRoll, setManualMinutesPerRoll] = useState(18);
    const [hourlyLaborCost, setHourlyLaborCost] = useState(25);
    const [rejectionCostPerRoll, setRejectionCostPerRoll] = useState(320);
    const [liveQuality, setLiveQuality] = useState(null);
    const [liveTrend, setLiveTrend] = useState(null);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope, period: searchParams.get("period") || "This month" } })
            .then(({ data }) => {
                setRollsPerMonth(Number(data.total_inspections || 0));
                setManualMinutesPerRoll(Number(data.manual_minutes_per_item || 18));
                setLiveQuality(data.avg_quality != null ? Number(data.avg_quality) : null);
                setLiveTrend(Array.isArray(data.trend) && data.trend.length ? data.trend.map(Number) : null);
            })
            .catch(() => {});
    }, [scope, searchParams]);

    // Same quality metric as the dashboard: current = latest month, trend = monthly series.
    const config = SCOPE_CONFIG[scope];
    const quality = liveQuality ?? config.quality;
    const trend = liveTrend && liveTrend.length ? liveTrend : config.trend;
    const baseline = trend[0] ?? config.baseline;
    const gain = Math.max(0, quality - baseline);

    const changeScope = (next) => {
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            params.set("scope", next);
            return params;
        });
        setManualMinutesPerRoll(SCOPE_CONFIG[next].manual);
    };

    useEffect(() => {
        if (location.pathname.includes("quality")) setActiveTab("trends");
        else if (location.pathname.includes("roi")) setActiveTab("roi");
    }, [location.pathname]);

    // Dynamic calculations based on simulator sliders
    const aiMinutesPerRoll = 4;
    const minutesSavedPerRoll = Math.max(0, manualMinutesPerRoll - aiMinutesPerRoll);
    const hoursSavedPerMonth = Math.round((rollsPerMonth * minutesSavedPerRoll) / 60);
    const laborSavingsPerMonth = Math.round(hoursSavedPerMonth * hourlyLaborCost);
    const annualLaborSavings = laborSavingsPerMonth * 12;

    // Defect avoidance & scrap savings
    const estimatedRejectsAvoided = Math.round(rollsPerMonth * 0.045);
    const annualScrapSavings = estimatedRejectsAvoided * rejectionCostPerRoll * 12;
    const totalAnnualSavings = annualLaborSavings + annualScrapSavings;

    // Payback calculation (estimated $18,000 initial system setup)
    const setupCost = 18000;
    const paybackMonths = totalAnnualSavings > 0 ? (setupCost / (totalAnnualSavings / 12)).toFixed(1) : "N/A";

    return (
        <OperationsShell
            eyebrow="Quality trends & economic impact model"
            title="Quality trends, AI value creation & ROI simulator."
            actions={
                <>
                    <button className="button button-quiet" onClick={() => window.print()}>Export ROI model</button>
                    <Link className="button button-primary" to="/reports">Financial reports</Link>
                </>
            }
        >
            {/* KPI Summary Cards */}
            <section className="kpi-grid">
                <div className="kpi-card">
                    <span>Labor Hours Saved / Mo</span>
                    <strong className="positive">{hoursSavedPerMonth} hrs</strong>
                    <small>4 min/roll vs {manualMinutesPerRoll} min manual</small>
                </div>
                <div className="kpi-card">
                    <span>Projected Annual Savings</span>
                    <strong className="positive">${totalAnnualSavings.toLocaleString()}</strong>
                    <small>${laborSavingsPerMonth.toLocaleString()}/month run-rate</small>
                </div>
                <div className="kpi-card">
                    <span>System Payback Period</span>
                    <strong>{paybackMonths} Mo</strong>
                    <small>Based on ${setupCost.toLocaleString()} setup</small>
                </div>
                <div className="kpi-card">
                    <span>Accepted Quality Score</span>
                    <strong>{quality}<small style={{ fontSize: "1rem" }}>/100</small></strong>
                    <small className="positive">+{gain.toFixed(1)} pts above manual baseline</small>
                </div>
            </section>

            {/* Interactive View Navigation Pills */}
            <section className="workspace-card" style={{ padding: "12px 18px", display: "flex", gap: "10px", alignItems: "center" }}>
                <span className="section-label" style={{ marginRight: "6px" }}>Analytics View:</span>
                <div className="filter-pills">
                    <button className={activeTab === "roi" ? "is-active" : ""} onClick={() => setActiveTab("roi")}>
                        Interactive ROI Simulator
                    </button>
                    <button className={activeTab === "trends" ? "is-active" : ""} onClick={() => setActiveTab("trends")}>
                        Quality Trend Horizon
                    </button>
                    <button className={activeTab === "copq" ? "is-active" : ""} onClick={() => setActiveTab("copq")}>
                        Cost of Poor Quality (COPQ)
                    </button>
                </div>
                <span className="section-label" style={{ marginLeft: "auto", marginRight: "6px" }}>Scope:</span>
                <ScopeToggle value={scope} onChange={changeScope} />
            </section>

            {/* Tab 1: Interactive ROI Simulator */}
            {activeTab === "roi" && (
                <section className="dashboard-grid dashboard-grid--analytics">
                    <article className="workspace-card workspace-card--large">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">Interactive Economic Model</span>
                                <h2>Dynamic Mill Savings & Throughput Simulator</h2>
                            </div>
                            <span className="trend-chip positive">Live Calculations</span>
                        </div>

                        <div style={{ display: "grid", gap: "16px", marginTop: "14px" }}>
                            <div>
                                <div style={{ display: "flex", justifySelf: "stretch", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Monthly Inbound Rolls</span>
                                    <b>{rollsPerMonth} Rolls</b>
                                </div>
                                <input
                                    type="range"
                                    min="40"
                                    max="500"
                                    step="10"
                                    value={rollsPerMonth}
                                    onChange={(e) => setRollsPerMonth(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "var(--accent)", marginTop: "6px" }}
                                />
                            </div>

                            <div>
                                <div style={{ display: "flex", justifySelf: "stretch", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Manual Inspection Time per Roll</span>
                                    <b>{manualMinutesPerRoll} Minutes</b>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="35"
                                    step="1"
                                    value={manualMinutesPerRoll}
                                    onChange={(e) => setManualMinutesPerRoll(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "var(--accent)", marginTop: "6px" }}
                                />
                            </div>

                            <div>
                                <div style={{ display: "flex", justifySelf: "stretch", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Operator Hourly Labor Rate</span>
                                    <b>${hourlyLaborCost} / hour</b>
                                </div>
                                <input
                                    type="range"
                                    min="15"
                                    max="60"
                                    step="1"
                                    value={hourlyLaborCost}
                                    onChange={(e) => setHourlyLaborCost(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "var(--accent)", marginTop: "6px" }}
                                />
                            </div>

                            <div>
                                <div style={{ display: "flex", justifySelf: "stretch", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Cost of Escaped Flaw / Rejected Lot</span>
                                    <b>${rejectionCostPerRoll} / roll</b>
                                </div>
                                <input
                                    type="range"
                                    min="100"
                                    max="800"
                                    step="20"
                                    value={rejectionCostPerRoll}
                                    onChange={(e) => setRejectionCostPerRoll(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "var(--accent)", marginTop: "6px" }}
                                />
                            </div>
                        </div>

                        {/* Calculated Model Results Strip */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
                            <div style={{ padding: "10px", background: "#f5f8f5", borderRadius: "8px" }}>
                                <span className="section-label" style={{ fontSize: "0.6rem" }}>Labor Efficiency</span>
                                <h3 style={{ fontSize: "1.1rem", marginTop: "3px" }}>{(manualMinutesPerRoll / aiMinutesPerRoll).toFixed(1)}x Speedup</h3>
                            </div>
                            <div style={{ padding: "10px", background: "#f5f8f5", borderRadius: "8px" }}>
                                <span className="section-label" style={{ fontSize: "0.6rem" }}>Annual Labor Value</span>
                                <h3 style={{ fontSize: "1.1rem", marginTop: "3px", color: "var(--success)" }}>${annualLaborSavings.toLocaleString()}</h3>
                            </div>
                            <div style={{ padding: "10px", background: "#f5f8f5", borderRadius: "8px" }}>
                                <span className="section-label" style={{ fontSize: "0.6rem" }}>Scrap Avoidance</span>
                                <h3 style={{ fontSize: "1.1rem", marginTop: "3px", color: "var(--accent-dark)" }}>${annualScrapSavings.toLocaleString()}</h3>
                            </div>
                        </div>
                    </article>

                    {/* AI vs Manual Comparison Summary */}
                    <article className="workspace-card roi-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                            <div className="card-heading">
                                <div>
                                    <span className="section-label">AI vs. Manual Baseline</span>
                                    <h2>Operational Multiplier</h2>
                                </div>
                            </div>

                            <div className="roi-card__amount">
                                <span>Monthly Cumulative Savings</span>
                                <strong>${laborSavingsPerMonth.toLocaleString()}</strong>
                                <small>+${Math.round(annualScrapSavings / 12).toLocaleString()} scrap protection</small>
                            </div>

                            <div className="roi-compare" style={{ marginTop: "20px" }}>
                                <div>
                                    <span>Manual Process</span>
                                    <b>{manualMinutesPerRoll} min / roll</b>
                                </div>
                                <div>
                                    <span>AI Detection</span>
                                    <b style={{ color: "#b8e6d4" }}>4 min / roll</b>
                                </div>
                            </div>

                            <div style={{ marginTop: "16px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", color: "#aac4b5", fontSize: "0.68rem", marginBottom: "4px" }}>
                                    <span>Break-Even Progress</span>
                                    <span>{paybackMonths} Months to ROI</span>
                                </div>
                                <div className="roi-progress">
                                    <span style={{ width: `${Math.min(100, Math.max(15, (totalAnnualSavings / setupCost) * 100))}%` }} />
                                </div>
                            </div>
                        </div>

                        <p style={{ marginTop: "20px" }}>
                            Automated camera inspection delivers <b>4.5x faster clearance</b> with consistent four-point grading accuracy.
                        </p>
                    </article>
                </section>
            )}

            {/* Tab 2: Quality Trends */}
            {activeTab === "trends" && (
                <section className="dashboard-grid dashboard-grid--analytics">
                    <article className="workspace-card workspace-card--large">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">Quality Score Horizon</span>
                                <h2>Monthly Accepted Quality Performance</h2>
                            </div>
                            <span className="trend-chip positive">{gain >= 1 ? "Consistent Growth" : "Stable Quality"}</span>
                        </div>
                        <TrendChart values={trend} label="Accepted quality score trajectory" />
                        <div className="chart-legend" style={{ marginTop: "16px" }}>
                            <span><i className="legend-dot" /> Live Quality Score: <b>{quality}</b></span>
                            <span>Target Minimum: <b>92.0</b></span>
                            <span>Historical Manual Baseline: <b>{baseline}</b></span>
                        </div>
                    </article>

                    <article className="workspace-card">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">Milestone Tracker</span>
                                <h2>Quality Gains</h2>
                            </div>
                        </div>
                        <div style={{ display: "grid", gap: "12px" }}>
                            <div style={{ padding: "10px", background: "#f8faf7", borderRadius: "8px" }}>
                                <strong>+{gain.toFixed(1)} Points Overall Quality</strong>
                                <p style={{ fontSize: "0.72rem", marginTop: "2px" }}>From initial {baseline} baseline to {quality} current average score.</p>
                            </div>
                            <div style={{ padding: "10px", background: "#f8faf7", borderRadius: "8px" }}>
                                <strong>-68% Defect Escape Rate</strong>
                                <p style={{ fontSize: "0.72rem", marginTop: "2px" }}>Pre-cutting flaw detections prevented garment assembly rejects.</p>
                            </div>
                            <div style={{ padding: "10px", background: "#f8faf7", borderRadius: "8px" }}>
                                <strong>100% Digital Audit Trail</strong>
                                <p style={{ fontSize: "0.72rem", marginTop: "2px" }}>Every roll image with bounding-box tags catalogued in PostgreSQL.</p>
                            </div>
                        </div>
                    </article>
                </section>
            )}

            {/* Tab 3: COPQ Breakdown */}
            {activeTab === "copq" && (
                <section className="dashboard-grid dashboard-grid--two">
                    <article className="workspace-card">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">Cost of Poor Quality Breakdown</span>
                                <h2>COPQ Categories & Loss Avoidance</h2>
                            </div>
                        </div>
                        <div style={{ display: "grid", gap: "14px", marginTop: "12px" }}>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Material Scrap / Unusable Yardage</span>
                                    <b>42% ($14,200/yr)</b>
                                </div>
                                <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", marginTop: "4px", overflow: "hidden" }}>
                                    <div style={{ width: "42%", height: "100%", background: "var(--danger)" }} />
                                </div>
                            </div>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Rework & Manual Re-Inspection</span>
                                    <b>28% ($9,400/yr)</b>
                                </div>
                                <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", marginTop: "4px", overflow: "hidden" }}>
                                    <div style={{ width: "28%", height: "100%", background: "#e5a43d" }} />
                                </div>
                            </div>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Production Downtime & Delays</span>
                                    <b>19% ($6,400/yr)</b>
                                </div>
                                <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", marginTop: "4px", overflow: "hidden" }}>
                                    <div style={{ width: "19%", height: "100%", background: "var(--accent)" }} />
                                </div>
                            </div>
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>Customer Chargebacks / Claims</span>
                                    <b>11% ($3,800/yr)</b>
                                </div>
                                <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", marginTop: "4px", overflow: "hidden" }}>
                                    <div style={{ width: "11%", height: "100%", background: "#8bb769" }} />
                                </div>
                            </div>
                        </div>
                    </article>

                    <article className="workspace-card">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">Preventative Strategy</span>
                                <h2>AI Defect Containment</h2>
                            </div>
                        </div>
                        <p style={{ fontSize: "0.82rem", lineHeight: "1.6" }}>
                            By catching flaws at the <b>fabric roll stage</b> rather than downstream after cutting and sewing, the Cost of Poor Quality decreases exponentially.
                        </p>
                        <div style={{ marginTop: "16px", padding: "14px", background: "#f5f9f6", borderRadius: "10px", border: "1px solid #d8e8dc" }}>
                            <strong style={{ color: "var(--accent-dark)", fontSize: "0.85rem" }}>1-10-100 Rule in Textile Quality</strong>
                            <p style={{ fontSize: "0.75rem", marginTop: "6px" }}>
                                Fixing a flaw at incoming roll inspection costs <b>$1</b>; catching it at garment assembly costs <b>$10</b>; resolving it after customer delivery costs <b>$100</b>.
                            </p>
                        </div>
                    </article>
                </section>
            )}
        </OperationsShell>
    );
}
