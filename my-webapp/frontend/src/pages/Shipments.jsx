import { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";
import Modal from "../components/Modal";

const stages = ["In transit", "Received", "Inspecting", "Cleared / Rejected"];
const stageNotes = {
    "In transit": "Shipment has been dispatched and is on its way to the facility.",
    "Received": "Rolls have arrived at the facility and are awaiting sampling.",
    "Inspecting": "Rolls are being inspected; quality score is not final yet.",
    "Cleared / Rejected": "Final sampling is complete. A score of 80+ clears the lot, below 80 rejects it.",
};

const normalizeShipment = (row, supplierMap, index) => {
    const qualityScore = row.quality_score == null ? null : Number(row.quality_score);
    let stage;

    if (qualityScore == null) {
        stage = "In transit";
    } else if (row.sampling_stage === "Final" && qualityScore >= 80) {
        stage = "Cleared";
    } else if (row.sampling_stage === "Final" && qualityScore < 80) {
        stage = "Rejected";
    } else {
        stage = "Inspecting";
    }

    return {
        id: row.shipment_code || `SH-${row.shipment_id}`,
        supplier: supplierMap[row.supplier_id] || "Unknown supplier",
        fabric: row.fabric_type || row.color || "Fabric",
        rolls: Number(row.total_rolls || 0),
        received: row.received_date || "Pending",
        stage,
        quality: qualityScore,
        sampling: row.sampling_stage || "Initial",
        progress: row.total_rolls ? Math.round((Number(row.inspected_rolls || 0) / Number(row.total_rolls)) * 100) : 0,
        inspectedRolls: Number(row.inspected_rolls || 0),
        uninspectedRolls: Number(row.uninspected_rolls || 0),
        value: `$${Math.max(0, Number(row.quality_score || 0) * 180).toLocaleString()}`,
        scope: index % 2 === 0 ? "Fabric" : "Label",
    };
};

function Shipments() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filter, setFilter] = useState("All");
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scope, setScope] = useState("All");
    const [supplierOptions, setSupplierOptions] = useState([]);
    const [showAddShipment, setShowAddShipment] = useState(false);
    const [openStage, setOpenStage] = useState("");
    const [showProgress, setShowProgress] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const [form, setForm] = useState({
        supplier_id: "", shipment_code: "", shipment_date: "", received_date: "", total_rolls: 10, fabric_type: "Cotton", color: "", sampling_stage: "Initial", quality_score: "", notes: "",
    });
    const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
    const addShipment = async (event) => {
        event.preventDefault();
        if (!form.shipment_code.trim()) {
            setFormError("Shipment code is required.");
            return;
        }
        if (!form.supplier_id) {
            setFormError("Select a supplier.");
            return;
        }
        setSaving(true);
        setFormError("");
        try {
            await axios.post(`${API_BASE_URL}/api/fabric/shipments`, {
                ...form,
                supplier_id: Number(form.supplier_id),
                total_rolls: Number(form.total_rolls) || 1,
                quality_score: form.quality_score === "" ? null : Number(form.quality_score),
            });
            setShowAddShipment(false);
            window.location.reload();
        } catch (error) {
            setFormError(error.response?.data?.detail || "Could not add shipment. Please try again.");
            setSaving(false);
        }
    };

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/fabric/shipments`),
        ])
            .then(([supplierResponse, shipmentResponse]) => {
                const supplierMap = {};
                (supplierResponse.data?.suppliers || []).forEach((supplier) => {
                    supplierMap[supplier.supplier_id] = supplier.name;
                });
                setSupplierOptions(supplierResponse.data?.suppliers || []);
                setForm((current) => ({ ...current, supplier_id: current.supplier_id || (supplierResponse.data?.suppliers?.[0]?.supplier_id || "") }));

                const normalized = (shipmentResponse.data?.shipments || []).map((shipment, index) => normalizeShipment(shipment, supplierMap, index));
                setShipments(normalized);
            })
            .catch(() => setShipments([]))
            .finally(() => setLoading(false));
    }, []);

    const selectedId = searchParams.get("selected") || shipments[0]?.id || "";
    const selected = shipments.find((shipment) => shipment.id === selectedId) || shipments[0];
    const scopeCounts = {
        All: shipments.length,
        Fabric: shipments.filter((shipment) => shipment.scope === "Fabric").length,
        Label: shipments.filter((shipment) => shipment.scope === "Label").length,
    };
    const filtered = shipments.filter((shipment) => (scope === "All" || shipment.scope === scope) && (filter === "All" || shipment.stage === filter));

    if (loading && shipments.length === 0) {
        return (
            <OperationsShell eyebrow="Inbound logistics" title="Loading shipment data..." actions={<><button className="button button-primary" onClick={() => setShowAddShipment(true)}>Add shipment</button><button className="button button-quiet" onClick={() => window.print()}>Export shipment view</button></>}>
                <section className="workspace-card"><p>Fetching live shipment data from the backend.</p></section>
                {showAddShipment && (
                    <Modal eyebrow="Inbound logistics" title="Add shipment" onCancel={() => setShowAddShipment(false)}>
                        <form className="modal-form" onSubmit={addShipment}>
                            <label>Shipment code *<input required value={form.shipment_code} onChange={updateField("shipment_code")} placeholder="e.g. SH-2026-101" /></label>
                            <label>Supplier *<select required value={form.supplier_id} onChange={updateField("supplier_id")}><option value="">Select supplier</option>{supplierOptions.map((supplier) => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.name}</option>)}</select></label>
                            <label>Shipment date<input type="date" value={form.shipment_date} onChange={updateField("shipment_date")} /></label>
                            <label>Received date<input type="date" value={form.received_date} onChange={updateField("received_date")} /></label>
                            <label>Total rolls<input type="number" min="1" value={form.total_rolls} onChange={updateField("total_rolls")} /></label>
                            <label>Fabric type<input value={form.fabric_type} onChange={updateField("fabric_type")} placeholder="e.g. Cotton" /></label>
                            <label>Color<input value={form.color} onChange={updateField("color")} placeholder="e.g. Indigo" /></label>
                            <label>Sampling stage<select value={form.sampling_stage} onChange={updateField("sampling_stage")}><option>Initial</option><option>Second</option><option>Final</option></select></label>
                            <label>Quality score (0-100)<input type="number" min="0" max="100" value={form.quality_score} onChange={updateField("quality_score")} placeholder="Leave blank until inspected" /></label>
                            <label className="modal-form__wide">Notes<textarea value={form.notes} onChange={updateField("notes")} placeholder="Optional shipment notes" /></label>
                            {formError && <p className="modal-form__error">{formError}</p>}
                            <div className="modal-form__actions">
                                <button type="button" className="button button-quiet" onClick={() => setShowAddShipment(false)}>Cancel</button>
                                <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Adding..." : "Add shipment"}</button>
                            </div>
                        </form>
                    </Modal>
                )}
            </OperationsShell>
        );
    }

    return (
        <>
        <OperationsShell eyebrow="Inbound logistics" title="Every roll has a decision path." actions={<><button className="button button-primary" onClick={() => setShowAddShipment(true)}>Add shipment</button><button className="button button-quiet" onClick={() => window.print()}>Export shipment view</button></>}>
            <section className="shipment-board">
                <article className="workspace-card shipment-list">
                    <div className="card-heading">
                        <div><span className="section-label">Shipment register</span><h2>Inbound queue</h2></div>
                        <span>{shipments.length} shipments</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <div className="filter-pills">{["All", "In transit", "Inspecting", "Cleared", "Rejected"].map((item) => <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
                        <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                    </div>
                    <div className="shipment-rows">
                        {filtered.map((shipment) => (
                            <button onClick={() => setSearchParams({ selected: shipment.id })} className={`shipment-row ${selected?.id === shipment.id ? "is-selected" : ""}`} key={shipment.id}>
                                <span><strong>{shipment.id}</strong><small>{shipment.supplier}</small></span>
                                <span><b>{shipment.fabric}</b><small>{shipment.rolls} rolls · {shipment.received}</small></span>
                                <span className={`shipment-status shipment-status--${shipment.stage.toLowerCase().replaceAll(" ", "-").replace("/", "")}`}>{shipment.stage}</span>
                            </button>
                        ))}
                    </div>
                </article>

                {selected ? (
                    <article className="workspace-card shipment-detail">
                        <div className="card-heading">
                            <div>
                                <span className="section-label">Shipment detail</span>
                                <h2>{selected.id}</h2>
                                <p>{selected.supplier} · {selected.fabric}</p>
                            </div>
                            <span className="shipment-value">{selected.value}</span>
                        </div>
                        <div className="lifecycle">
                            {stages.map((stage, index) => (
                                <button type="button" className={`lifecycle-stage ${index <= stages.findIndex((candidate) => selected.stage.includes(candidate.split(" ")[0]) || (stage === "Cleared / Rejected" && ["Cleared", "Rejected"].includes(selected.stage))) ? "is-complete" : ""} ${openStage === stage ? "is-open" : ""}`} onClick={() => setOpenStage(openStage === stage ? "" : stage)} key={stage} title="Click for details">
                                    <i>{index + 1}</i>
                                    <span>{stage}</span>
                                </button>
                            ))}
                        </div>
                        {openStage && <p className="lifecycle-note">{stageNotes[openStage] || "Stage in the inbound decision path."}</p>}
                        <div className="shipment-progress">
                            <button type="button" className="shipment-progress__head" onClick={() => setShowProgress(!showProgress)} aria-expanded={showProgress}>
                                <span>Inspection progress</span>
                                <b>{selected.progress}%</b>
                            </button>
                            <div className="shipment-progress__track"><i style={{ width: `${selected.progress}%` }} /></div>
                            {showProgress && (
                                <div className="shipment-progress__detail">
                                    <span><b>{selected.inspectedRolls}</b> rolls inspected</span>
                                    <span><b>{selected.uninspectedRolls}</b> rolls remaining</span>
                                    <span><b>{selected.rolls}</b> rolls total</span>
                                </div>
                            )}
                        </div>
                        <div className="shipment-detail__facts">
                            <div><span>Shipment quality</span><b>{selected.quality ?? "Pending"}{selected.quality != null ? "/100" : ""}</b></div>
                            <div><span>Total rolls</span><b>{selected.rolls}</b></div>
                            <div><span>Sampling stage</span><b>{selected.sampling}</b></div>
                            <div><span>Inspection status</span><b>{selected.stage}</b></div>
                        </div>
                    </article>
                ) : null}
            </section>
        </OperationsShell>
        {showAddShipment && (
            <Modal eyebrow="Inbound logistics" title="Add shipment" onCancel={() => setShowAddShipment(false)}>
                <form className="modal-form" onSubmit={addShipment}>
                    <label>Shipment code *<input required value={form.shipment_code} onChange={updateField("shipment_code")} placeholder="e.g. SH-2026-101" /></label>
                    <label>Supplier *<select required value={form.supplier_id} onChange={updateField("supplier_id")}><option value="">Select supplier</option>{supplierOptions.map((supplier) => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.name}</option>)}</select></label>
                    <label>Shipment date<input type="date" value={form.shipment_date} onChange={updateField("shipment_date")} /></label>
                    <label>Received date<input type="date" value={form.received_date} onChange={updateField("received_date")} /></label>
                    <label>Total rolls<input type="number" min="1" value={form.total_rolls} onChange={updateField("total_rolls")} /></label>
                    <label>Fabric type<input value={form.fabric_type} onChange={updateField("fabric_type")} placeholder="e.g. Cotton" /></label>
                    <label>Color<input value={form.color} onChange={updateField("color")} placeholder="e.g. Indigo" /></label>
                    <label>Sampling stage<select value={form.sampling_stage} onChange={updateField("sampling_stage")}><option>Initial</option><option>Second</option><option>Final</option></select></label>
                    <label>Quality score (0-100)<input type="number" min="0" max="100" value={form.quality_score} onChange={updateField("quality_score")} placeholder="Leave blank until inspected" /></label>
                    <label className="modal-form__wide">Notes<textarea value={form.notes} onChange={updateField("notes")} placeholder="Optional shipment notes" /></label>
                    {formError && <p className="modal-form__error">{formError}</p>}
                    <div className="modal-form__actions">
                        <button type="button" className="button button-quiet" onClick={() => setShowAddShipment(false)}>Cancel</button>
                        <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Adding..." : "Add shipment"}</button>
                    </div>
                </form>
            </Modal>
        )}
        </>
    );
}

export default Shipments;
