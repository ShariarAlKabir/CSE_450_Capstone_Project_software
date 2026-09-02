import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";

function Inspections() {
    const [filter, setFilter] = useState("All");
    const [pendingAction, setPendingAction] = useState("");
    const [confirmed, setConfirmed] = useState("");
    const [inspections, setInspections] = useState([]);
    const [scope, setScope] = useState("All");

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/inspections`)
            .then((response) => setInspections(response.data?.inspections || []))
            .catch(() => setInspections([]));
    }, []);

    const scopeCounts = {
        All: inspections.length,
        Fabric: inspections.filter((i) => i.scope === "Fabric").length,
        Label: inspections.filter((i) => i.scope === "Label").length,
    };
    const visible = inspections.filter(
        (inspection) =>
            (filter === "All" || inspection.status === filter) &&
            (scope === "All" || inspection.scope === scope)
    );

    return <OperationsShell eyebrow="Inspection control" title="Resolve exceptions with evidence." actions={<Link className="button button-primary" to="/fabric-inspection">Upload fabric image</Link>}>
        <section className="inspection-tool-grid"><Link to="/fabric-inspection" className="inspection-tool-card"><span className="section-label">Fabric visual AI</span><h2>Detect fabric defects</h2><p>Upload a roll image, view the model overlay, and review individual defect confidence.</p><b>Open fabric inspection -&gt;</b></Link><Link to="/label-inspection" className="inspection-tool-card inspection-tool-card--amber"><span className="section-label">Label verification</span><h2>Compare labels</h2><p>Run deterministic golden-reference review or non-deterministic label validation.</p><b>Open label inspection -&gt;</b></Link></section>
        <section className="dashboard-grid dashboard-grid--two"><article className="workspace-card"><div className="card-heading"><div><span className="section-label">Review queue</span><h2>Inspection decisions</h2></div><div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}><div className="filter-pills">{["All", "Needs review", "Approved", "Rejected"].map((item) => <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} /></div></div><div className="inspection-queue">{visible.map((inspection) => <div className="inspection-queue__row" key={inspection.id}><div><strong>{inspection.id} · {inspection.roll}</strong><small>{inspection.supplier} · {inspection.defects} detected defects · {inspection.confidence}% confidence</small></div><span className={`table-status table-status--${inspection.status.toLowerCase().replace(" ", "-")}`}>{inspection.status}</span><span className="inspection-grade">{inspection.grade}</span>{inspection.status === "Needs review" ? <button className="button button-quiet" onClick={() => setPendingAction("Approve inspection IN-8321")}>Review</button> : <Link className="text-link" to={`/inspections/${inspection.id.substring(3)}`}>View evidence</Link>}</div>)}</div></article><article className="workspace-card inspector-guide"><span className="section-label">Confidence routing</span><h2>Use the right level of control.</h2><div className="confidence-rules"><div><b>95%+</b><span>Auto-clear eligible defects after policy checks</span></div><div><b>80–94%</b><span>Inspector review required before release</span></div><div><b>&lt;80%</b><span>Flag for manual confirmation and notes</span></div></div><div className="note-thread"><span className="section-label">Inspection notes</span><div><span className="avatar">KH</span><p><b>Kabir Hossain</b><br />Escalate repeated oil spots on the next Northern Weaves lot.</p></div><div><span className="avatar">AR</span><p><b>Amina Rahman</b><br />Manager sign-off required for any reject over $5,000.</p></div><textarea placeholder="Add an inspection note..." aria-label="Add inspection note" /></div></article></section>
        {pendingAction && <div className="modal-backdrop" role="presentation"><section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><span className="section-label">Critical action</span><h2 id="confirm-title">Confirm approval</h2><p>You are about to approve a review-flagged inspection. This will be recorded in the audit log and release the roll from the hold queue.</p><label><input type="checkbox" /> I reviewed the model evidence and operator notes.</label><div><button className="button button-quiet" onClick={() => setPendingAction("")}>Cancel</button><button className="button button-primary" onClick={() => { setConfirmed(pendingAction); setPendingAction(""); }}>Confirm approval</button></div></section></div>}
        {confirmed && <div className="toast-message">{confirmed} recorded with manager sign-off.</div>}
    </OperationsShell>;
}

export default Inspections;
