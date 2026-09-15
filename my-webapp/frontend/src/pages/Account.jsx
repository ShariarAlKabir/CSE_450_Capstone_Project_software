import { useEffect, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";

// What each role may do. This is application policy, not data about a person,
// so it stays in the UI; the role itself comes from app_users.
const ROLE_ACCESS = {
    Inspector: "Upload inspections, add comments, and resolve standard review tasks.",
    Manager: "Approve/reject exceptions, view supplier cost intelligence, and export reports.",
    Admin: "Manage roles, system policy, audit records, and operational access.",
};

function Account() {
    const [user, setUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [role, setRole] = useState("");
    const [activities, setActivities] = useState([]);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/workspace/user`)
            .then((response) => {
                setUser(response.data);
                setRole(response.data.role);
            })
            .catch(() => setUser(null));

        axios.get(`${API_BASE_URL}/api/workspace/users`)
            .then((response) => setUsers(response.data?.users || []))
            .catch(() => setUsers([]));

        // The audit trail is the real inspection history, newest first.
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/inspections`, { params: { limit: 6 } }),
            axios.get(`${API_BASE_URL}/api/label/inspections`, { params: { limit: 6 } }),
        ])
            .then(([fabricResponse, labelResponse]) => {
                const rows = [
                    ...(fabricResponse.data?.inspections || []).map((item) => ({ ...item, scope: "Fabric" })),
                    ...(labelResponse.data?.inspections || []).map((item) => ({ ...item, scope: "Label" })),
                ]
                    .sort((a, b) => String(b.time).localeCompare(String(a.time)))
                    .slice(0, 6);
                setActivities(rows.map((item) => ({
                    id: item.id,
                    text: `${item.scope} inspection ${item.id} ${String(item.status).toLowerCase()} · ${item.supplier}`,
                    time: item.time,
                })));
            })
            .catch(() => setActivities([]));
    }, []);

    return (
        <OperationsShell eyebrow="Account & access" title="Access designed for accountable decisions.">
            <section className="account-layout">
                <article className="workspace-card account-profile">
                    <span className="avatar avatar--large">{user?.initials || "--"}</span>
                    <span className="section-label">Signed in as</span>
                    <h2>{user?.full_name || "Not signed in"}</h2>
                    <p>{user ? `${user.job_title} · ${user.location}` : "No current user on record."}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{user?.email}</p>

                    <label className="select-control">
                        Active role
                        <select value={role} onChange={(event) => setRole(event.target.value)}>
                            {Object.keys(ROLE_ACCESS).map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>

                    <div className="role-access">
                        <span className="section-label">Current access</span>
                        <p>{ROLE_ACCESS[role] || "Select a role to see its access level."}</p>
                    </div>

                    <div style={{ marginTop: "14px" }}>
                        <span className="section-label">Team on record</span>
                        {users.map((member) => (
                            <div key={member.user_id} style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "8px" }}>
                                <span className="avatar">{member.initials}</span>
                                <span style={{ fontSize: "0.75rem" }}>
                                    <strong>{member.full_name}</strong>
                                    <small style={{ display: "block", color: "var(--muted)" }}>{member.role} · {member.job_title}</small>
                                </span>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="workspace-card audit-log">
                    <div className="card-heading">
                        <div><span className="section-label">Audit trail</span><h2>Activity history</h2></div>
                    </div>
                    {activities.map((activity, index) => (
                        <div className="audit-log__item" key={activity.id}>
                            <i>{String(index + 1).padStart(2, "0")}</i>
                            <span>{activity.text}</span>
                            <time>{activity.time}</time>
                        </div>
                    ))}
                    {!activities.length && <p style={{ opacity: 0.7 }}>No inspection activity on record.</p>}
                </article>
            </section>
        </OperationsShell>
    );
}

export default Account;
