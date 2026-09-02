import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import ScopeToggle from "../components/ScopeToggle";
import Modal from "../components/Modal";
import { ScoreRing } from "../components/Visuals";

const tierClass = (tier) => (tier || "standard").toLowerCase();

const normalizeSupplier = (row, index) => {
    const score = Math.max(0, Math.min(100, Number(row.supplier_rating || 85)));
    const quality = Math.max(0, Math.min(100, Math.round(score)));
    const cost = Math.max(50, Math.min(100, Math.round(score - 4)));
    const delivery = Math.max(60, Math.min(100, Math.round(score + 3)));

    return {
        id: `sup-${String(row.supplier_id).padStart(2, "0")}`,
        name: row.name,
        initials: row.name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
        scope: index % 2 === 0 ? "Fabric" : "Label",
        tier: score >= 90 ? "Preferred" : score >= 80 ? "Standard" : "Watchlist",
        trend: score >= 90 ? "Improving" : score >= 80 ? "Stable" : "Declining",
        score: Math.round(score),
        quality,
        cost,
        delivery,
        defectRate: Number(((100 - score) / 18).toFixed(1)),
        effectiveCost: Number((3.2 + ((100 - score) / 40)).toFixed(2)),
        copq: Math.round((100 - score) * 160 + 1200),
        onTime: Math.max(60, Math.min(100, Math.round(score + 2))),
        spend: 15 + index * 5,
        email: row.contact_email || "", phone: row.contact_phone || "",
        fingerprint: "Database-sourced supplier profile",
        renewal: "Live data",
        location: `${row.city || "N/A"}, ${row.country || "N/A"}`,
        contact: row.contact_person || "N/A",
        shipments: 0,
        rejections: 0,
        heatmap: Array.from({ length: 12 }, (_, heatIndex) => (heatIndex % 5 === 0 ? "b" : "a")),
    };
};

function Suppliers() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [query, setQuery] = useState("");
    const [tier, setTier] = useState("All");
    const [sortBy, setSortBy] = useState("score");
    const [compareIds, setCompareIds] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scope, setScope] = useState("All");
    const [showAddSupplier, setShowAddSupplier] = useState(false);
    const [profileTab, setProfileTab] = useState("overview");
    const [copied, setCopied] = useState("");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const [form, setForm] = useState({
        name: "", country: "Bangladesh", city: "Dhaka", contact_person: "", contact_email: "", contact_phone: "", supplier_rating: 85,
    });
    const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
    const copyField = async (label, value) => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1600);
    };
    const addSupplier = async (event) => {
        event.preventDefault();
        if (!form.name.trim()) {
            setFormError("Company name is required.");
            return;
        }
        setSaving(true);
        setFormError("");
        try {
            await axios.post(`${API_BASE_URL}/api/fabric/suppliers`, {
                ...form,
                supplier_rating: Number(form.supplier_rating) || 85,
            });
            setShowAddSupplier(false);
            window.location.reload();
        } catch (error) {
            setFormError(error.response?.data?.detail || "Could not add supplier. Please try again.");
            setSaving(false);
        }
    };

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/suppliers`)
            .then((response) => {
                const rows = response.data?.suppliers || [];
                const normalized = rows.map(normalizeSupplier);
                setSuppliers(normalized);
                if (normalized.length >= 2) {
                    setCompareIds([normalized[0].id, normalized[1].id]);
                }
            })
            .catch(() => setSuppliers([]))
            .finally(() => setLoading(false));
    }, []);

    const selectedId = searchParams.get("selected") || suppliers[0]?.id || "";
    const selected = suppliers.find((supplier) => supplier.id === selectedId) || suppliers[0];
    const scopeCounts = {
        All: suppliers.length,
        Fabric: suppliers.filter((supplier) => supplier.scope === "Fabric").length,
        Label: suppliers.filter((supplier) => supplier.scope === "Label").length,
    };
    const filtered = useMemo(() => suppliers
        .filter((supplier) => (scope === "All" || supplier.scope === scope) && (tier === "All" || supplier.tier === tier) && supplier.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name) : b[sortBy] - a[sortBy]),
    [query, sortBy, suppliers, tier, scope]);
    const compared = suppliers.filter((supplier) => compareIds.includes(supplier.id));

    const selectSupplier = (id) => setSearchParams({ selected: id });
    const toggleComparison = (id) => setCompareIds((current) => current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : current.length === 2 ? [current[1], id] : [...current, id]);

    if (loading && suppliers.length === 0) {
        return (
            <OperationsShell eyebrow="Supplier intelligence" title="Loading supplier data..." actions={<><button className="button button-primary" onClick={() => setShowAddSupplier(true)}>Add supplier</button><button className="button button-quiet" onClick={() => window.print()}>Export negotiation packet</button></>}>
                <section className="workspace-card"><p>Fetching live supplier data from the backend.</p></section>
                {showAddSupplier && (
                    <Modal eyebrow="Supplier intelligence" title="Add supplier" onCancel={() => setShowAddSupplier(false)}>
                        <form className="modal-form" onSubmit={addSupplier}>
                            <label>Company name *<input required value={form.name} onChange={updateField("name")} placeholder="e.g. Bangladesh Textile Co." /></label>
                            <label>Country<input value={form.country} onChange={updateField("country")} placeholder="e.g. Bangladesh" /></label>
                            <label>City<input value={form.city} onChange={updateField("city")} placeholder="e.g. Dhaka" /></label>
                            <label>Supplier rating (0-100)<input type="number" min="0" max="100" value={form.supplier_rating} onChange={updateField("supplier_rating")} /></label>
                            <label>Contact person<input value={form.contact_person} onChange={updateField("contact_person")} placeholder="e.g. Rahim Uddin" /></label>
                            <label>Contact email<input type="email" value={form.contact_email} onChange={updateField("contact_email")} placeholder="e.g. rahim@textile.com" /></label>
                            <label>Contact phone<input value={form.contact_phone} onChange={updateField("contact_phone")} placeholder="e.g. +880 1700 000000" /></label>
                            {formError && <p className="modal-form__error">{formError}</p>}
                            <div className="modal-form__actions">
                                <button type="button" className="button button-quiet" onClick={() => setShowAddSupplier(false)}>Cancel</button>
                                <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Adding..." : "Add supplier"}</button>
                            </div>
                        </form>
                    </Modal>
                )}
            </OperationsShell>
        );
    }

    return (
        <>
        <OperationsShell eyebrow="Supplier intelligence" title="Manage the quality of your source." actions={<><button className="button button-primary" onClick={() => setShowAddSupplier(true)}>Add supplier</button><button className="button button-quiet" onClick={() => window.print()}>Export negotiation packet</button></>}>
            <section className="workspace-card supplier-filterbar">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a supplier" aria-label="Find a supplier" />
                <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                <div className="filter-pills">{["All", "Preferred", "Standard", "Watchlist"].map((item) => <button className={tier === item ? "is-active" : ""} onClick={() => setTier(item)} key={item}>{item}</button>)}</div>
                <label className="select-control">Sort by <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="score">Overall score</option><option value="quality">Quality</option><option value="cost">Cost efficiency</option><option value="delivery">On-time delivery</option><option value="name">Name</option></select></label>
            </section>

            <section className="supplier-layout">
                <article className="workspace-card supplier-table-card">
                    <div className="supplier-table">
                        {filtered.map((supplier) => (
                            <button className={`supplier-row ${selected?.id === supplier.id ? "is-selected" : ""}`} onClick={() => selectSupplier(supplier.id)} key={supplier.id}>
                                <span className="avatar">{supplier.initials}</span>
                                <span><strong>{supplier.name}</strong><small>{supplier.location}</small></span>
                                <span className={`tier-badge tier-badge--${tierClass(supplier.tier)}`}>{supplier.tier}</span>
                                <span className={`trend-label trend-label--${supplier.trend.toLowerCase()}`}>{supplier.trend}</span>
                                <strong>{supplier.score}</strong>
                                <label className="compare-toggle" onClick={(event) => event.stopPropagation()}>
                                    <input type="checkbox" checked={compareIds.includes(supplier.id)} onChange={() => toggleComparison(supplier.id)} />Compare
                                </label>
                            </button>
                        ))}
                    </div>
                </article>

                {selected ? (
                    <article className="workspace-card supplier-profile">
                        <div className="supplier-profile__head">
                            <div>
                                <span className="section-label">Supplier profile</span>
                                <h2>{selected.name}</h2>
                                <p>{selected.location}</p>
                                <div className="profile-contact-chips">
                                    <button className="profile-chip" type="button" onClick={() => copyField("email", selected.email)} title="Copy email address" disabled={!selected.email}>
                                        <span className="profile-chip__label">Email</span>
                                        <span className="profile-chip__value">{selected.email || "Not provided"}</span>
                                        <b>{copied === "email" ? "Copied!" : "Copy"}</b>
                                    </button>
                                    <button className="profile-chip" type="button" onClick={() => copyField("phone", selected.phone)} title="Copy phone number" disabled={!selected.phone}>
                                        <span className="profile-chip__label">Phone</span>
                                        <span className="profile-chip__value">{selected.phone || "Not provided"}</span>
                                        <b>{copied === "phone" ? "Copied!" : "Copy"}</b>
                                    </button>
                                    <a className="profile-chip profile-chip--link" href={`mailto:${selected.email}`} title="Open email client" aria-disabled={!selected.email}>
                                        <span className="profile-chip__label">Contact person</span>
                                        <span className="profile-chip__value">{selected.contact}</span>
                                        <b>Mail</b>
                                    </a>
                                </div>
                            </div>
                            <ScoreRing value={selected.score} />
                        </div>
                        <div className="profile-tags">
                            <span className={`tier-badge tier-badge--${tierClass(selected.tier)}`}>{selected.tier}</span>
                            <span className={`trend-label trend-label--${selected.trend.toLowerCase()}`}>{selected.trend}</span>
                            <span>Auto-updated quality rating</span>
                        </div>
                        <div className="profile-tabs" role="tablist" aria-label="Supplier details">
                            {[["overview", "Overview"], ["contact", "Contact"], ["history", "Quality history"]].map(([key, label]) => (
                                <button key={key} role="tab" aria-selected={profileTab === key} className={profileTab === key ? "is-active" : ""} onClick={() => setProfileTab(key)}>{label}</button>
                            ))}
                        </div>
                        {profileTab === "overview" && (
                            <div className="profile-tab-panel">
                                <div className="score-breakdown">
                                    <div><span>Quality</span><b>{selected.quality}</b><i style={{ width: `${selected.quality}%` }} /></div>
                                    <div><span>Cost</span><b>{selected.cost}</b><i style={{ width: `${selected.cost}%` }} /></div>
                                    <div><span>Delivery</span><b>{selected.delivery}</b><i style={{ width: `${selected.delivery}%` }} /></div>
                                </div>
                                <div className="supplier-stat-grid">
                                    <div><span>Defect fingerprint</span><b>{selected.fingerprint}</b></div>
                                    <div><span>COPQ this quarter</span><b>${selected.copq.toLocaleString()}</b></div>
                                    <div><span>Effective accepted yard</span><b>${selected.effectiveCost.toFixed(2)}</b></div>
                                    <div><span>On-time delivery</span><b>{selected.onTime}%</b></div>
                                </div>
                                <div className="profile-recommendation">
                                    <strong>Switch recommendation</strong>
                                    <p>Current supplier quality is being updated from the live fabric inspection database.</p>
                                </div>
                                <div className="profile-footer">
                                    <span>Contract renewal: <b>{selected.renewal}</b></span>
                                    <span>Spend coverage: <b>${selected.spend}k</b></span>
                                </div>
                            </div>
                        )}
                        {profileTab === "contact" && (
                            <div className="profile-tab-panel">
                                <div className="contact-directory">
                                    <div className="contact-directory__row">
                                        <span className="avatar">{selected.initials}</span>
                                        <div><b>Primary contact</b><small>Day-to-day account owner</small></div>
                                        <strong>{selected.contact}</strong>
                                    </div>
                                    <div className="contact-directory__row">
                                        <span className="avatar">@</span>
                                        <div><b>Email address</b><small>{selected.email || "Not provided"}</small></div>
                                        <button className="button button-ghost" type="button" onClick={() => copyField("email", selected.email)} disabled={!selected.email}>{copied === "email" ? "Copied!" : "Copy"}</button>
                                    </div>
                                    <div className="contact-directory__row">
                                        <span className="avatar">#</span>
                                        <div><b>Phone number</b><small>{selected.phone || "Not provided"}</small></div>
                                        <button className="button button-ghost" type="button" onClick={() => copyField("phone", selected.phone)} disabled={!selected.phone}>{copied === "phone" ? "Copied!" : "Copy"}</button>
                                    </div>
                                    <div className="contact-directory__row">
                                        <span className="avatar">&#9873;</span>
                                        <div><b>Location</b><small>{selected.location}</small></div>
                                        <strong>{selected.location.split(", ").slice(-1)[0]}</strong>
                                    </div>
                                </div>
                            </div>
                        )}
                        {profileTab === "history" && (
                            <div className="profile-tab-panel">
                                <div className="heatmap-section">
                                    <span className="section-label">Quality history / last 12 lots</span>
                                    <div className="quality-heatmap">{selected.heatmap.map((grade, index) => <i key={`${grade}-${index}`} className={`heatmap-cell heatmap-cell--${grade}`} title={`Lot ${index + 1}: ${grade.toUpperCase()}`} />)}</div>
                                    <small>A: pass · B: minor issue · C: needs review · R: rejected</small>
                                </div>
                                <div className="profile-recommendation">
                                    <strong>Trend outlook</strong>
                                    <p>{selected.trend} performance with {selected.score} overall. Monitor the next lot for any quality drift before the renewal discussion.</p>
                                </div>
                            </div>
                        )}
                    </article>
                ) : null}
            </section>

            <section className="dashboard-grid dashboard-grid--two">
                <article className="workspace-card">
                    <div className="card-heading">
                        <div><span className="section-label">Supplier ranking</span><h2>Price vs. quality exposure</h2></div>
                    </div>
                    <div className="scatter-plot">
                        {suppliers.filter((supplier) => scope === "All" || supplier.scope === scope).map((supplier) => (
                            <button key={supplier.id} className={`scatter-point scatter-point--${tierClass(supplier.tier)}`} style={{ left: `${(supplier.effectiveCost - 3.2) * 105}%`, bottom: `${supplier.defectRate * 13}%` }} onClick={() => selectSupplier(supplier.id)} title={`${supplier.name}: $${supplier.effectiveCost} / ${supplier.defectRate}% defect rate`}>
                                {supplier.initials}
                            </button>
                        ))}
                        <span className="scatter-x">Higher effective cost -&gt;</span>
                        <span className="scatter-y">Higher defect rate -&gt;</span>
                    </div>
                </article>
                <article className="workspace-card">
                    <div className="card-heading">
                        <div><span className="section-label">Side-by-side</span><h2>Comparison desk</h2></div>
                    </div>
                    {compared.length === 2 ? (
                        <div className="comparison-table">
                            <div><span>Metric</span>{compared.map((supplier) => <b key={supplier.id}>{supplier.initials}</b>)}</div>
                            {[["Quality", "quality"], ["Cost score", "cost"], ["On-time", "onTime"], ["Defect rate", "defectRate"]].map(([label, key]) => (
                                <div key={key}><span>{label}</span>{compared.map((supplier) => <b key={supplier.id}>{key === "defectRate" ? `${supplier[key]}%` : key === "onTime" ? `${supplier[key]}%` : supplier[key]}</b>)}</div>
                            ))}
                        </div>
                    ) : <p>Select two suppliers from the table to compare their performance.</p>}
                </article>
            </section>
        </OperationsShell>
        {showAddSupplier && (
            <Modal eyebrow="Supplier intelligence" title="Add supplier" onCancel={() => setShowAddSupplier(false)}>
                <form className="modal-form" onSubmit={addSupplier}>
                    <label>Company name *<input required value={form.name} onChange={updateField("name")} placeholder="e.g. Bangladesh Textile Co." /></label>
                    <label>Country<input value={form.country} onChange={updateField("country")} placeholder="e.g. Bangladesh" /></label>
                    <label>City<input value={form.city} onChange={updateField("city")} placeholder="e.g. Dhaka" /></label>
                    <label>Supplier rating (0-100)<input type="number" min="0" max="100" value={form.supplier_rating} onChange={updateField("supplier_rating")} /></label>
                    <label>Contact person<input value={form.contact_person} onChange={updateField("contact_person")} placeholder="e.g. Rahim Uddin" /></label>
                    <label>Contact email<input type="email" value={form.contact_email} onChange={updateField("contact_email")} placeholder="e.g. rahim@textile.com" /></label>
                    <label>Contact phone<input value={form.contact_phone} onChange={updateField("contact_phone")} placeholder="e.g. +880 1700 000000" /></label>
                    {formError && <p className="modal-form__error">{formError}</p>}
                    <div className="modal-form__actions">
                        <button type="button" className="button button-quiet" onClick={() => setShowAddSupplier(false)}>Cancel</button>
                        <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Adding..." : "Add supplier"}</button>
                    </div>
                </form>
            </Modal>
        )}
        </>
    );
}

export default Suppliers;
