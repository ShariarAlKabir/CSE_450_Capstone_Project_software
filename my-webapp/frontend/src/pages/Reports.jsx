import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";
import { TrendChart } from "../components/Visuals";

const money = (value, currency = "USD") =>
    value == null ? "—" : `${currency === "USD" ? "$" : ""}${Math.round(Number(value)).toLocaleString()}`;

function Reports() {
    const [scope, setScope] = useState("Fabric");
    const [period, setPeriod] = useState("This year");
    const [stats, setStats] = useState(null);
    const [model, setModel] = useState(null);
    const [copq, setCopq] = useState(null);
    const [forecast, setForecast] = useState(null);
    const [detection, setDetection] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [shiftPct, setShiftPct] = useState(15);

    useEffect(() => {
        const params = { scope, period };
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params }),
            axios.get(`${API_BASE_URL}/api/economics/model`, { params }),
            axios.get(`${API_BASE_URL}/api/economics/copq`, { params }),
            axios.get(`${API_BASE_URL}/api/economics/forecast`, { params: { scope } }),
            axios.get(`${API_BASE_URL}/api/economics/detection`, { params }),
        ])
            .then(([statsRes, modelRes, copqRes, forecastRes, detectionRes]) => {
                setStats(statsRes.data);
                setModel(modelRes.data);
                setCopq(copqRes.data);
                setForecast(forecastRes.data);
                setDetection(detectionRes.data);
            })
            .catch(() => {
                setStats(null); setModel(null); setCopq(null); setForecast(null); setDetection(null);
            });

        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/label/suppliers`),
        ])
            .then(([fabricRes, labelRes]) => {
                const rows = [
                    ...(fabricRes.data?.suppliers || []),
                    ...(labelRes.data?.suppliers || []),
                ].filter((row) => (scope === "All" || row.scope === scope) && row.avg_quality != null);
                setSuppliers(rows);
            })
            .catch(() => setSuppliers([]));
    }, [scope, period]);

    const currency = model?.currency || "USD";

    // Budget-impact simulator, built from the two real suppliers at the extremes
    // of the measured quality range rather than from two invented mill names.
    const simulation = useMemo(() => {
        if (suppliers.length < 2 || !model) return null;
        const sorted = [...suppliers].sort((a, b) => Number(a.avg_quality) - Number(b.avg_quality));
        const from = sorted[0];
        const to = sorted[sorted.length - 1];
        const rejectCost = model.parameters.reject_cost_per_unit;
        const fromRejectRate = Number(from.reject_rate || 0) / 100;
        const toRejectRate = Number(to.reject_rate || 0) / 100;
        const unitsMoved = (model.volumes.inspections_per_month * 3) * (shiftPct / 100);
        return {
            from, to,
            unitsMoved: Math.round(unitsMoved),
            costReduction: Math.round(unitsMoved * (fromRejectRate - toRejectRate) * rejectCost),
            qualityImpact: Number((Number(to.avg_quality) - Number(from.avg_quality)) * (shiftPct / 100)).toFixed(1),
        };
    }, [suppliers, model, shiftPct]);

    const exportReport = (type) => {
        if (!model) return;
        const lines = [
            "Textile Quality Platform",
            `${scope} scope · ${period} · generated ${new Date().toISOString().slice(0, 10)}`,
            "",
            "-- Measured from the inspection database --",
            `Inspections: ${model.volumes.inspections}`,
            `Rejects: ${model.volumes.rejects} (${model.volumes.reject_rate_pct}%)`,
            `Defects catalogued: ${model.volumes.defects}`,
            `Average quality score: ${stats?.avg_quality ?? "n/a"} / 100 (target ${stats?.quality_target ?? "n/a"})`,
            `Model detection confidence: ${detection?.ai_confidence_pct ?? "n/a"}%`,
            `Cost of poor quality recorded: ${money(copq?.total, currency)}`,
            "",
            "-- Modelled from those volumes and the stored cost assumptions --",
            `Manual baseline: ${model.parameters.manual_minutes_per_unit} min/unit at ${money(model.parameters.hourly_labor_cost, currency)}/hour`,
            `AI inspection time: ${model.parameters.ai_minutes_per_unit} min/unit`,
            `Labour hours saved per month: ${model.savings.labor_hours_saved_per_month}`,
            `Projected annual savings: ${money(model.savings.total_annual_savings, currency)}`,
            `Adoption investment: ${money(model.investment.total, currency)}`,
            `Payback: ${model.investment.payback_months ?? "n/a"} months`,
            `Projected next-quarter reject cost: ${money(forecast?.projected_next_quarter_cost, currency)}`,
            "",
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `textile-quality-${type}-${scope.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const payback = model?.investment?.cumulative?.slice(0, 6) || [];

    return (
        <OperationsShell
            eyebrow="Reports & forecasting"
            title="Translate inspection data into decisions."
            actions={
                <>
                    <button className="button button-quiet" onClick={() => exportReport("summary")} disabled={!model}>Export summary</button>
                    <button className="button button-primary" onClick={() => window.print()}>Print report</button>
                </>
            }
        >
            <section className="workspace-card" style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
                <span className="section-label">Scope</span>
                <ScopeToggle value={scope} onChange={setScope} />
                <label className="select-control">
                    Period
                    <select value={period} onChange={(event) => setPeriod(event.target.value)}>
                        <option>This week</option><option>This month</option><option>This quarter</option><option>This year</option>
                    </select>
                </label>
                <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--muted)" }}>
                    Recorded amounts come from the inspection and cost tables. Figures marked
                    <b> modelled </b> apply the stored rate assumptions to those volumes.
                </span>
            </section>

            <section className="dashboard-grid dashboard-grid--analytics">
                <article className="workspace-card workspace-card--large">
                    <div className="card-heading">
                        <div><span className="section-label">Quarter outlook</span><h2>Quality performance forecast</h2></div>
                        <span className={`trend-chip ${Number(stats?.avg_quality) >= Number(stats?.quality_target) ? "positive" : ""}`}>
                            {Number(stats?.avg_quality) >= Number(stats?.quality_target) ? "On target" : "Below target"}
                        </span>
                    </div>
                    <TrendChart values={stats?.trend || []} months={stats?.trend_months} label="Quality performance forecast" />
                    <div className="chart-legend" style={{ marginTop: "12px" }}>
                        <span><i className="legend-dot legend-dot--accent" />Current <b>{stats?.avg_quality ?? "—"}</b></span>
                        <span>Target <b>{stats?.quality_target ?? "—"}</b></span>
                    </div>
                    <div className="forecast-footer">
                        <span>Next-quarter projected reject cost <small>(modelled)</small></span>
                        <strong>{money(forecast?.projected_next_quarter_cost, currency)}</strong>
                        <small>
                            {forecast
                                ? `${forecast.direction === "down" ? "Down" : forecast.direction === "up" ? "Up" : "Level"} ${Math.abs(forecast.change_pct)}% on the prior quarter (${money(forecast.prior_quarter_cost, currency)} → ${money(forecast.recent_quarter_cost, currency)}).`
                                : "No cost-of-poor-quality events recorded yet."}
                        </small>
                    </div>
                </article>

                <article className="workspace-card roi-card">
                    <div className="card-heading"><div><span className="section-label">Payback tracker</span><h2>System adoption return</h2></div></div>
                    <div className="roi-card__amount">
                        <span>Adoption investment <small>(recorded)</small></span>
                        <strong>{money(model?.investment?.total, currency)}</strong>
                        <small>
                            {model?.investment?.payback_months
                                ? `Payback at month ${Math.ceil(model.investment.payback_months)} on modelled savings`
                                : "Not enough volume to model payback"}
                        </small>
                    </div>
                    <div className="payback-bars">
                        {payback.map((row) => (
                            <div key={row.month}>
                                <i
                                    style={{ height: `${Math.min(row.percent_of_investment, 100)}%` }}
                                    className={row.percent_of_investment >= 100 ? "is-paid" : ""}
                                    title={`Month ${row.month}: ${money(row.cumulative_savings, currency)} (${row.percent_of_investment}% of investment)`}
                                />
                                <small>M{row.month}</small>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: "10px", fontSize: "0.66rem", color: "var(--muted)" }}>
                        Cumulative modelled savings as a share of the recorded investment.
                    </div>
                </article>
            </section>

            <section className="dashboard-grid dashboard-grid--three">
                <article className="workspace-card report-stat">
                    <span>Labour-hours saved / month <small>(modelled)</small></span>
                    <strong>{model?.savings?.labor_hours_saved_per_month ?? "—"} h</strong>
                    <p>
                        Manual baseline {model?.parameters?.manual_minutes_per_unit ?? "—"} min per unit, AI-assisted
                        {" "}{model?.parameters?.ai_minutes_per_unit ?? "—"} min, across {model?.volumes?.inspections_per_month ?? "—"} units a month.
                    </p>
                </article>
                <article className="workspace-card report-stat">
                    <span>Cost saved per shipment <small>(modelled)</small></span>
                    <strong>{money(model?.savings?.cost_saved_per_shipment, currency)}</strong>
                    <p>Monthly modelled savings spread across the {model?.volumes?.shipments ?? "—"} shipments received in this period.</p>
                </article>
                <article className="workspace-card report-stat">
                    <span>Detection confidence <small>(measured)</small></span>
                    <strong>{detection?.ai_confidence_pct ?? "—"}%</strong>
                    <p>
                        Mean detector confidence over {Number(detection?.sample_size || 0).toLocaleString()} detections,
                        against a {detection?.manual_detection_rate_pct ?? "—"}% manual baseline.
                    </p>
                </article>
            </section>

            <section className="dashboard-grid dashboard-grid--two">
                <article className="workspace-card">
                    <span className="section-label">Cost of poor quality <small>(recorded)</small></span>
                    <h2>{money(copq?.total, currency)} written off this period.</h2>
                    <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
                        {(copq?.categories || []).map((row) => (
                            <div key={row.category}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                                    <span>{row.category}</span>
                                    <b>{row.percent}% ({money(row.amount, currency)})</b>
                                </div>
                                <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", marginTop: "4px", overflow: "hidden" }}>
                                    <div style={{ width: `${row.percent}%`, height: "100%", background: "var(--accent)" }} />
                                </div>
                                <small style={{ color: "var(--muted)", fontSize: "0.62rem" }}>{row.events} recorded events</small>
                            </div>
                        ))}
                        {!copq?.categories?.length && <p style={{ opacity: 0.7 }}>No loss events recorded for this period.</p>}
                    </div>
                </article>

                <article className="workspace-card">
                    <span className="section-label">Budget-impact simulator <small>(modelled)</small></span>
                    <h2>Shift volume before the cost moves.</h2>
                    {simulation ? (
                        <>
                            <p>
                                Move volume from <b>{simulation.from.name}</b> (quality {simulation.from.avg_quality},
                                {" "}{simulation.from.reject_rate}% rejected) to <b>{simulation.to.name}</b> (quality {simulation.to.avg_quality},
                                {" "}{simulation.to.reject_rate}% rejected).
                            </p>
                            <div className="simulator">
                                <label>
                                    Volume to shift
                                    <input type="range" min="0" max="40" value={shiftPct} onChange={(event) => setShiftPct(Number(event.target.value))} />
                                    <b>{shiftPct}%</b>
                                </label>
                                <div>
                                    <span>Units moved per quarter</span>
                                    <strong>{simulation.unitsMoved.toLocaleString()}</strong>
                                </div>
                                <div>
                                    <span>Projected reject-cost reduction</span>
                                    <strong>{money(simulation.costReduction, currency)} / quarter</strong>
                                </div>
                                <div>
                                    <span>Quality score impact</span>
                                    <strong className="positive">+{simulation.qualityImpact} pts</strong>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p style={{ opacity: 0.7 }}>Not enough supplier history to simulate a volume shift.</p>
                    )}
                </article>
            </section>
        </OperationsShell>
    );
}

export default Reports;
