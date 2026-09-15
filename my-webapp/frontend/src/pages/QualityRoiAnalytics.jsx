import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";
import { TrendChart } from "../components/Visuals";

export default function QualityRoiAnalytics() {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState("roi"); // "roi" | "trends" | "copq"
    const scope = searchParams.get("scope") || "Fabric";
    const period = searchParams.get("period") || "This month";

    const [stats, setStats] = useState(null);
    const [model, setModel] = useState(null);
    const [copq, setCopq] = useState(null);

    // Simulator inputs. They START at the stored values and the measured
    // volume, then the user is free to move them. Nothing here has a literal
    // default any more - null means "not loaded yet".
    const [rollsPerMonth, setRollsPerMonth] = useState(null);
    const [manualMinutesPerRoll, setManualMinutesPerRoll] = useState(null);
    const [aiMinutesPerRoll, setAiMinutesPerRoll] = useState(null);
    const [hourlyLaborCost, setHourlyLaborCost] = useState(null);
    const [rejectionCostPerRoll, setRejectionCostPerRoll] = useState(null);

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope, period } }),
            axios.get(`${API_BASE_URL}/api/economics/model`, { params: { scope, period } }),
            axios.get(`${API_BASE_URL}/api/economics/copq`, { params: { scope, period } }),
        ])
            .then(([statsRes, modelRes, copqRes]) => {
                setStats(statsRes.data);
                setModel(modelRes.data);
                setCopq(copqRes.data);

                const parameters = modelRes.data.parameters;
                setRollsPerMonth(Math.round(modelRes.data.volumes.inspections_per_month));
                setManualMinutesPerRoll(Number(parameters.manual_minutes_per_unit));
                setAiMinutesPerRoll(Number(parameters.ai_minutes_per_unit));
                setHourlyLaborCost(Number(parameters.hourly_labor_cost));
                setRejectionCostPerRoll(Number(parameters.reject_cost_per_unit));
            })
            .catch(() => { setStats(null); setModel(null); setCopq(null); });
    }, [scope, period]);

    const changeScope = (next) => {
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            params.set("scope", next);
            return params;
        });
    };

    // Period was only ever readable from the URL, so whatever the dashboard
    // linked in with was fixed for the life of the page. Every figure here is
    // period-scoped, and the COPQ tab in particular is empty in a window with
    // no rejects, which left no way to reach the data.
    const changePeriod = (next) => {
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            params.set("period", next);
            return params;
        });
    };

    useEffect(() => {
        if (location.pathname.includes("quality")) setActiveTab("trends");
        else if (location.pathname.includes("roi")) setActiveTab("roi");
    }, [location.pathname]);

    // Same quality metric as the dashboard: current average and monthly series.
    const quality = stats?.avg_quality ?? null;
    const trend = stats?.trend || [];
    const trendMonths = stats?.trend_months || [];
    const target = stats?.quality_target ?? null;
    // Baseline is the first month actually on record, not an assumed number.
    const baseline = trend.length ? trend[0] : null;
    const gain = quality != null && baseline != null ? Math.max(0, quality - baseline) : null;
    const currency = model?.currency || "USD";
    const money = (value) => (value == null ? "—" : `$${Math.round(Number(value)).toLocaleString()}`);

    // Live recomputation as the sliders move. The formulas match
    // /api/economics/model exactly, so the page agrees with Reports until the
    // user deliberately changes an input.
    const ready = model && rollsPerMonth != null;
    const minutesSavedPerRoll = ready ? Math.max(0, manualMinutesPerRoll - aiMinutesPerRoll) : 0;
    const hoursSavedPerMonth = ready ? Math.round((rollsPerMonth * minutesSavedPerRoll) / 60) : 0;
    const laborSavingsPerMonth = ready ? Math.round(hoursSavedPerMonth * hourlyLaborCost) : 0;
    const annualLaborSavings = laborSavingsPerMonth * 12;

    // Rejects avoided uses this scope's MEASURED reject rate and the stored
    // manual miss rate, instead of a flat 4.5% guess.
    const rejectRate = ready ? Number(model.volumes.reject_rate_pct) / 100 : 0;
    const missRate = ready ? Math.max(0, 100 - Number(model.parameters.manual_detection_rate)) / 100 : 0;
    const estimatedRejectsAvoided = Math.round(rollsPerMonth * rejectRate * missRate);
    const annualScrapSavings = estimatedRejectsAvoided * rejectionCostPerRoll * 12;
    const totalAnnualSavings = annualLaborSavings + annualScrapSavings;

    // Setup cost is the recorded total of system_investments.
    const setupCost = model?.investment?.total ?? 0;
    const paybackMonths = totalAnnualSavings > 0 && setupCost > 0
        ? (setupCost / (totalAnnualSavings / 12)).toFixed(1)
        : "N/A";

    if (!ready) {
        return (
            <OperationsShell eyebrow="Quality trends & economic impact model" title="Quality trends, AI value creation & ROI simulator.">
                <section className="workspace-card"><p>Loading the economic model from the inspection and cost tables…</p></section>
            </OperationsShell>
        );
    }

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
                    <small>{aiMinutesPerRoll} min/unit vs {manualMinutesPerRoll} min manual</small>
                </div>
                <div className="kpi-card">
                    <span>Projected Annual Savings</span>
                    <strong className="positive">${totalAnnualSavings.toLocaleString()}</strong>
                    <small>${laborSavingsPerMonth.toLocaleString()}/month run-rate</small>
                </div>
                <div className="kpi-card">
                    <span>System Payback Period</span>
                    <strong>{paybackMonths} Mo</strong>
                    <small>Based on {money(setupCost)} recorded investment</small>
                </div>
                <div className="kpi-card">
                    <span>Accepted Quality Score</span>
                    <strong>{quality}<small style={{ fontSize: "1rem" }}>/100</small></strong>
                    <small className="positive">{gain != null ? `+${gain.toFixed(1)} pts since ${trendMonths[0] || "the first month on record"}` : "No history yet"}</small>
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
                <label className="select-control" style={{ marginLeft: "10px" }}>
                    Period
                    <select value={period} onChange={(event) => changePeriod(event.target.value)}>
                        <option>This week</option>
                        <option>This month</option>
                        <option>This quarter</option>
                        <option>This year</option>
                    </select>
                </label>
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
                                    <span>Monthly Inbound Units</span>
                                    <b>{rollsPerMonth} Units</b>
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
                                    <span>Manual Inspection Time per Unit</span>
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
                                    <b>${rejectionCostPerRoll} / unit</b>
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
                                    <b>{manualMinutesPerRoll} min / unit</b>
                                </div>
                                <div>
                                    <span>AI Detection</span>
                                    <b style={{ color: "#b8e6d4" }}>{aiMinutesPerRoll} min / unit</b>
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
                            Automated inspection delivers <b>{(manualMinutesPerRoll / aiMinutesPerRoll).toFixed(1)}x faster clearance</b> with consistent four-point grading.
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
                            <span className="trend-chip positive">{(gain ?? 0) >= 1 ? "Consistent Growth" : "Stable Quality"}</span>
                        </div>
                        <TrendChart values={trend} months={trendMonths} label="Accepted quality score trajectory" />
                        <div className="chart-legend" style={{ marginTop: "16px" }}>
                            <span><i className="legend-dot" /> Live Quality Score: <b>{quality}</b></span>
                            <span>Target Minimum: <b>{target ?? "—"}</b></span>
                            <span>First Month On Record: <b>{baseline ?? "—"}</b></span>
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
                                <strong>{gain != null ? `+${gain.toFixed(1)}` : "—"} Points Overall Quality</strong>
                                <p style={{ fontSize: "0.72rem", marginTop: "2px" }}>From {baseline ?? "—"} in {trendMonths[0] || "the first month"} to {quality ?? "—"} now.</p>
                            </div>
                            <div style={{ padding: "10px", background: "#f8faf7", borderRadius: "8px" }}>
                                <strong>{model.volumes.defects.toLocaleString()} Defects Caught</strong>
                                <p style={{ fontSize: "0.72rem", marginTop: "2px" }}>{model.volumes.defects_per_inspection} per inspection across {model.volumes.inspections.toLocaleString()} units, before cutting.</p>
                            </div>
                            <div style={{ padding: "10px", background: "#f8faf7", borderRadius: "8px" }}>
                                <strong>{model.volumes.rejects.toLocaleString()} Lots Held</strong>
                                <p style={{ fontSize: "0.72rem", marginTop: "2px" }}>{model.volumes.reject_rate_pct}% of inspected units were quarantined rather than shipped.</p>
                            </div>
                        </div>
                    </article>
                </section>
            )}

            {/* Tab 3: COPQ Breakdown - recorded loss events, not a fixed split */}
            {activeTab === "copq" && (
                <section className="dashboard-grid dashboard-grid--two">
                    <article className="workspace-card">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">Cost of Poor Quality Breakdown</span>
                                <h2>COPQ Categories &amp; Loss Avoidance</h2>
                            </div>
                            <span className="trend-chip">{money(copq?.total)} recorded</span>
                        </div>
                        <div style={{ display: "grid", gap: "14px", marginTop: "12px" }}>
                            {(copq?.categories || []).map((row) => (
                                <div key={row.category}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                        <span>{row.category}</span>
                                        <b>{row.percent}% ({money(row.amount)})</b>
                                    </div>
                                    <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", marginTop: "4px", overflow: "hidden" }}>
                                        <div style={{ width: `${row.percent}%`, height: "100%", background: "var(--accent)" }} />
                                    </div>
                                    <small style={{ color: "var(--muted)", fontSize: "0.62rem" }}>
                                        {row.events} events recorded against inspections in this period
                                    </small>
                                </div>
                            ))}
                            {!copq?.categories?.length && (
                                <p style={{ opacity: 0.7 }}>
                                    No loss events recorded for {scope} in {period.toLowerCase()} — nothing was
                                    rejected, so there is no cost to attribute.
                                    {period !== "This year" && " Widen the period above to see earlier losses."}
                                </p>
                            )}
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
                            Catching flaws at the <b>incoming inspection stage</b> keeps them out of the
                            downstream categories above. In this period {model.volumes.rejects.toLocaleString()} of
                            {" "}{model.volumes.inspections.toLocaleString()} units ({model.volumes.reject_rate_pct}%)
                            were held before release.
                        </p>
                        <div style={{ marginTop: "16px", padding: "14px", background: "#f5f9f6", borderRadius: "10px", border: "1px solid #d8e8dc" }}>
                            <strong style={{ color: "var(--accent-dark)", fontSize: "0.85rem" }}>Average recorded loss per held unit</strong>
                            <p style={{ fontSize: "0.75rem", marginTop: "6px" }}>
                                {model.volumes.rejects > 0
                                    ? <>The {money(copq?.total)} above spreads across {model.volumes.rejects.toLocaleString()} held
                                       units, or <b>{money((copq?.total || 0) / model.volumes.rejects)}</b> each. The stored
                                       assumption for an escaped flaw is <b>{money(model.parameters.reject_cost_per_unit)}</b>.</>
                                    : <>No units were held in {period.toLowerCase()}, so no loss has been attributed.
                                       {period !== "This year" && " Widen the period above to see earlier losses."}</>}
                            </p>
                        </div>
                    </article>
                </section>
            )}
        </OperationsShell>
    );
}
