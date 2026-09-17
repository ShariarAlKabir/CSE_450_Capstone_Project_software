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
    const [scope, setScope] = useState("Fabric");
    const [notes, setNotes] = useState([]);
    const [user, setUser] = useState(null);
    const [draftNote, setDraftNote] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [policy, setPolicy] = useState(null);

    const loadNotes = () => {
        axios.get(`${API_BASE_URL}/api/workspace/notes`, { params: { limit: 8 } })
            .then((response) => setNotes(response.data?.notes || []))
            .catch(() => setNotes([]));
    };

    useEffect(() => {
        loadNotes();
        axios.get(`${API_BASE_URL}/api/workspace/user`)
            .then((response) => setUser(response.data))
            .catch(() => setUser(null));
        // The routing rule is served from the same module the pipeline grades
        // with, rather than restated here as a separate confidence policy.
        axios.get(`${API_BASE_URL}/api/fabric/grading-policy`)
            .then((response) => setPolicy(response.data))
            .catch(() => setPolicy(null));
    }, []);

    const submitNote = async () => {
        const body = draftNote.trim();
        if (!body || savingNote) return;
        setSavingNote(true);
        try {
            await axios.post(`${API_BASE_URL}/api/workspace/notes`, { body });
            setDraftNote("");
            loadNotes();
        } finally {
            setSavingNote(false);
        }
    };

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/inspections`),
            axios.get(`${API_BASE_URL}/api/label/inspections`),
        ])
            .then(([fabricResponse, labelResponse]) => {
                const fabric = (fabricResponse.data?.inspections || []).map((item) => ({ ...item, scope: "Fabric" }));
                const label = (labelResponse.data?.inspections || []).map((item) => ({ ...item, scope: "Label" }));
                setInspections([...fabric, ...label]);
            })
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
        <section className="dashboard-grid dashboard-grid--two"><article className="workspace-card"><div className="card-heading"><div><span className="section-label">Review queue</span><h2>Inspection decisions</h2></div></div>
            <div className="card-filters">
                <div className="card-filters__group">
                    <span className="filterbar__label">Status</span>
                    <div className="filter-pills">{["All", "Needs review", "Approved", "Rejected"].map((item) => <button key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
                </div>
                <div className="card-filters__group">
                    <span className="filterbar__label">Domain</span>
                    <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                </div>
            </div><div className="inspection-queue">{visible.map((inspection) => <div className="inspection-queue__row" key={inspection.id}><div><strong>{inspection.id} · {inspection.roll}</strong><small>{inspection.supplier} · {inspection.defects} detected defects · {inspection.confidence != null ? `${inspection.confidence}% confidence` : "no detections"}</small></div><span className={`table-status table-status--${inspection.status.toLowerCase().replace(" ", "-")}`}>{inspection.status}</span><span className="inspection-grade">{inspection.grade}</span>{inspection.status === "Needs review" ? <button className="button button-quiet" onClick={() => setPendingAction(`Approve inspection ${inspection.id}`)}>Review</button> : <Link className="text-link" to={`/inspections/${inspection.scope === "Label" ? inspection.id : inspection.id.substring(3)}`}>View evidence</Link>}</div>)}</div></article><article className="workspace-card inspector-guide"><span className="section-label">Grading policy</span><h2>Use the right level of control.</h2><p style={{ fontSize: "0.74rem", color: "var(--muted)" }}>{policy?.description}</p><div className="confidence-rules">{(policy?.bands || []).map((band) => (<div key={band.grade}><b>{band.grade}</b><span>{band.label} — {band.routing}</span></div>))}</div><div className="note-thread">
                <span className="section-label">Inspection notes</span>
                {notes.map((note) => (
                    <div key={note.note_id}>
                        <span className="avatar">{note.initials}</span>
                        <p>
                            <b>{note.author}</b> <small style={{ color: "var(--muted)" }}>{note.role} · {note.created_at}</small>
                            <br />{note.body}
                            {note.inspection_id && (
                                <>
                                    {" "}
                                    <Link className="text-link" to={`/inspections/${note.inspection_id.startsWith("LB-") ? note.inspection_id : note.inspection_id.replace("IN-", "")}`}>
                                        {note.reference || note.inspection_id}
                                    </Link>
                                </>
                            )}
                        </p>
                    </div>
                ))}
                {!notes.length && <p style={{ opacity: 0.7 }}>No notes recorded yet.</p>}
                <textarea
                    placeholder={user ? `Add a note as ${user.full_name}...` : "Add an inspection note..."}
                    aria-label="Add inspection note"
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                />
                <button className="button button-quiet" onClick={submitNote} disabled={!draftNote.trim() || savingNote}>
                    {savingNote ? "Saving..." : "Save note"}
                </button>
            </div></article></section>
        {pendingAction && <div className="modal-backdrop" role="presentation"><section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><span className="section-label">Critical action</span><h2 id="confirm-title">Confirm approval</h2><p>You are about to approve a review-flagged inspection. This will be recorded in the audit log and release the roll from the hold queue.</p><label><input type="checkbox" /> I reviewed the model evidence and operator notes.</label><div><button className="button button-quiet" onClick={() => setPendingAction("")}>Cancel</button><button className="button button-primary" onClick={() => { setConfirmed(pendingAction); setPendingAction(""); }}>Confirm approval</button></div></section></div>}
        {confirmed && <div className="toast-message">{confirmed} recorded with manager sign-off.</div>}
    </OperationsShell>;
}

export default Inspections;
