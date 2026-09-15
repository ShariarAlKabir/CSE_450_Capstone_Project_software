import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";

export default function ShipmentAnalytics() {
    const [shipments, setShipments] = useState([]);
    const [stageFilter, setStageFilter] = useState("All");
    const [fabricFilter, setFabricFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [scope, setScope] = useState("Fabric");
    const [target, setTarget] = useState(null);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/dashboard/stats`, { params: { scope } })
            .then((response) => setTarget(response.data?.quality_target ?? null))
            .catch(() => setTarget(null));
    }, [scope]);

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/label/shipments`),
            axios.get(`${API_BASE_URL}/api/fabric/shipments`),
        ])
            .then(([supRes, labelRes, shpRes]) => {
                const supMap = {};
                (supRes.data?.suppliers || []).forEach((s) => {
                    supMap[s.supplier_id] = s.name;
                });

                const rows = [
                    ...(shpRes.data?.shipments || []).map((row) => ({ ...row, scope: "Fabric", supplierName: supMap[row.supplier_id] })),
                    ...(labelRes.data?.shipments || []).map((row) => ({
                        ...row,
                        scope: "Label",
                        supplierName: row.supplier,
                        total_rolls: row.total_samples,
                        fabric_type: row.label_type,
                        color: row.material,
                        inspected_rolls: row.inspected_samples,
                        uninspected_rolls: Math.max(Number(row.total_samples || 0) - Number(row.inspected_samples || 0), 0),
                    })),
                ];

                const parsed = rows.map((row, idx) => {
                    const quality = row.quality_score != null ? Number(row.quality_score) : null;
                    // Lifecycle comes from the API (cost_parameters.clearance_score),
                    // so the clearance rule is defined once rather than in each page.
                    const lifecycle = row.lifecycle;

                    return {
                        id: row.shipment_code || `SHP-${row.shipment_id}`,
                        dbId: row.shipment_id,
                        supplier: row.supplierName || "Unknown supplier",
                        supplierId: row.supplier_id,
                        fabricType: row.fabric_type || "—",
                        color: row.color || "—",
                        rolls: Number(row.total_rolls || 0),
                        samplingStage: row.sampling_stage || "Initial",
                        lifecycle,
                        quality,
                        notes: row.notes || "No inspector note recorded.",
                        // Recorded lot value: volume x the supplier's contract
                        // unit price. It used to be (quality || 80) * 180.
                        value: row.lot_value != null ? Number(row.lot_value) : null,
                        onTime: row.on_time,
                        promised: row.promised_date || null,
                        received: row.received_date || null,
                        scope: row.scope,
                    };
                });
                setShipments(parsed);
                if (parsed.length > 0) setSelectedShipment(parsed[0]);
            })
            .catch(() => setShipments([]));
    }, []);

    // Unique fabric types for filter
    const fabricTypes = useMemo(() => {
        const set = new Set(shipments.map((s) => s.fabricType));
        return ["All", ...Array.from(set)];
    }, [shipments]);

    const scopedShipments = useMemo(() => {
        return shipments.filter((s) => scope === "All" || s.scope === scope);
    }, [shipments, scope]);

    const scopeCounts = {
        All: shipments.length,
        Fabric: shipments.filter((s) => s.scope === "Fabric").length,
        Label: shipments.filter((s) => s.scope === "Label").length,
    };

    const filtered = useMemo(() => {
        return scopedShipments.filter((s) => {
            const matchesStage = stageFilter === "All" || s.lifecycle === stageFilter || s.samplingStage === stageFilter;
            const matchesFabric = fabricFilter === "All" || s.fabricType === fabricFilter;
            const matchesSearch = s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.fabricType.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesStage && matchesFabric && matchesSearch;
        });
    }, [scopedShipments, stageFilter, fabricFilter, searchQuery]);

    const stats = useMemo(() => {
        const total = scopedShipments.length;
        const cleared = scopedShipments.filter((s) => s.lifecycle === "Cleared").length;
        const inspecting = scopedShipments.filter((s) => s.lifecycle === "Inspecting").length;
        const inTransit = scopedShipments.filter((s) => s.lifecycle === "In transit").length;
        const rejected = scopedShipments.filter((s) => s.lifecycle === "Rejected").length;
        const totalRolls = scopedShipments.reduce((acc, s) => acc + s.rolls, 0);

        const qualityScores = scopedShipments.filter((s) => s.quality != null).map((s) => s.quality);
        const avgScore = qualityScores.length ? (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1) : null;

        // Fabric type counts
        const fabricCounts = {};
        scopedShipments.forEach((s) => {
            fabricCounts[s.fabricType] = (fabricCounts[s.fabricType] || 0) + 1;
        });

        return {
            total,
            cleared,
            inspecting,
            inTransit,
            rejected,
            totalRolls,
            avgScore,
            fabricCounts,
        };
    }, [scopedShipments]);

    return (
        <OperationsShell
            eyebrow="Inbound logistics & sampling flow analysis"
            title="Shipment lifecycle, multi-stage sampling & quality clearance."
            actions={
                <>
                    <button className="button button-quiet" onClick={() => window.print()}>Export shipment report</button>
                    <Link className="button button-primary" to="/shipments">Inbound shipments</Link>
                </>
            }
        >
            {/* KPI Summary Grid */}
            <section className="kpi-grid">
                <div className="kpi-card">
                    <span>Total Inbound Shipments</span>
                    <strong>{stats.total}</strong>
                    <small>{stats.totalRolls} total rolls tracked</small>
                </div>
                <div className="kpi-card">
                    <span>Cleared & Released</span>
                    <strong className="positive">{stats.cleared}</strong>
                    <small>{stats.total ? Math.round((stats.cleared / stats.total) * 100) : 0}% clearance rate</small>
                </div>
                <div className="kpi-card">
                    <span>Active Inspection</span>
                    <strong>{stats.inspecting}</strong>
                    <small>Currently in multi-stage testing</small>
                </div>
                <div className="kpi-card">
                    <span>Average Lot Quality</span>
                    <strong>{stats.avgScore ?? "—"}<small style={{ fontSize: "1rem" }}>/100</small></strong>
                    <small>{target != null ? `Target standard: ${target}+` : "No target on record"}</small>
                </div>
            </section>

            {/* Interactive Filters */}
            <section className="workspace-card supplier-filterbar" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by shipment code, supplier, or fabric..."
                    aria-label="Search shipments"
                    style={{ flex: 1, minWidth: "220px", borderBottom: "1px solid var(--line)" }}
                />
                <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                <div className="filter-pills">
                    {["All", "Cleared", "Inspecting", "In transit", "Rejected"].map((st) => (
                        <button
                            key={st}
                            className={stageFilter === st ? "is-active" : ""}
                            onClick={() => setStageFilter(st)}
                        >
                            {st}
                        </button>
                    ))}
                </div>
                <label className="select-control">
                    Fabric
                    <select value={fabricFilter} onChange={(e) => setFabricFilter(e.target.value)}>
                        {fabricTypes.map((f) => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                </label>
            </section>

            {/* Sampling Pipeline & Fabric Breakdown Section */}
            <section className="dashboard-grid dashboard-grid--analytics">
                <article className="workspace-card workspace-card--large">
                    <div className="card-heading">
                        <div>
                            <span className="section-label">Multi-Stage Quality Protocol</span>
                            <h2>Sampling Stage Progression</h2>
                        </div>
                        <span className="trend-chip positive">3-Stage Verification</span>
                    </div>

                    {/* Interactive 3-Stage Stepper Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "14px" }}>
                        <div
                            style={{
                                padding: "16px",
                                borderRadius: "10px",
                                background: stageFilter === "Initial" ? "var(--accent-soft)" : "#f8faf7",
                                border: stageFilter === "Initial" ? "2px solid var(--accent)" : "1px solid var(--line)",
                                cursor: "pointer",
                            }}
                            onClick={() => setStageFilter(stageFilter === "Initial" ? "All" : "Initial")}
                        >
                            <span className="section-label" style={{ color: "var(--accent-dark)" }}>Stage 01</span>
                            <h3 style={{ marginTop: "4px" }}>Initial Check</h3>
                            <p style={{ fontSize: "0.75rem", marginTop: "4px" }}>Visual outer wrap & fabric tension check.</p>
                            <strong style={{ display: "block", marginTop: "8px", fontSize: "1.1rem" }}>
                                {scopedShipments.filter((s) => s.samplingStage === "Initial").length} Lots
                            </strong>
                        </div>

                        <div
                            style={{
                                padding: "16px",
                                borderRadius: "10px",
                                background: stageFilter === "Second" ? "var(--accent-soft)" : "#f8faf7",
                                border: stageFilter === "Second" ? "2px solid var(--accent)" : "1px solid var(--line)",
                                cursor: "pointer",
                            }}
                            onClick={() => setStageFilter(stageFilter === "Second" ? "All" : "Second")}
                        >
                            <span className="section-label" style={{ color: "var(--accent-dark)" }}>Stage 02</span>
                            <h3 style={{ marginTop: "4px" }}>Second Sample</h3>
                            <p style={{ fontSize: "0.75rem", marginTop: "4px" }}>AI automated camera scan on first 3 rolls.</p>
                            <strong style={{ display: "block", marginTop: "8px", fontSize: "1.1rem" }}>
                                {scopedShipments.filter((s) => s.samplingStage === "Second").length} Lots
                            </strong>
                        </div>

                        <div
                            style={{
                                padding: "16px",
                                borderRadius: "10px",
                                background: stageFilter === "Final" ? "var(--accent-soft)" : "#f8faf7",
                                border: stageFilter === "Final" ? "2px solid var(--accent)" : "1px solid var(--line)",
                                cursor: "pointer",
                            }}
                            onClick={() => setStageFilter(stageFilter === "Final" ? "All" : "Final")}
                        >
                            <span className="section-label" style={{ color: "var(--accent-dark)" }}>Stage 03</span>
                            <h3 style={{ marginTop: "4px" }}>Final Release</h3>
                            <p style={{ fontSize: "0.75rem", marginTop: "4px" }}>Scorecard calculation and release clearance.</p>
                            <strong style={{ display: "block", marginTop: "8px", fontSize: "1.1rem" }}>
                                {scopedShipments.filter((s) => s.samplingStage === "Final").length} Lots
                            </strong>
                        </div>
                    </div>

                    {/* Fabric Type Mix Visualizer */}
                    <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid var(--line)" }}>
                        <span className="section-label">Fabric Type Mix & Volume Distribution</span>
                        <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                            {Object.entries(stats.fabricCounts).map(([type, count]) => {
                                const pct = Math.round((count / (stats.total || 1)) * 100);
                                return (
                                    <div key={type} style={{ display: "grid", gridTemplateColumns: "140px 1fr 40px", alignItems: "center", gap: "12px" }}>
                                        <span style={{ fontSize: "0.74rem", fontWeight: "600" }}>{type}</span>
                                        <div style={{ height: "7px", background: "#edf1ec", borderRadius: "99px", overflow: "hidden" }}>
                                            <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: "inherit" }} />
                                        </div>
                                        <span style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "right" }}>{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </article>

                {/* Selected Shipment Detail Card */}
                <article className="workspace-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    {selectedShipment ? (
                        <>
                            <div>
                                <div className="card-heading" style={{ marginBottom: "12px" }}>
                                    <div>
                                        <span className="section-label">Shipment Detail</span>
                                        <h2>{selectedShipment.id}</h2>
                                        <p>{selectedShipment.supplier} · {selectedShipment.fabricType}</p>
                                    </div>
                                    <span className={`shipment-status shipment-status--${selectedShipment.lifecycle.toLowerCase().replace(" ", "-")}`}>
                                        {selectedShipment.lifecycle}
                                    </span>
                                </div>

                                <div className="shipment-detail__facts" style={{ marginTop: "12px" }}>
                                    <div>
                                        <span>Color / Shade</span>
                                        <b>{selectedShipment.color}</b>
                                    </div>
                                    <div>
                                        <span>Total Rolls</span>
                                        <b>{selectedShipment.rolls} Rolls</b>
                                    </div>
                                    <div>
                                        <span>Sampling Stage</span>
                                        <b style={{ color: "var(--accent-dark)" }}>{selectedShipment.samplingStage}</b>
                                    </div>
                                    <div>
                                        <span>Quality Score</span>
                                        <b>{selectedShipment.quality != null ? `${selectedShipment.quality}/100` : "Pending"}</b>
                                    </div>
                                    <div>
                                        <span>Lot Value</span>
                                        <b>{selectedShipment.value != null ? `$${Math.round(selectedShipment.value).toLocaleString()}` : "—"}</b>
                                    </div>
                                    <div>
                                        <span>Delivery</span>
                                        <b>{selectedShipment.onTime == null ? "—" : selectedShipment.onTime ? "On time" : "Late"}</b>
                                    </div>
                                </div>

                                <div style={{ marginTop: "14px", padding: "12px", background: "#fafbf8", borderRadius: "8px", border: "1px solid #e2e8e2" }}>
                                    <span className="section-label" style={{ fontSize: "0.6rem" }}>Inspector Notes</span>
                                    <p style={{ marginTop: "4px", fontSize: "0.75rem" }}>{selectedShipment.notes}</p>
                                </div>
                            </div>

                            <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
                                <Link
                                    className="button button-primary button-primary--wide"
                                    to={`/shipments?selected=${selectedShipment.id}`}
                                    style={{ width: "100%", textAlign: "center" }}
                                >
                                    Open in Inbound Logistics →
                                </Link>
                            </div>
                        </>
                    ) : (
                        <p>Select a shipment from the register to inspect.</p>
                    )}
                </article>
            </section>

            {/* Inbound Shipment Register */}
            <section className="workspace-card" style={{ marginTop: "14px" }}>
                <div className="card-heading">
                    <div>
                        <span className="section-label">Live Inbound Register</span>
                        <h2>Shipment Queue ({filtered.length} Matching Records)</h2>
                    </div>
                </div>

                <div className="shipment-rows" style={{ marginTop: "10px" }}>
                    {filtered.map((s) => (
                        <div
                            key={s.id}
                            className={`shipment-row ${selectedShipment?.id === s.id ? "is-selected" : ""}`}
                            onClick={() => setSelectedShipment(s)}
                            style={{ cursor: "pointer" }}
                        >
                            <span>
                                <strong>{s.id}</strong>
                                <small>{s.supplier}</small>
                            </span>
                            <span>
                                <b>{s.fabricType} ({s.color})</b>
                                <small>{s.rolls} rolls · Stage: {s.samplingStage} · {s.quality != null ? `Quality: ${s.quality}/100` : "Awaiting scan"}</small>
                            </span>
                            <span className={`shipment-status shipment-status--${s.lifecycle.toLowerCase().replace(" ", "-")}`}>
                                {s.lifecycle}
                            </span>
                        </div>
                    ))}
                </div>
            </section>
        </OperationsShell>
    );
}
