import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import OperationsShell from "../components/OperationsShell";

export default function ShipmentAnalytics() {
    const [shipments, setShipments] = useState([]);
    const [stageFilter, setStageFilter] = useState("All");
    const [fabricFilter, setFabricFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedShipment, setSelectedShipment] = useState(null);

    useEffect(() => {
        Promise.all([
            axios.get("http://localhost:8000/api/fabric/suppliers"),
            axios.get("http://localhost:8000/api/fabric/shipments"),
        ])
            .then(([supRes, shpRes]) => {
                const supMap = {};
                (supRes.data?.suppliers || []).forEach((s) => {
                    supMap[s.supplier_id] = s.name;
                });

                const parsed = (shpRes.data?.shipments || []).map((row) => {
                    const quality = row.quality_score != null ? Number(row.quality_score) : null;
                    let lifecycle;
                    if (quality == null) {
                        lifecycle = "In transit";
                    } else if (row.sampling_stage === "Final" && quality >= 80) {
                        lifecycle = "Cleared";
                    } else if (row.sampling_stage === "Final" && quality < 80) {
                        lifecycle = "Rejected";
                    } else {
                        lifecycle = "Inspecting";
                    }

                    return {
                        id: row.shipment_code || `SHP-${row.shipment_id}`,
                        dbId: row.shipment_id,
                        supplier: supMap[row.supplier_id] || "Textile Supplier",
                        supplierId: row.supplier_id,
                        fabricType: row.fabric_type || "Single Jersey Cotton",
                        color: row.color || "Indigo",
                        rolls: Number(row.total_rolls || 5),
                        samplingStage: row.sampling_stage || "Initial",
                        lifecycle,
                        quality,
                        notes: row.notes || "Standard lot delivery.",
                        value: Math.round((quality || 80) * 180),
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

    const filtered = useMemo(() => {
        return shipments.filter((s) => {
            const matchesStage = stageFilter === "All" || s.lifecycle === stageFilter || s.samplingStage === stageFilter;
            const matchesFabric = fabricFilter === "All" || s.fabricType === fabricFilter;
            const matchesSearch = s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.fabricType.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesStage && matchesFabric && matchesSearch;
        });
    }, [shipments, stageFilter, fabricFilter, searchQuery]);

    const stats = useMemo(() => {
        const total = shipments.length;
        const cleared = shipments.filter((s) => s.lifecycle === "Cleared").length;
        const inspecting = shipments.filter((s) => s.lifecycle === "Inspecting").length;
        const inTransit = shipments.filter((s) => s.lifecycle === "In transit").length;
        const rejected = shipments.filter((s) => s.lifecycle === "Rejected").length;
        const totalRolls = shipments.reduce((acc, s) => acc + s.rolls, 0);

        const qualityScores = shipments.filter((s) => s.quality != null).map((s) => s.quality);
        const avgScore = qualityScores.length ? (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1) : "85.0";

        // Fabric type counts
        const fabricCounts = {};
        shipments.forEach((s) => {
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
    }, [shipments]);

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
                    <strong>{stats.avgScore}<small style={{ fontSize: "1rem" }}>/100</small></strong>
                    <small>Target standard: 85.0+</small>
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
                                {shipments.filter((s) => s.samplingStage === "Initial").length} Lots
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
                                {shipments.filter((s) => s.samplingStage === "Second").length} Lots
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
                                {shipments.filter((s) => s.samplingStage === "Final").length} Lots
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
                                        <span>Estimated Lot Value</span>
                                        <b>${selectedShipment.value.toLocaleString()}</b>
                                    </div>
                                    <div>
                                        <span>Status</span>
                                        <b>{selectedShipment.lifecycle}</b>
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
