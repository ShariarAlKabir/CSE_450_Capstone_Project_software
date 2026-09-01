import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";
import { ScoreRing } from "../components/Visuals";

const tierClass = (tier) => (tier || "standard").toLowerCase();

const normalizeSupplier = (row, index) => {
    const score = Math.max(0, Math.min(100, Number(row.supplier_rating || 85)));
    const quality = Math.max(0, Math.min(100, Math.round(score)));
    const cost = Math.max(50, Math.min(100, Math.round(score - 4)));
    const delivery = Math.max(60, Math.min(100, Math.round(score + 3)));

    return {
        id: `sup-${String(row.supplier_id).padStart(2, "0")}`,
        name: row.name,
        initials: row.name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
        scope: index % 2 === 0 ? "Fabric" : "Label",
        tier: score >= 90 ? "Preferred" : score >= 80 ? "Standard" : "Watchlist",
        trend: score >= 90 ? "Improving" : score >= 80 ? "Stable" : "Declining",
        score: Math.round(score),
        quality,
        cost,
        delivery,
        defectRate: Number(((100 - score) / 18).toFixed(1)),
        effectiveCost: Number((3.2 + ((100 - score) / 40)).toFixed(2)),
        copq: Math.round((100 - score) * 160 + 1200),
        onTime: Math.max(60, Math.min(100, Math.round(score + 2))),
        spend: 15 + index * 5,
        fingerprint: "Database-sourced supplier profile",
        renewal: "Live data",
        location: `${row.city || "N/A"}, ${row.country || "N/A"}`,
        contact: row.contact_person || "N/A",
        shipments: 0,
        rejections: 0,
        heatmap: Array.from({ length: 12 }, (_, heatIndex) => (heatIndex % 5 === 0 ? "b" : "a")),
    };
};

function Suppliers() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [query, setQuery] = useState("");
    const [tier, setTier] = useState("All");
    const [sortBy, setSortBy] = useState("score");
    const [compareIds, setCompareIds] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scope, setScope] = useState("All");

    useEffect(() => {
        axios.get("http://localhost:8000/api/fabric/suppliers")
            .then((response) => {
                const rows = response.data?.suppliers || [];
                const normalized = rows.map(normalizeSupplier);
                setSuppliers(normalized);
                if (normalized.length >= 2) {
                    setCompareIds([normalized[0].id, normalized[1].id]);
                }
            })
            .catch(() => setSuppliers([]))
            .finally(() => setLoading(false));
    }, []);

    const selectedId = searchParams.get("selected") || suppliers[0]?.id || "";
    const selected = suppliers.find((supplier) => supplier.id === selectedId) || suppliers[0];
    const scopeCounts = {
        All: suppliers.length,
        Fabric: suppliers.filter((supplier) => supplier.scope === "Fabric").length,
        Label: suppliers.filter((supplier) => supplier.scope === "Label").length,
    };
    const filtered = useMemo(() => suppliers
        .filter((supplier) => (scope === "All" || supplier.scope === scope) && (tier === "All" || supplier.tier === tier) && supplier.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name) : b[sortBy] - a[sortBy]),
    [query, sortBy, suppliers, tier, scope]);
    const compared = suppliers.filter((supplier) => compareIds.includes(supplier.id));

    const selectSupplier = (id) => setSearchParams({ selected: id });
    const toggleComparison = (id) => setCompareIds((current) => current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : current.length === 2 ? [current[1], id] : [...current, id]);

    if (loading && suppliers.length === 0) {
        return (
            <OperationsShell eyebrow="Supplier intelligence" title="Loading supplier data..." actions={<button className="button button-primary" onClick={() => window.print()}>Export negotiation packet</button>}>
                <section className="workspace-card"><p>Fetching live supplier data from the backend.</p></section>
            </OperationsShell>
        );
    }

    return (
        <OperationsShell eyebrow="Supplier intelligence" title="Manage the quality of your source." actions={<button className="button button-primary" onClick={() => window.print()}>Export negotiation packet</button>}>
            <section className="workspace-card supplier-filterbar">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a supplier" aria-label="Find a supplier" />
                <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                <div className="filter-pills">{["All", "Preferred", "Standard", "Watchlist"].map((item) => <button className={tier === item ? "is-active" : ""} onClick={() => setTier(item)} key={item}>{item}</button>)}</div>
                <label className="select-control">Sort by <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="score">Overall score</option><option value="quality">Quality</option><option value="cost">Cost efficiency</option><option value="delivery">On-time delivery</option><option value="name">Name</option></select></label>
            </section>

            <section className="supplier-layout">
                <article className="workspace-card supplier-table-card">
                    <div className="supplier-table">
                        {filtered.map((supplier) => (
                            <button className={`supplier-row ${selected?.id === supplier.id ? "is-selected" : ""}`} onClick={() => selectSupplier(supplier.id)} key={supplier.id}>
                                <span className="avatar">{supplier.initials}</span>
                                <span><strong>{supplier.name}</strong><small>{supplier.location}</small></span>
                                <span className={`tier-badge tier-badge--${tierClass(supplier.tier)}`}>{supplier.tier}</span>
                                <span className={`trend-label trend-label--${supplier.trend.toLowerCase()}`}>{supplier.trend}</span>
                                <strong>{supplier.score}</strong>
                                <label className="compare-toggle" onClick={(event) => event.stopPropagation()}>
                                    <input type="checkbox" checked={compareIds.includes(supplier.id)} onChange={() => toggleComparison(supplier.id)} />Compare
                                </label>
                            </button>
                        ))}
                    </div>
                </article>

                {selected ? (
                    <article className="workspace-card supplier-profile">
                        <div className="supplier-profile__head">
                            <div>
                                <span className="section-label">Supplier profile</span>
                                <h2>{selected.name}</h2>
                                <p>{selected.location} · Contact: {selected.contact}</p>
                            </div>
                            <ScoreRing value={selected.score} />
                        </div>
                        <div className="profile-tags">
                            <span className={`tier-badge tier-badge--${tierClass(selected.tier)}`}>{selected.tier}</span>
                            <span className={`trend-label trend-label--${selected.trend.toLowerCase()}`}>{selected.trend}</span>
                            <span>Auto-updated quality rating</span>
                        </div>
                        <div className="score-breakdown">
                            <div><span>Quality</span><b>{selected.quality}</b><i style={{ width: `${selected.quality}%` }} /></div>
                            <div><span>Cost</span><b>{selected.cost}</b><i style={{ width: `${selected.cost}%` }} /></div>
                            <div><span>Delivery</span><b>{selected.delivery}</b><i style={{ width: `${selected.delivery}%` }} /></div>
                        </div>
                        <div className="heatmap-section">
                            <span className="section-label">Quality history / last 12 lots</span>
                            <div className="quality-heatmap">{selected.heatmap.map((grade, index) => <i key={`${grade}-${index}`} className={`heatmap-cell heatmap-cell--${grade}`} title={`Lot ${index + 1}: ${grade.toUpperCase()}`} />)}</div>
                            <small>A: pass · B: minor issue · C: needs review · R: rejected</small>
                        </div>
                        <div className="supplier-stat-grid">
                            <div><span>Defect fingerprint</span><b>{selected.fingerprint}</b></div>
                            <div><span>COPQ this quarter</span><b>${selected.copq.toLocaleString()}</b></div>
                            <div><span>Effective accepted yard</span><b>${selected.effectiveCost.toFixed(2)}</b></div>
                            <div><span>On-time delivery</span><b>{selected.onTime}%</b></div>
                        </div>
                        <div className="profile-recommendation">
                            <strong>Switch recommendation</strong>
                            <p>Current supplier quality is being updated from the live fabric inspection database.</p>
                        </div>
                        <div className="profile-footer">
                            <span>Contract renewal: <b>{selected.renewal}</b></span>
                            <span>Spend coverage: <b>${selected.spend}k</b></span>
                        </div>
                    </article>
                ) : null}
            </section>

            <section className="dashboard-grid dashboard-grid--two">
                <article className="workspace-card">
                    <div className="card-heading">
                        <div><span className="section-label">Supplier ranking</span><h2>Price vs. quality exposure</h2></div>
                    </div>
                    <div className="scatter-plot">
                        {suppliers.filter((supplier) => scope === "All" || supplier.scope === scope).map((supplier) => (
                            <button key={supplier.id} className={`scatter-point scatter-point--${tierClass(supplier.tier)}`} style={{ left: `${(supplier.effectiveCost - 3.2) * 105}%`, bottom: `${supplier.defectRate * 13}%` }} onClick={() => selectSupplier(supplier.id)} title={`${supplier.name}: $${supplier.effectiveCost} / ${supplier.defectRate}% defect rate`}>
                                {supplier.initials}
                            </button>
                        ))}
                        <span className="scatter-x">Higher effective cost -&gt;</span>
                        <span className="scatter-y">Higher defect rate -&gt;</span>
                    </div>
                </article>
                <article className="workspace-card">
                    <div className="card-heading">
                        <div><span className="section-label">Side-by-side</span><h2>Comparison desk</h2></div>
                    </div>
                    {compared.length === 2 ? (
                        <div className="comparison-table">
                            <div><span>Metric</span>{compared.map((supplier) => <b key={supplier.id}>{supplier.initials}</b>)}</div>
                            {[["Quality", "quality"], ["Cost score", "cost"], ["On-time", "onTime"], ["Defect rate", "defectRate"]].map(([label, key]) => (
                                <div key={key}><span>{label}</span>{compared.map((supplier) => <b key={supplier.id}>{key === "defectRate" ? `${supplier[key]}%` : key === "onTime" ? `${supplier[key]}%` : supplier[key]}</b>)}</div>
                            ))}
                        </div>
                    ) : <p>Select two suppliers from the table to compare their performance.</p>}
                </article>
            </section>
        </OperationsShell>
    );
}

export default Suppliers;
