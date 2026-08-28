import { useState } from "react";

import OperationsShell from "../components/OperationsShell";

const alerts = [
    { kind: "Supplier tier change", title: "Northern Weaves moved to Watchlist", detail: "Quality score fell to 74 after a third reject event in 30 days.", time: "26 Aug, 14:32", tone: "danger", unread: true },
    { kind: "Rejection streak", title: "Three consecutive rejected rolls", detail: "SH-24084 from Northern Weaves needs a manager-level supplier response.", time: "26 Aug, 11:04", tone: "warning", unread: true },
    { kind: "Contract renewal", title: "Northern Weaves renews in 1 day", detail: "Review the supplier scorecard and negotiation packet before renewal.", time: "26 Aug, 09:15", tone: "warning", unread: true },
    { kind: "Inspection queue", title: "Inspection IN-8321 is ready for review", detail: "Three medium-confidence defects were detected on R-24091-12.", time: "Today, 10:42", tone: "info", unread: false },
];

function Notifications() {
    const [items, setItems] = useState(alerts);
    const [filter, setFilter] = useState("All");
    const visible = items.filter((item) => filter === "All" || (filter === "Unread" ? item.unread : item.kind === filter));
    const clear = () => setItems((current) => current.map((item) => ({ ...item, unread: false })));

    return <OperationsShell eyebrow="Control room alerts" title="Know what needs attention first." actions={<button className="button button-quiet" onClick={clear}>Mark all as read</button>}>
        <section className="workspace-card notification-toolbar"><div className="filter-pills">{["All", "Unread", "Supplier tier change", "Rejection streak", "Contract renewal"].map((item) => <button className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></section>
        <section className="workspace-card notification-list">{visible.map((alert, index) => <article className={`notification-item notification-item--${alert.tone} ${alert.unread ? "is-unread" : ""}`} key={alert.title}><span className="notification-item__kind">{alert.kind}</span><div><h2>{alert.title}</h2><p>{alert.detail}</p></div><time>{alert.time}</time><button onClick={() => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unread: false } : item))}>{alert.unread ? "Mark read" : "Read"}</button></article>)}</section>
    </OperationsShell>;
}

export default Notifications;
