import { useEffect, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

import OperationsShell from "../components/OperationsShell";

const stages = ["In transit", "Received", "Inspecting", "Cleared / Rejected"];

const normalizeShipment = (row, supplierMap) => {
    const qualityScore = row.quality_score == null ? null : Number(row.quality_score);
    let stage = "In transit";

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
        progress: qualityScore == null ? 10 : stage === "Cleared" || stage === "Rejected" ? 100 : 65,
        value: `$${Math.max(0, Number(row.quality_score || 0) * 180).toLocaleString()}`,
    };
};

function Shipments() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filter, setFilter] = useState("All");
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            axios.get("http://localhost:8000/api/fabric/suppliers"),
            axios.get("http://localhost:8000/api/fabric/shipments"),
        ])
            .then(([supplierResponse, shipmentResponse]) => {
                const supplierMap = {};
                (supplierResponse.data?.suppliers || []).forEach((supplier) => {
                    supplierMap[supplier.supplier_id] = supplier.name;
                });

                const normalized = (shipmentResponse.data?.shipments || []).map((shipment) => normalizeShipment(shipment, supplierMap));
                setShipments(normalized);
            })
            .catch(() => setShipments([]))
            .finally(() => setLoading(false));
    }, []);

    const selectedId = searchParams.get("selected") || shipments[0]?.id || "";
    const selected = shipments.find((shipment) => shipment.id === selectedId) || shipments[0];
    const filtered = shipments.filter((shipment) => filter === "All" || shipment.stage === filter);

    if (loading && shipments.length === 0) {
        return (
            <OperationsShell eyebrow="Inbound logistics" title="Loading shipment data..." actions={<button className="button button-quiet" onClick={() => window.print()}>Export shipment view</button>}>
                <section className="workspace-card"><p>Fetching live shipment data from the backend.</p></section>
            </OperationsShell>
        );
    }

    return (
        <OperationsShell eyebrow="Inbound logistics" title="Every roll has a decision path." actions={<button className="button button-quiet" onClick={() => window.print()}>Export shipment view</button>}>
            <section className="shipment-board">
                <article className="workspace-card shipment-list">
                    <div className="card-heading">
                        <div><span className="section-label">Shipment register</span><h2>Inbound queue</h2></div>
                        <span>{shipments.length} shipments</span>
                    </div>
                    <div className="filter-pills">{["All", "In transit", "Inspecting", "Cleared", "Rejected"].map((item) => <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
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
                                <div className={index <= stages.findIndex((candidate) => selected.stage.includes(candidate.split(" ")[0]) || (stage === "Cleared / Rejected" && ["Cleared", "Rejected"].includes(selected.stage))) ? "is-complete" : ""} key={stage}>
                                    <i>{index + 1}</i>
                                    <span>{stage}</span>
                                </div>
                            ))}
                        </div>
                        <div className="shipment-detail__facts">
                            <div><span>Shipment quality</span><b>{selected.quality ?? "Pending"}{selected.quality != null ? "/100" : ""}</b></div>
                            <div><span>Total rolls</span><b>{selected.rolls}</b></div>
                            <div><span>Sampling stage</span><b>{selected.sampling}</b></div>
                            <div><span>Inspection status</span><b>{selected.stage}</b></div>
                            <div><span>Progress</span><b>{selected.progress}%</b></div>
                        </div>
                    </article>
                ) : null}
            </section>
        </OperationsShell>
    );
}

export default Shipments;
