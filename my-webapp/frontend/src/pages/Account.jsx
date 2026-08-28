import { useState } from "react";

import OperationsShell from "../components/OperationsShell";

const activities = ["K. Hossain approved IN-8320", "A. Rahman exported the August ROI report", "System routed SH-24091 to second-stage sampling", "N. Islam changed Northern Weaves to Watchlist"];

function Account() {
    const [role, setRole] = useState("Manager");
    return <OperationsShell eyebrow="Account & access" title="Access designed for accountable decisions."><section className="account-layout"><article className="workspace-card account-profile"><span className="avatar avatar--large">KH</span><span className="section-label">Signed in as</span><h2>Kabir Hossain</h2><p>Quality operations · Dhaka</p><label className="select-control">Active role <select value={role} onChange={(event) => setRole(event.target.value)}><option>Inspector</option><option>Manager</option><option>Admin</option></select></label><div className="role-access"><span className="section-label">Current access</span>{role === "Inspector" && <p>Upload inspections, add comments, and resolve standard review tasks.</p>}{role === "Manager" && <p>Approve/reject exceptions, view supplier cost intelligence, and export reports.</p>}{role === "Admin" && <p>Manage roles, system policy, audit records, and operational access.</p>}</div><button className="button button-quiet">Manage team access</button></article><article className="workspace-card audit-log"><div className="card-heading"><div><span className="section-label">Audit trail</span><h2>Activity history</h2></div><button className="text-link">Export log</button></div>{activities.map((activity, index) => <div className="audit-log__item" key={activity}><i>{String(index + 1).padStart(2, "0")}</i><span>{activity}</span><time>{index < 2 ? "Today" : "26 Aug"}</time></div>)}</article></section></OperationsShell>;
}

export default Account;
