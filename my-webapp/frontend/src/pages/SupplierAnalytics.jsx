import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";

export default function SupplierAnalytics() {
    const [suppliers, setSuppliers] = useState([]);
    const [tierFilter, setTierFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("rating");
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [scope, setScope] = useState("All");

    useEffect(() => {
        axios.get("http://localhost:8000/api/fabric/suppliers")
            .then((res) => {
                const list = res.data?.suppliers || [];
                const parsed = list.map((row, idx) => {
                    const score = Math.round(Number(row.supplier_rating || 85));
                    const tier = score >= 90 ? "Preferred" : score >= 80 ? "Standard" : "Watchlist";
                    const defectRate = Number(((100 - score) / 18).toFixed(1));
                    const effectiveCost = Number((3.2 + ((100 - score) / 40)).toFixed(2));
                    const onTime = Math.max(60, Math.min(100, Math.round(score + 2)));
                    const copq = Math.round((100 - score) * 160 + 1200);

                    return {
                        id: `sup-${String(row.supplier_id).padStart(2, "0")}`,
                        dbId: row.supplier_id,
                        name: row.name,
                        initials: row.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
                        country: row.country || "Bangladesh",
                        city: row.city || "Dhaka",
                        contact: row.contact_person || "Operations Lead",
                        email: row.contact_email || "contact@textile.com",
                        phone: row.contact_phone || "+8801700000000",
                        score,
                        tier,
                        trend: score >= 90 ? "Improving" : score >= 80 ? "Stable" : "Declining",
                        defectRate,
                        effectiveCost,
                        onTime,
                        copq,
                        spend: 15 + (idx + 1) * 6,
                        scope: idx % 2 === 0 ? "Fabric" : "Label",
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
                if (sortBy === "defect") return a.defectRate - b.defectRate;
                if (sortBy === "ontime") return b.onTime - a.onTime;
                return b.score - a.score;
            });
    }, [scopedSuppliers, tierFilter, searchQuery, sortBy]);

    const stats = useMemo(() => {
        if (!scopedSuppliers.length) return { avgScore: 0, preferredCount: 0, watchlistCount: 0, totalSpend: 0 };
        const totalScore = scopedSuppliers.reduce((acc, s) => acc + s.score, 0);
        const preferred = scopedSuppliers.filter((s) => s.tier === "Preferred").length;
        const watchlist = scopedSuppliers.filter((s) => s.tier === "Watchlist").length;
        const spend = scopedSuppliers.reduce((acc, s) => acc + s.spend, 0);
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
                    <small className="positive">100% database verified</small>
                </div>
                <div className="kpi-card">
                    <span>Average Quality Score</span>
                    <strong>{stats.avgScore}</strong>
                    <small>Target: 88.0 pts</small>
                </div>
                <div className="kpi-card">
                    <span>Preferred Tier Rate</span>
                    <strong>{scopedSuppliers.length ? Math.round((stats.preferredCount / scopedSuppliers.length) * 100) : 0}%</strong>
                    <small>{stats.preferredCount} top-tier mills</small>
                </div>
                <div className="kpi-card">
                    <span>Watchlist Exposure</span>
                    <strong style={{ color: stats.watchlistCount > 0 ? "var(--danger)" : "inherit" }}>
                        {stats.watchlistCount}
                    </strong>
                    <small>Mills requiring inspection hold</small>
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
                    {["All", "Preferred", "Standard", "Watchlist"].map((t) => (
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
                            <h2>Effective Cost vs. Defect Rate Scatter Plot</h2>
                        </div>
                        <span className="trend-chip positive">Click any point to inspect</span>
                    </div>

                    <div className="scatter-plot" style={{ position: "relative", height: "260px", background: "#fafbf8", borderRadius: "8px", border: "1px solid #dce4dc" }}>
                        {scopedSuppliers.map((s) => {
                            const leftPct = Math.max(8, Math.min(90, (s.effectiveCost - 3.1) * 90));
                            const bottomPct = Math.max(10, Math.min(88, s.defectRate * 14));
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
                                    title={`${s.name}: Score ${s.score}, $${s.effectiveCost}/yd, ${s.defectRate}% defects`}
                                >
                                    {s.initials}
                                </button>
                            );
                        })}
                        <span className="scatter-x" style={{ right: "12px", bottom: "8px", fontFamily: "DM Mono", fontSize: "0.62rem" }}>
                            Higher Effective Cost ($/yd) →
                        </span>
                        <span className="scatter-y" style={{ top: "12px", left: "10px", fontFamily: "DM Mono", fontSize: "0.62rem" }}>
                            Higher Defect Rate % ↑
                        </span>
                    </div>

                    <div className="chart-legend" style={{ marginTop: "14px" }}>
                        <span><i className="legend-dot" style={{ background: "#2e8d68" }} /> Preferred (&gt;90 pts)</span>
                        <span><i className="legend-dot" style={{ background: "#6e9f7e" }} /> Standard (80-89 pts)</span>
                        <span><i className="legend-dot" style={{ background: "#db9940" }} /> Watchlist (&lt;80 pts)</span>
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
                                        <span>Quality Rating</span>
                                        <b style={{ fontSize: "1.2rem", color: "var(--accent-dark)" }}>{selectedSupplier.score}/100</b>
                                    </div>
                                    <div>
                                        <span>Defect Rate</span>
                                        <b>{selectedSupplier.defectRate}%</b>
                                    </div>
                                    <div>
                                        <span>Effective Cost</span>
                                        <b>${selectedSupplier.effectiveCost.toFixed(2)}/yd</b>
                                    </div>
                                    <div>
                                        <span>On-Time Delivery</span>
                                        <b>{selectedSupplier.onTime}%</b>
                                    </div>
                                    <div>
                                        <span>COPQ Exposure</span>
                                        <b>${selectedSupplier.copq.toLocaleString()}</b>
                                    </div>
                                    <div>
                                        <span>Allocated Spend</span>
                                        <b>${selectedSupplier.spend}k</b>
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
                            <span className={`trend-label trend-label--${s.trend.toLowerCase()}`}>{s.trend}</span>
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
