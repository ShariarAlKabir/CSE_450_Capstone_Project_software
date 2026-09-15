import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";

export default function SupplierAnalytics() {
    const [suppliers, setSuppliers] = useState([]);
    const [tierFilter, setTierFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("rating");
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [scope, setScope] = useState("Fabric");
    const [target, setTarget] = useState(null);

    // Quality target is stored in cost_parameters, not written into the page.
    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope } })
            .then((response) => setTarget(response.data?.quality_target ?? null))
            .catch(() => setTarget(null));
    }, [scope]);

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/label/suppliers`),
        ])
            .then(([fabricRes, labelRes]) => {
                const list = [
                    ...(fabricRes.data?.suppliers || []).map((row) => ({ ...row, scope: "Fabric" })),
                    ...(labelRes.data?.suppliers || []).map((row) => ({ ...row, scope: "Label" })),
                ];
                // Everything below is a column the API measured or a contract
                // amount it read. The previous version derived defect rate,
                // effective cost, on-time delivery, COPQ and spend from the
                // supplier rating with invented formulas - including a spend
                // figure based on the row's position in the array.
                const parsed = list.map((row) => {
                    const isLabel = row.scope === "Label";
                    const score = row.avg_quality != null
                        ? Math.round(Number(row.avg_quality))
                        : Math.round(Number(row.supplier_rating || 0));

                    return {
                        id: `${isLabel ? "lbl" : "sup"}-${String(row.supplier_id).padStart(2, "0")}`,
                        dbId: row.supplier_id,
                        name: row.name,
                        initials: row.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
                        country: row.country || "—",
                        city: row.city || "—",
                        contact: row.contact_person || "—",
                        email: row.contact_email || "",
                        phone: row.contact_phone || "",
                        score,
                        rating: Number(row.supplier_rating || 0),
                        // The DB tier vocabulary is Preferred / Approved / Conditional.
                        tier: row.supplier_tier || "Conditional",
                        trend: null,
                        defectRate: row.defect_rate != null ? Number(row.defect_rate) : null,
                        rejectRate: row.reject_rate != null ? Number(row.reject_rate) : null,
                        unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
                        onTime: row.on_time_pct != null ? Number(row.on_time_pct) : null,
                        copq: row.copq_amount != null ? Number(row.copq_amount) : null,
                        spend: row.annual_spend != null ? Number(row.annual_spend) : null,
                        renewal: row.renewal_date,
                        contractCode: row.contract_code,
                        scope: row.scope,
                        inspections: Number(row.inspections || 0),
                        shipments: Number(row.shipment_count || 0),
                    };
                });
                setSuppliers(parsed);
                if (parsed.length > 0) setSelectedSupplier(parsed[0]);
            })
            .catch(() => setSuppliers([]));
    }, []);

    const scopedSuppliers = useMemo(() => {
        return suppliers.filter((s) => scope === "All" || s.scope === scope);
    }, [suppliers, scope]);

    const scopeCounts = {
        All: suppliers.length,
        Fabric: suppliers.filter((s) => s.scope === "Fabric").length,
        Label: suppliers.filter((s) => s.scope === "Label").length,
    };

    const filtered = useMemo(() => {
        return scopedSuppliers
            .filter((s) => (tierFilter === "All" || s.tier === tierFilter) && s.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a, b) => {
                if (sortBy === "name") return a.name.localeCompare(b.name);
                if (sortBy === "rating") return b.score - a.score;
                if (sortBy === "defect") return (a.defectRate ?? Infinity) - (b.defectRate ?? Infinity);
                if (sortBy === "ontime") return (b.onTime ?? -1) - (a.onTime ?? -1);
                return b.score - a.score;
            });
    }, [scopedSuppliers, tierFilter, searchQuery, sortBy]);

    // Axis ranges for the scatter plot, from the data actually loaded.
    const priceRange = useMemo(() => {
        const values = scopedSuppliers.map((s) => Number(s.unitPrice)).filter((v) => Number.isFinite(v));
        if (!values.length) return { min: 0, max: 0, span: 0 };
        const min = Math.min(...values);
        const max = Math.max(...values);
        return { min, max, span: max - min };
    }, [scopedSuppliers]);

    const defectRange = useMemo(() => {
        const values = scopedSuppliers.map((s) => Number(s.defectRate)).filter((v) => Number.isFinite(v));
        if (!values.length) return { min: 0, max: 0, span: 0 };
        const min = Math.min(...values);
        const max = Math.max(...values);
        return { min, max, span: max - min };
    }, [scopedSuppliers]);

    const stats = useMemo(() => {
        if (!scopedSuppliers.length) return { avgScore: 0, preferredCount: 0, watchlistCount: 0, totalSpend: 0 };
        const totalScore = scopedSuppliers.reduce((acc, s) => acc + s.score, 0);
        const preferred = scopedSuppliers.filter((s) => s.tier === "Preferred").length;
        const watchlist = scopedSuppliers.filter((s) => s.tier === "Conditional").length;
        const spend = scopedSuppliers.reduce((acc, s) => acc + (Number(s.spend) || 0), 0);
        return {
            avgScore: (totalScore / scopedSuppliers.length).toFixed(1),
            preferredCount: preferred,
            watchlistCount: watchlist,
            totalSpend: spend,
        };
    }, [scopedSuppliers]);

    return (
        <OperationsShell
            eyebrow="Supplier intelligence & scorecard analysis"
            title="Strategic source performance and risk allocation."
            actions={
                <>
                    <button className="button button-quiet" onClick={() => window.print()}>Export scorecard</button>
                    <Link className="button button-primary" to="/suppliers">Manage suppliers</Link>
                </>
            }
        >
            {/* KPI Summary Cards */}
            <section className="kpi-grid">
                <div className="kpi-card">
                    <span>Active Suppliers</span>
                    <strong>{scopedSuppliers.length}</strong>
                    <small>{scopedSuppliers.reduce((acc, s) => acc + s.inspections, 0).toLocaleString()} inspections on record</small>
                </div>
                <div className="kpi-card">
                    <span>Average Quality Score</span>
                    <strong>{stats.avgScore}</strong>
                    <small>Target: {target != null ? `${target} pts` : "—"}</small>
                </div>
                <div className="kpi-card">
                    <span>Preferred Tier Rate</span>
                    <strong>{scopedSuppliers.length ? Math.round((stats.preferredCount / scopedSuppliers.length) * 100) : 0}%</strong>
                    <small>{stats.preferredCount} Preferred suppliers</small>
                </div>
                <div className="kpi-card">
                    <span>Watchlist Exposure</span>
                    <strong style={{ color: stats.watchlistCount > 0 ? "var(--danger)" : "inherit" }}>
                        {stats.watchlistCount}
                    </strong>
                    <small>Conditional tier · {stats.totalSpend ? `$${Math.round(stats.totalSpend).toLocaleString()} total spend` : "no contract on file"}</small>
                </div>
            </section>

            {/* Interactive Filters and Control Bar */}
            <section className="workspace-card supplier-filterbar" style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "center" }}>
                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by supplier name or location..."
                    aria-label="Search suppliers"
                    style={{ flex: 1, minWidth: "220px", borderBottom: "1px solid var(--line)" }}
                />
                <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                <div className="filter-pills">
                    {["All", "Preferred", "Approved", "Conditional"].map((t) => (
                        <button
                            key={t}
                            className={tierFilter === t ? "is-active" : ""}
                            onClick={() => setTierFilter(t)}
                        >
                            {t} {t !== "All" && `(${scopedSuppliers.filter((s) => s.tier === t).length})`}
                        </button>
                    ))}
                </div>
                <label className="select-control">
                    Sort by
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="rating">Rating (High to Low)</option>
                        <option value="name">Supplier Name</option>
                        <option value="defect">Lowest Defect Rate</option>
                        <option value="ontime">Best On-Time Delivery</option>
                    </select>
                </label>
            </section>

            {/* Interactive Scatter Plot & Quality Matrix */}
            <section className="dashboard-grid dashboard-grid--analytics">
                <article className="workspace-card workspace-card--large">
                    <div className="card-heading">
                        <div>
                            <span className="section-label">Interactive Quality Matrix</span>
                            <h2>Contract Unit Price vs. Defect Rate</h2>
                        </div>
                        <span className="trend-chip positive">Click any point to inspect</span>
                    </div>

                    <div className="scatter-plot" style={{ position: "relative", height: "260px", background: "#fafbf8", borderRadius: "8px", border: "1px solid #dce4dc" }}>
                        {scopedSuppliers.map((s) => {
                            // Axes are scaled to the real spread of the loaded data, so a point
                            // position means something instead of fitting an assumed range.
                            const leftPct = priceRange.span
                                ? 8 + ((Number(s.unitPrice || priceRange.min) - priceRange.min) / priceRange.span) * 82
                                : 50;
                            const bottomPct = defectRange.span
                                ? 10 + ((Number(s.defectRate || 0) - defectRange.min) / defectRange.span) * 78
                                : 50;
                            const isSel = selectedSupplier?.id === s.id;

                            return (
                                <button
                                    key={s.id}
                                    className={`scatter-point scatter-point--${s.tier.toLowerCase()}`}
                                    style={{
                                        left: `${leftPct}%`,
                                        bottom: `${bottomPct}%`,
                                        transform: isSel ? "translate(-50%, 50%) scale(1.3)" : "translate(-50%, 50%)",
                                        boxShadow: isSel ? "0 0 0 3px var(--ink)" : "0 3px 8px rgba(0,0,0,0.15)",
                                        zIndex: isSel ? 5 : 2,
                                        transition: "transform 150ms ease",
                                    }}
                                    onClick={() => setSelectedSupplier(s)}
                                    title={`${s.name}: quality ${s.score}, ${s.unitPrice != null ? `$${s.unitPrice}/unit` : "no contract"}, ${s.defectRate ?? "—"} defects/inspection`}
                                >
                                    {s.initials}
                                </button>
                            );
                        })}
                        <span className="scatter-x" style={{ right: "12px", bottom: "8px", fontFamily: "DM Mono", fontSize: "0.62rem" }}>
                            Higher Contract Unit Price ($) →
                        </span>
                        <span className="scatter-y" style={{ top: "12px", left: "10px", fontFamily: "DM Mono", fontSize: "0.62rem" }}>
                            More Defects per Inspection ↑
                        </span>
                    </div>

                    <div className="chart-legend" style={{ marginTop: "14px" }}>
                        <span><i className="legend-dot" style={{ background: "#2e8d68" }} /> Preferred</span>
                        <span><i className="legend-dot" style={{ background: "#6e9f7e" }} /> Approved</span>
                        <span><i className="legend-dot" style={{ background: "#db9940" }} /> Conditional</span>
                    </div>
                </article>

                {/* Selected Supplier Highlight Panel */}
                <article className="workspace-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    {selectedSupplier ? (
                        <>
                            <div>
                                <div className="card-heading" style={{ marginBottom: "12px" }}>
                                    <div>
                                        <span className="section-label">Selected Mill Profile</span>
                                        <h2>{selectedSupplier.name}</h2>
                                        <p>{selectedSupplier.city}, {selectedSupplier.country} · {selectedSupplier.contact}</p>
                                    </div>
                                    <span className={`tier-badge tier-badge--${selectedSupplier.tier.toLowerCase()}`}>
                                        {selectedSupplier.tier}
                                    </span>
                                </div>

                                <div className="supplier-stat-grid" style={{ marginTop: "12px" }}>
                                    <div>
                                        <span>Measured Quality</span>
                                        <b style={{ fontSize: "1.2rem", color: "var(--accent-dark)" }}>{selectedSupplier.score}/100</b>
                                    </div>
                                    <div>
                                        <span>Defects / Inspection</span>
                                        <b>{selectedSupplier.defectRate ?? "—"}</b>
                                    </div>
                                    <div>
                                        <span>Contract Unit Price</span>
                                        <b>{selectedSupplier.unitPrice != null ? `$${selectedSupplier.unitPrice}` : "—"}</b>
                                    </div>
                                    <div>
                                        <span>On-Time Delivery</span>
                                        <b>{selectedSupplier.onTime != null ? `${selectedSupplier.onTime}%` : "—"}</b>
                                    </div>
                                    <div>
                                        <span>COPQ Recorded</span>
                                        <b>{selectedSupplier.copq != null ? `$${Math.round(selectedSupplier.copq).toLocaleString()}` : "—"}</b>
                                    </div>
                                    <div>
                                        <span>Annual Spend</span>
                                        <b>{selectedSupplier.spend != null ? `$${Math.round(selectedSupplier.spend).toLocaleString()}` : "—"}</b>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid var(--line)", display: "flex", gap: "10px" }}>
                                <Link
                                    className="button button-primary button-primary--wide"
                                    to={`/suppliers?selected=${selectedSupplier.id}`}
                                    style={{ flex: 1, textAlign: "center" }}
                                >
                                    Open Full Supplier Profile →
                                </Link>
                            </div>
                        </>
                    ) : (
                        <p>Select a supplier to see performance metrics.</p>
                    )}
                </article>
            </section>

            {/* Detailed Supplier Table with Live Data */}
            <section className="workspace-card" style={{ marginTop: "14px" }}>
                <div className="card-heading">
                    <div>
                        <span className="section-label">Comprehensive Scorecard</span>
                        <h2>Supplier Ranking Register ({filtered.length} Mills)</h2>
                    </div>
                </div>

                <div className="supplier-table" style={{ marginTop: "10px" }}>
                    {filtered.map((s) => (
                        <div
                            key={s.id}
                            className={`supplier-row ${selectedSupplier?.id === s.id ? "is-selected" : ""}`}
                            onClick={() => setSelectedSupplier(s)}
                            style={{ cursor: "pointer" }}
                        >
                            <span className="avatar">{s.initials}</span>
                            <span>
                                <strong>{s.name}</strong>
                                <small>{s.city}, {s.country} · {s.contact}</small>
                            </span>
                            <span className={`tier-badge tier-badge--${s.tier.toLowerCase()}`}>{s.tier}</span>
                            <span className="trend-label">{s.rejectRate != null ? `${s.rejectRate}% rejected` : "no inspections"}</span>
                            <strong>{s.score}</strong>
                            <Link
                                to={`/suppliers?selected=${s.id}`}
                                className="text-link"
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: "0.68rem" }}
                            >
                                Profile →
                            </Link>
                        </div>
                    ))}
                </div>
            </section>
        </OperationsShell>
    );
}
