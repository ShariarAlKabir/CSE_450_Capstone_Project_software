import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";
import ComparisonEvidence from "../components/ComparisonEvidence";
import FilterBar, { FilterGroup, FilterPills } from "../components/FilterBar";

// Categorical slots 1-4, validated for CVD separation and the chroma/lightness
// bands against a white card surface. Every value is direct-labelled in the
// comparison table, which is the required relief for the sub-3:1 contrast of
// slots 3 and 4.
const COMPARE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const MAX_COMPARE = COMPARE_COLORS.length;

// Tier fill for the scatter. These describe a stored property of the supplier,
// not its rank, so filtering never repaints a point.
const TIER_FILL = {
    Preferred: "#2e8d68",
    Approved: "#8fae9a",
    Conditional: "#db9940",
};

const money = (value) =>
    value == null ? "—" : `$${Math.round(Number(value)).toLocaleString()}`;
const num = (value, digits = 1) =>
    value == null ? "—" : Number(value).toFixed(digits);

// Every metric is either a stored column or an arithmetic combination of stored
// columns. `better` drives which end of the row wins; "none" means the metric is
// context (how big is this supplier) rather than performance.
const METRICS = [
    {
        key: "quality", group: "Quality", label: "Measured quality", better: "high",
        format: (v) => num(v, 1), suffix: "/100",
        help: "Mean quality of this supplier's own inspections, 0-100.",
    },
    {
        key: "rating", group: "Quality", label: "Contract rating", better: "high",
        format: (v) => num(v, 1), suffix: "/100",
        help: "The rating agreed in the contract, not an observed value.",
    },
    {
        key: "qualityDelta", group: "Quality", label: "Measured vs contract", better: "high",
        format: (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`), suffix: "pts",
        help: "Measured quality minus contract rating. Negative means the supplier is under-performing its own contract.",
        signed: true,
    },
    {
        key: "defectRate", group: "Quality", label: "Defects per inspection", better: "low",
        format: (v) => num(v, 2),
        help: "Total defects divided by inspections, so volume does not distort it.",
    },
    {
        key: "rejectRate", group: "Quality", label: "Reject rate", better: "low",
        format: (v) => num(v, 1), suffix: "%",
        help: "Share of this supplier's inspections that were rejected.",
    },
    {
        key: "onTime", group: "Delivery", label: "On-time delivery", better: "high",
        format: (v) => num(v, 1), suffix: "%",
        help: "Shipments received on or before the promised date.",
    },
    {
        key: "unitPrice", group: "Cost", label: "Contract unit price", better: "low",
        format: (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`),
        help: "Price per yard (fabric) or per label, from the contract.",
    },
    {
        key: "effectiveCost", group: "Cost", label: "Effective cost / accepted unit", better: "low",
        format: (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`),
        help: "Unit price divided by the acceptance rate. What a unit you can actually use costs once rejects are paid for.",
    },
    {
        key: "copqPerUnit", group: "Cost", label: "COPQ per inspection", better: "low",
        format: (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`),
        help: "Recorded loss divided by inspections — comparable across suppliers of different size.",
    },
    {
        key: "copqShare", group: "Cost", label: "COPQ as share of spend", better: "low",
        format: (v) => num(v, 1), suffix: "%",
        help: "Recorded loss as a percentage of annual spend with this supplier.",
    },
    {
        key: "copq", group: "Cost", label: "COPQ recorded", better: "low",
        format: money,
        help: "Total recorded scrap, rework, downtime and chargebacks caused by this supplier.",
    },
    {
        key: "spend", group: "Scale", label: "Annual spend", better: "none",
        format: money,
        help: "Contracted annual spend, computed from delivered volume.",
    },
    {
        key: "inspections", group: "Scale", label: "Inspections on record", better: "none",
        format: (v) => (v == null ? "—" : Number(v).toLocaleString()),
        help: "How much evidence the other metrics rest on.",
    },
    {
        key: "shipments", group: "Scale", label: "Shipments", better: "none",
        format: (v) => (v == null ? "—" : Number(v).toLocaleString()),
        help: "Deliveries received from this supplier.",
    },
];

const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m]));
const GROUPS = ["Quality", "Delivery", "Cost", "Scale"];

const shapeSupplier = (row) => {
    const isLabel = row.scope === "Label";
    const quality = row.avg_quality != null ? Number(row.avg_quality) : null;
    const rating = row.supplier_rating != null ? Number(row.supplier_rating) : null;
    const rejectRate = row.reject_rate != null ? Number(row.reject_rate) : null;
    const unitPrice = row.unit_price != null ? Number(row.unit_price) : null;
    const copq = row.copq_amount != null ? Number(row.copq_amount) : null;
    const spend = row.annual_spend != null ? Number(row.annual_spend) : null;
    const inspections = Number(row.inspections || 0);

    return {
        id: `${isLabel ? "lbl" : "sup"}-${String(row.supplier_id).padStart(2, "0")}`,
        dbId: row.supplier_id,
        name: row.name,
        initials: row.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
        scope: row.scope,
        tier: row.supplier_tier || "Conditional",
        city: row.city || "—",
        country: row.country || "—",
        contact: row.contact_person || "—",
        specialty: row.fabric_specialty || row.label_specialty || "—",
        renewal: row.renewal_date,
        paymentTerms: row.payment_terms,

        // --- comparison metrics -------------------------------------------
        quality,
        qualityInspections: Number(row.quality_inspections || 0),
        qualityStart: row.quality_start,
        qualityEnd: row.quality_end,
        inspectionStart: row.inspection_start,
        inspectionEnd: row.inspection_end,
        rating,
        qualityDelta: quality != null && rating != null ? quality - rating : null,
        defectRate: row.defect_rate != null ? Number(row.defect_rate) : null,
        rejectRate,
        onTime: row.on_time_pct != null ? Number(row.on_time_pct) : null,
        unitPrice,
        // Cost of a unit you can actually use: price / acceptance rate.
        effectiveCost:
            unitPrice != null && rejectRate != null && rejectRate < 100
                ? unitPrice / (1 - rejectRate / 100)
                : null,
        copq,
        copqPerUnit: copq != null && inspections > 0 ? copq / inspections : null,
        copqShare: copq != null && spend ? (copq / spend) * 100 : null,
        spend,
        inspections,
        shipments: Number(row.shipment_count || 0),
    };
};

export default function SupplierAnalytics() {
    const [suppliers, setSuppliers] = useState([]);
    const [scope, setScope] = useState("Fabric");
    const [tierFilter, setTierFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("quality");
    const [sortDir, setSortDir] = useState("desc");
    const [target, setTarget] = useState(null);

    // Fixed-length slot array: adding fills the first free slot, removing frees
    // that slot. A supplier therefore keeps its colour for as long as it is in
    // the comparison, no matter who else joins or leaves.
    const [slots, setSlots] = useState([null, null, null, null]);
    const [xMetric, setXMetric] = useState("unitPrice");
    const [yMetric, setYMetric] = useState("defectRate");
    const [hovered, setHovered] = useState(null);
    const [showContext, setShowContext] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [seeded, setSeeded] = useState(false);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope } })
            .then((r) => setTarget(r.data?.quality_target ?? null))
            .catch(() => setTarget(null));
    }, [scope]);

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/label/suppliers`),
        ])
            .then(([fabricRes, labelRes]) => {
                setSuppliers([
                    ...(fabricRes.data?.suppliers || []).map((r) => shapeSupplier({ ...r, scope: "Fabric" })),
                    ...(labelRes.data?.suppliers || []).map((r) => shapeSupplier({ ...r, scope: "Label" })),
                ]);
            })
            .catch(() => setSuppliers([]));
    }, []);

    // Seed the comparison from ?compare=sup-01,sup-12 (the Suppliers page links
    // here with its current selection). Runs once, after the suppliers land, so
    // it never fights a selection the user has since made.
    useEffect(() => {
        if (seeded || !suppliers.length) return;
        setSeeded(true);

        const ids = (searchParams.get("compare") || "")
            .split(",").map((id) => id.trim()).filter(Boolean)
            .filter((id) => suppliers.some((s) => s.id === id))
            .slice(0, MAX_COMPARE);
        if (!ids.length) return;

        // The incoming suppliers have to be inside the active scope or the desk
        // would open empty.
        const scopes = new Set(ids.map((id) => suppliers.find((s) => s.id === id).scope));
        setScope(scopes.size > 1 ? "All" : [...scopes][0]);

        const next = [null, null, null, null];
        ids.forEach((id, i) => { next[i] = id; });
        setSlots(next);
    }, [suppliers, searchParams, seeded]);

    const scoped = useMemo(
        () => suppliers.filter((s) => scope === "All" || s.scope === scope),
        [suppliers, scope],
    );

    const scopeCounts = {
        All: suppliers.length,
        Fabric: suppliers.filter((s) => s.scope === "Fabric").length,
        Label: suppliers.filter((s) => s.scope === "Label").length,
    };

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const rows = scoped.filter(
            (s) =>
                (tierFilter === "All" || s.tier === tierFilter) &&
                (!q || s.name.toLowerCase().includes(q) ||
                    s.city.toLowerCase().includes(q) || s.country.toLowerCase().includes(q)),
        );
        const dir = sortDir === "asc" ? 1 : -1;
        return [...rows].sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name) * dir;
            const av = a[sortBy], bv = b[sortBy];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;          // nulls always sink
            if (bv == null) return -1;
            return (av - bv) * dir;
        });
    }, [scoped, tierFilter, searchQuery, sortBy, sortDir]);

    // ---- comparison selection -------------------------------------------
    const selected = slots.map((id) => (id ? scoped.find((s) => s.id === id) : null));
    const compared = selected.filter(Boolean);
    const colorOf = (id) => {
        const idx = slots.indexOf(id);
        return idx === -1 ? null : COMPARE_COLORS[idx];
    };
    const isCompared = (id) => slots.includes(id);

    const toggleCompare = (id) => {
        setSlots((prev) => {
            const at = prev.indexOf(id);
            if (at !== -1) {
                const next = [...prev];
                next[at] = null;                      // frees the slot, keeps others
                return next;
            }
            const free = prev.indexOf(null);
            if (free === -1) return prev;             // full
            const next = [...prev];
            next[free] = id;
            return next;
        });
    };
    const clearCompare = () => setSlots([null, null, null, null]);

    // Mirror the selection into the URL so the desk can be linked to or reloaded.
    useEffect(() => {
        if (!seeded) return;
        const ids = slots.filter(Boolean);
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            if (ids.length) params.set("compare", ids.join(","));
            else params.delete("compare");
            return params;
        }, { replace: true });
    }, [slots, seeded, setSearchParams]);
    const compareFull = slots.every(Boolean);

    const compareTop = (n) => {
        const next = [null, null, null, null];
        filtered.slice(0, n).forEach((s, i) => { next[i] = s.id; });
        setSlots(next);
    };

    // Comparing the three best suppliers shows four near-identical rows. The
    // contrast people actually want is the spread, so offer that too.
    const compareExtremes = () => {
        const ranked = scoped.filter((s) => s.quality != null).sort((a, b) => b.quality - a.quality);
        if (ranked.length < 2) return;
        const picks = [ranked[0], ranked[Math.floor(ranked.length / 2)], ranked[ranked.length - 1]]
            .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
        const next = [null, null, null, null];
        picks.forEach((s, i) => { next[i] = s.id; });
        setSlots(next);
    };

    // Best value per metric within the compared set, and a per-supplier win count.
    const leaders = useMemo(() => {
        const out = {};
        METRICS.forEach((m) => {
            if (m.better === "none") return;
            const vals = compared.filter((s) => s[m.key] != null);
            if (vals.length < 2) return;
            const best = vals.reduce((a, b) =>
                (m.better === "high" ? b[m.key] > a[m.key] : b[m.key] < a[m.key]) ? b : a);
            // A tie has no winner. Marking the first row best would invent a
            // ranking where the data says the suppliers are level.
            const tied = vals.filter((s) => s[m.key] === best[m.key]).length > 1;
            if (!tied) out[m.key] = best.id;
        });
        return out;
    }, [compared]);

    const wins = useMemo(() => {
        const out = {};
        compared.forEach((s) => { out[s.id] = 0; });
        Object.values(leaders).forEach((id) => { out[id] = (out[id] || 0) + 1; });
        return out;
    }, [leaders, compared]);

    const stats = useMemo(() => {
        if (!scoped.length) return { avg: 0, preferred: 0, conditional: 0, spend: 0, inspections: 0 };
        const q = scoped.filter((s) => s.quality != null).map((s) => s.quality);
        return {
            avg: q.length ? (q.reduce((a, b) => a + b, 0) / q.length).toFixed(1) : "—",
            preferred: scoped.filter((s) => s.tier === "Preferred").length,
            conditional: scoped.filter((s) => s.tier === "Conditional").length,
            spend: scoped.reduce((a, s) => a + (s.spend || 0), 0),
            inspections: scoped.reduce((a, s) => a + s.inspections, 0),
        };
    }, [scoped]);

    // ---- scatter ---------------------------------------------------------
    const axisRange = (key) => {
        const vals = scoped.map((s) => s[key]).filter((v) => v != null && Number.isFinite(v));
        if (!vals.length) return { min: 0, max: 1, span: 1 };
        const min = Math.min(...vals), max = Math.max(...vals);
        return { min, max, span: max - min || 1 };
    };
    const xRange = useMemo(() => axisRange(xMetric), [scoped, xMetric]);
    const yRange = useMemo(() => axisRange(yMetric), [scoped, yMetric]);
    const plotX = (s) => (s[xMetric] == null ? null : 8 + ((s[xMetric] - xRange.min) / xRange.span) * 84);
    const plotY = (s) => (s[yMetric] == null ? null : 10 + ((s[yMetric] - yRange.min) / yRange.span) * 78);

    const sortHeader = (key, label) => (
        <button
            type="button"
            onClick={() => {
                if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                else { setSortBy(key); setSortDir(METRIC_BY_KEY[key]?.better === "low" ? "asc" : "desc"); }
            }}
            style={{
                background: "none", padding: 0, cursor: "pointer", font: "inherit",
                color: sortBy === key ? "var(--ink)" : "var(--muted)",
                fontWeight: sortBy === key ? 700 : 500, whiteSpace: "nowrap",
            }}
        >
            {label}{sortBy === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
    );

    return (
        <OperationsShell
            eyebrow="Supplier intelligence & scorecard analysis"
            title="Compare suppliers on what they actually cost you."
            actions={
                <>
                    <button className="button button-quiet" onClick={() => window.print()}>Export scorecard</button>
                    <Link className="button button-primary" to="/suppliers">Manage suppliers</Link>
                </>
            }
        >
            {/* ---------------------------------------------------------- KPI row */}
            <section className="kpi-grid">
                <div className="kpi-card">
                    <span>Active Suppliers</span>
                    <strong>{scoped.length}</strong>
                    <small>{stats.inspections.toLocaleString()} inspections on record</small>
                </div>
                <div className="kpi-card">
                    <span>Average Quality Score</span>
                    <strong>{stats.avg}</strong>
                    <small>Target: {target != null ? `${target} pts` : "—"}</small>
                </div>
                <div className="kpi-card">
                    <span>Preferred Tier Rate</span>
                    <strong>{scoped.length ? Math.round((stats.preferred / scoped.length) * 100) : 0}%</strong>
                    <small>{stats.preferred} Preferred suppliers</small>
                </div>
                <div className="kpi-card">
                    <span>Watchlist Exposure</span>
                    <strong style={{ color: stats.conditional > 0 ? "var(--danger)" : "inherit" }}>
                        {stats.conditional}
                    </strong>
                    <small>Conditional tier · {money(stats.spend)} total spend</small>
                </div>
            </section>

            {/* ------------------------------------------------------ control bar */}
            <FilterBar>
                <FilterGroup label="Find" grow>
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Supplier name or location"
                        aria-label="Search suppliers"
                    />
                </FilterGroup>
                <FilterGroup label="Domain">
                    <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                </FilterGroup>
                <FilterGroup label="Tier">
                    <FilterPills
                        options={["All", "Preferred", "Approved", "Conditional"]}
                        value={tierFilter}
                        onChange={setTierFilter}
                        counts={{
                            All: scoped.length,
                            Preferred: scoped.filter((s) => s.tier === "Preferred").length,
                            Approved: scoped.filter((s) => s.tier === "Approved").length,
                            Conditional: scoped.filter((s) => s.tier === "Conditional").length,
                        }}
                    />
                </FilterGroup>
                <FilterGroup label="Quick compare">
                    <button className="button button-quiet" onClick={() => compareTop(3)}>Top 3</button>
                    <button className="button button-quiet" onClick={compareExtremes}>Best vs worst</button>
                </FilterGroup>
            </FilterBar>

            {/* --------------------------------------------------- comparison desk */}
            <section className="workspace-card" style={{ marginTop: "14px" }}>
                <div className="card-heading" style={{ flexWrap: "wrap", gap: "10px" }}>
                    <div>
                        <span className="section-label">Comparison desk</span>
                        <h2>
                            {compared.length < 2
                                ? "Pick suppliers to compare"
                                : `${compared.length} suppliers across ${METRICS.filter((m) => showContext || m.better !== "none").length} metrics`}
                        </h2>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--muted)", display: "flex", gap: "6px", alignItems: "center" }}>
                            <input type="checkbox" checked={showContext} onChange={(e) => setShowContext(e.target.checked)} />
                            Show scale metrics
                        </label>
                        {compared.length > 0 && (
                            <button className="button button-quiet" onClick={clearCompare}>Clear</button>
                        )}
                    </div>
                </div>

                {/* selected chips */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px", marginBottom: "14px" }}>
                    {compared.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => toggleCompare(s.id)}
                            title="Remove from comparison"
                            style={{
                                display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
                                padding: "6px 10px", borderRadius: "999px", background: "var(--surface)",
                                border: `1px solid ${colorOf(s.id)}`, fontSize: "0.74rem", fontWeight: 600,
                            }}
                        >
                            <i style={{ width: "9px", height: "9px", borderRadius: "50%", background: colorOf(s.id) }} />
                            {s.name}
                            <span style={{ color: "var(--muted)" }}>×</span>
                        </button>
                    ))}
                    {!compared.length && (
                        <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--muted)" }}>
                            Tick up to {MAX_COMPARE} suppliers in the register below, or click points on the plot.
                        </p>
                    )}
                    {compareFull && (
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)", alignSelf: "center" }}>
                            Maximum of {MAX_COMPARE} — remove one to add another.
                        </span>
                    )}
                </div>

                {compared.length >= 2 ? (
                    <div className="analytics-comparison-scroll" tabIndex={0} role="region" aria-label="Supplier comparison table">
                        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: `${240 + compared.length * 150}px` }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: "left", padding: "0 10px 10px 0", width: "240px" }} />
                                    {compared.map((s) => (
                                        <th key={s.id} style={{
                                            padding: "0 8px 10px", textAlign: "left", verticalAlign: "bottom",
                                            width: `${(100 - 0) / compared.length}%`,
                                        }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <i style={{ width: "9px", height: "9px", borderRadius: "50%", background: colorOf(s.id), flexShrink: 0 }} />
                                                <span style={{ fontSize: "0.74rem", fontWeight: 700, lineHeight: 1.25 }}>{s.name}</span>
                                            </div>
                                            <small style={{ color: "var(--muted)", fontSize: "0.62rem" }}>
                                                {s.tier} · {wins[s.id] || 0} best
                                            </small>
                                            <ComparisonEvidence supplier={s} />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {GROUPS.map((group) => {
                                    const rows = METRICS.filter(
                                        (m) => m.group === group && (showContext || m.better !== "none"),
                                    );
                                    if (!rows.length) return null;
                                    return (
                                        <Fragment key={group}>
                                            <tr>
                                                <td colSpan={compared.length + 1} style={{ padding: "14px 0 4px" }}>
                                                    <span className="section-label" style={{ fontSize: "0.58rem" }}>{group}</span>
                                                </td>
                                            </tr>
                                            {rows.map((m) => {
                                                const vals = compared.map((s) => s[m.key]).filter((v) => v != null);
                                                const max = vals.length ? Math.max(...vals.map(Math.abs)) : 0;
                                                const allSame = vals.length > 1 && vals.every((v) => v === vals[0]);
                                                return (
                                                    <tr key={m.key} style={{ borderTop: "1px solid #eef1ed" }}>
                                                        <td style={{ padding: "8px 10px 8px 0", verticalAlign: "middle" }} title={m.help}>
                                                            <div style={{ fontSize: "0.73rem", fontWeight: 600, lineHeight: 1.3 }}>
                                                                {m.label}{m.suffix ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> ({m.suffix})</span> : null}
                                                            </div>
                                                            <small style={{ color: "var(--muted)", fontSize: "0.6rem" }}>
                                                                {m.better === "high" ? "higher is better"
                                                                    : m.better === "low" ? "lower is better" : "context"}
                                                                {allSame && " · all equal"}
                                                            </small>
                                                        </td>
                                                        {compared.map((s, index) => {
                                                            const v = s[m.key];
                                                            const other = compared.length === 2 ? compared[1 - index] : null;
                                                            const difference = other && v != null && other[m.key] != null
                                                                ? Number(v) - Number(other[m.key]) : null;
                                                            const roundedDifference = difference == null ? null : Number(difference.toFixed(2));
                                                            const deltaTone = roundedDifference == null || roundedDifference === 0
                                                                ? "neutral" : roundedDifference > 0 ? "better" : "worse";
                                                            const isBest = leaders[m.key] === s.id;
                                                            // No bar when there is nothing to compare: an
                                                            // empty track next to "0.0" reads as broken.
                                                            const drawBar = v != null && v !== 0 && max > 0;
                                                            const pct = drawBar ? Math.max(3, (Math.abs(v) / max) * 100) : 0;
                                                            return (
                                                                <td key={s.id} style={{
                                                                    padding: "8px", verticalAlign: "middle",
                                                                    background: isBest ? "color-mix(in srgb, var(--success) 8%, transparent)" : "transparent",
                                                                    borderRadius: "6px",
                                                                }}>
                                                                    <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "5px" }}>
                                                                        <b style={{
                                                                            fontSize: "0.82rem", fontVariantNumeric: "tabular-nums",
                                                                            color: v == null ? "var(--muted)" : "var(--ink)",
                                                                        }}>
                                                                            {m.format(v)}
                                                                        </b>
                                                                        {roundedDifference != null && <span
                                                                            className={`supplier-compare__delta supplier-compare__delta--${deltaTone}`}
                                                                            title={`This value minus ${other.name}'s value${m.suffix === "%" ? " (percentage points)" : ""}`}
                                                                            aria-label={`Difference versus ${other.name}: ${roundedDifference > 0 ? "+" : ""}${roundedDifference}${m.suffix === "%" ? " percentage points" : ""}`}
                                                                        >{roundedDifference > 0 ? "+" : roundedDifference < 0 ? "−" : ""}{Math.abs(roundedDifference).toLocaleString(undefined, { maximumFractionDigits: 2 })}{m.suffix === "%" ? " pp" : ""}</span>}
                                                                        {isBest && <span title="Best of the compared set" style={{ color: "var(--success)", fontSize: "0.66rem", fontWeight: 700 }}>▲</span>}
                                                                    </div>
                                                                    {m.key === "quality" && <ComparisonEvidence supplier={s} quality />}
                                                                    {/* signed metrics grow from a centre baseline so a
                                                                        negative value cannot look like a large positive one */}
                                                                    <div style={{ height: "5px", background: "#f0f3ef", borderRadius: "3px", marginTop: "5px", position: "relative", overflow: "hidden" }}>
                                                                        {drawBar && (m.signed ? (
                                                                            <div style={{
                                                                                position: "absolute", left: v >= 0 ? "50%" : undefined,
                                                                                right: v < 0 ? "50%" : undefined,
                                                                                width: `${pct / 2}%`, height: "100%",
                                                                                background: colorOf(s.id), borderRadius: "3px",
                                                                            }} />
                                                                        ) : (
                                                                            <div style={{ width: `${pct}%`, height: "100%", background: colorOf(s.id), borderRadius: "3px" }} />
                                                                        ))}
                                                                        {m.signed && <i style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "1px", background: "var(--line)" }} />}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p style={{ fontSize: "0.66rem", color: "var(--muted)", margin: "12px 0 0", paddingTop: "10px", borderTop: "1px solid var(--line)" }}>
                            {compared.length === 2 && <>The signed number beside each value is its difference from the other supplier. “pp” means percentage points. </>}
                            Each bar is that value against the largest in its own row, so bars compare across a row, never
                            down a column. ▲ marks the best value; a tied row has no winner. Signed rows grow from a centre line.
                        </p>
                    </div>
                ) : (
                    <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: 0 }}>
                        Select at least two suppliers to see the side-by-side breakdown.
                    </p>
                )}
            </section>

            {/* ------------------------------------------------------- scatter plot */}
            <section className="workspace-card" style={{ marginTop: "14px" }}>
                <div className="card-heading" style={{ flexWrap: "wrap", gap: "10px" }}>
                    <div>
                        <span className="section-label">Positioning plot</span>
                        <h2>Plot any metric against any other</h2>
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <label className="select-control">
                            X
                            <select value={xMetric} onChange={(e) => setXMetric(e.target.value)}>
                                {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                            </select>
                        </label>
                        <label className="select-control">
                            Y
                            <select value={yMetric} onChange={(e) => setYMetric(e.target.value)}>
                                {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                            </select>
                        </label>
                    </div>
                </div>

                <div style={{ position: "relative", height: "300px", background: "#fafbf8", borderRadius: "8px", border: "1px solid var(--line)", marginTop: "12px" }}>
                    {scoped.map((s) => {
                        const left = plotX(s), bottom = plotY(s);
                        if (left == null || bottom == null) return null;
                        const ring = colorOf(s.id);
                        return (
                            <button
                                key={s.id}
                                onClick={() => toggleCompare(s.id)}
                                onMouseEnter={() => setHovered(s.id)}
                                onMouseLeave={() => setHovered(null)}
                                aria-label={`${s.name}: ${METRIC_BY_KEY[xMetric].label} ${METRIC_BY_KEY[xMetric].format(s[xMetric])}, ${METRIC_BY_KEY[yMetric].label} ${METRIC_BY_KEY[yMetric].format(s[yMetric])}`}
                                style={{
                                    position: "absolute", left: `${left}%`, bottom: `${bottom}%`,
                                    transform: "translate(-50%, 50%)",
                                    width: ring ? "30px" : "22px", height: ring ? "30px" : "22px",
                                    borderRadius: "50%", cursor: "pointer",
                                    background: TIER_FILL[s.tier] || "#8fae9a",
                                    color: "white", fontSize: "0.56rem", fontWeight: 700,
                                    // 2px surface ring keeps overlapping marks legible; the
                                    // comparison colour rides on the outside so tier (fill)
                                    // and comparison slot (ring) never fight for one channel.
                                    boxShadow: ring
                                        ? `0 0 0 2px #fafbf8, 0 0 0 5px ${ring}`
                                        : "0 0 0 2px #fafbf8, 0 2px 5px rgba(0,0,0,0.12)",
                                    zIndex: ring ? 4 : hovered === s.id ? 5 : 2,
                                    transition: "width 140ms ease, height 140ms ease",
                                }}
                            >
                                {s.initials}
                            </button>
                        );
                    })}

                    {hovered && (() => {
                        const s = scoped.find((x) => x.id === hovered);
                        if (!s) return null;
                        return (
                            <div style={{
                                position: "absolute", left: `${Math.min(plotX(s) ?? 50, 62)}%`,
                                bottom: `${Math.min((plotY(s) ?? 50) + 9, 82)}%`,
                                background: "var(--ink)", color: "white", padding: "8px 10px",
                                borderRadius: "7px", fontSize: "0.68rem", pointerEvents: "none",
                                zIndex: 9, minWidth: "180px", boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
                            }}>
                                <b>{s.name}</b>
                                <div style={{ opacity: 0.75, fontSize: "0.62rem", marginBottom: "4px" }}>{s.tier} · {s.city}, {s.country}</div>
                                <div>{METRIC_BY_KEY[xMetric].label}: <b>{METRIC_BY_KEY[xMetric].format(s[xMetric])}</b></div>
                                <div>{METRIC_BY_KEY[yMetric].label}: <b>{METRIC_BY_KEY[yMetric].format(s[yMetric])}</b></div>
                                <div style={{ opacity: 0.7, fontSize: "0.6rem", marginTop: "4px" }}>
                                    {isCompared(s.id) ? "Click to remove from comparison" : "Click to add to comparison"}
                                </div>
                            </div>
                        );
                    })()}

                    <span style={{ position: "absolute", right: "12px", bottom: "8px", fontFamily: "DM Mono", fontSize: "0.6rem", color: "var(--muted)" }}>
                        {METRIC_BY_KEY[xMetric].label} →
                    </span>
                    <span style={{ position: "absolute", top: "12px", left: "10px", fontFamily: "DM Mono", fontSize: "0.6rem", color: "var(--muted)" }}>
                        {METRIC_BY_KEY[yMetric].label} ↑
                    </span>
                </div>

                <div className="chart-legend" style={{ marginTop: "12px", flexWrap: "wrap", gap: "14px" }}>
                    {Object.entries(TIER_FILL).map(([tier, fill]) => (
                        <span key={tier}><i className="legend-dot" style={{ background: fill }} /> {tier}</span>
                    ))}
                    <span style={{ color: "var(--muted)", fontSize: "0.66rem" }}>
                        Ringed points are in the comparison · axes scale to the loaded data
                    </span>
                </div>
            </section>

            {/* ---------------------------------------------------------- register */}
            <section className="workspace-card" style={{ marginTop: "14px" }}>
                <div className="card-heading">
                    <div>
                        <span className="section-label">Comprehensive scorecard</span>
                        <h2>Supplier register ({filtered.length})</h2>
                    </div>
                </div>

                <div style={{ overflow: "auto", marginTop: "10px", maxHeight: "460px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem", minWidth: "780px" }}>
                        <thead>
                            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                                <th style={{ padding: "8px 6px", width: "34px" }} />
                                <th style={{ padding: "8px 6px" }}>{sortHeader("name", "Supplier")}</th>
                                <th style={{ padding: "8px 6px" }}>Tier</th>
                                <th style={{ padding: "8px 6px", textAlign: "right" }}>{sortHeader("quality", "Quality")}</th>
                                <th style={{ padding: "8px 6px", textAlign: "right" }}>{sortHeader("defectRate", "Defects/insp")}</th>
                                <th style={{ padding: "8px 6px", textAlign: "right" }}>{sortHeader("rejectRate", "Reject %")}</th>
                                <th style={{ padding: "8px 6px", textAlign: "right" }}>{sortHeader("onTime", "On-time %")}</th>
                                <th style={{ padding: "8px 6px", textAlign: "right" }}>{sortHeader("effectiveCost", "Eff. cost")}</th>
                                <th style={{ padding: "8px 6px", textAlign: "right" }}>{sortHeader("copqPerUnit", "COPQ/insp")}</th>
                                <th style={{ padding: "8px 6px", textAlign: "right" }}>{sortHeader("spend", "Spend")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((s) => {
                                const ring = colorOf(s.id);
                                return (
                                    <tr
                                        key={s.id}
                                        style={{
                                            borderBottom: "1px solid #eef1ed",
                                            background: ring ? `color-mix(in srgb, ${ring} 7%, transparent)` : "transparent",
                                        }}
                                    >
                                        <td style={{ padding: "7px 6px" }}>
                                            <input
                                                type="checkbox"
                                                checked={!!ring}
                                                disabled={!ring && compareFull}
                                                onChange={() => toggleCompare(s.id)}
                                                aria-label={`Compare ${s.name}`}
                                                style={{ accentColor: ring || "var(--accent)", cursor: !ring && compareFull ? "not-allowed" : "pointer" }}
                                            />
                                        </td>
                                        <td style={{ padding: "7px 6px" }}>
                                            <Link to={`/suppliers?selected=${s.id}`} style={{ fontWeight: 700 }}>{s.name}</Link>
                                            <small style={{ display: "block", color: "var(--muted)", fontSize: "0.64rem" }}>
                                                {s.city}, {s.country} · {s.inspections.toLocaleString()} inspections
                                            </small>
                                        </td>
                                        <td style={{ padding: "7px 6px" }}>
                                            <span className={`tier-badge tier-badge--${s.tier.toLowerCase()}`}>{s.tier}</span>
                                        </td>
                                        <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}><b>{num(s.quality)}</b></td>
                                        <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(s.defectRate, 2)}</td>
                                        <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: s.rejectRate > 20 ? "var(--danger)" : "inherit" }}>{num(s.rejectRate)}</td>
                                        <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(s.onTime)}</td>
                                        <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.effectiveCost == null ? "—" : `$${s.effectiveCost.toFixed(2)}`}</td>
                                        <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.copqPerUnit == null ? "—" : `$${s.copqPerUnit.toFixed(2)}`}</td>
                                        <td style={{ padding: "7px 6px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(s.spend)}</td>
                                    </tr>
                                );
                            })}
                            {!filtered.length && (
                                <tr><td colSpan={10} style={{ padding: "16px 6px", color: "var(--muted)" }}>No suppliers match these filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </OperationsShell>
    );
}
