import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";
import FilterBar, { FilterGroup, FilterPills } from "../components/FilterBar";
import ScopeToggle from "../components/ScopeToggle";
import Modal from "../components/Modal";
import { ScoreRing } from "../components/Visuals";
import SupplierComparison from "../components/SupplierComparison";

const tierClass = (tier) => (tier || "standard").toLowerCase();

// Every field is a column the API measured or a contract amount it read.
// Cost, delivery, defect rate, COPQ, spend and the quality heatmap used to be
// arithmetic on the supplier rating, which made unrelated numbers move together.
const normalizeSupplier = (row) => {
    const isLabel = row.scope === "Label";
    const rating = Number(row.supplier_rating || 0);
    // Measured inspection quality where it exists; the contracted rating is a
    // separate thing and is shown separately.
    const quality = row.avg_quality != null ? Number(row.avg_quality) : null;
    const score = quality != null ? Math.round(quality) : Math.round(rating);

    return {
        id: `${isLabel ? "lbl" : "sup"}-${String(row.supplier_id).padStart(2, "0")}`,
        name: row.name,
        initials: row.name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
        scope: isLabel ? "Label" : "Fabric",
        specialty: row.fabric_specialty || row.label_specialty || "—",
        tier: row.supplier_tier || "Conditional",
        score,
        rating,
        quality,
        qualityInspections: Number(row.quality_inspections || 0),
        qualityStart: row.quality_start,
        qualityEnd: row.quality_end,
        inspectionStart: row.inspection_start,
        inspectionEnd: row.inspection_end,
        defectRate: row.defect_rate != null ? Number(row.defect_rate) : null,
        rejectRate: row.reject_rate != null ? Number(row.reject_rate) : null,
        unitPrice: row.unit_price != null ? Number(row.unit_price) : null,
        copq: row.copq_amount != null ? Number(row.copq_amount) : null,
        onTime: row.on_time_pct != null ? Number(row.on_time_pct) : null,
        spend: row.annual_spend != null ? Number(row.annual_spend) : null,
        renewal: row.renewal_date || "—",
        paymentTerms: row.payment_terms || "—",
        contractCode: row.contract_code || "—",
        email: row.contact_email || "", phone: row.contact_phone || "",
        location: `${row.city || "N/A"}, ${row.country || "N/A"}`,
        contact: row.contact_person || "N/A",
        shipments: Number(row.shipment_count || 0),
        inspections: Number(row.inspections || 0),
        avgShipmentQuality: row.avg_shipment_quality != null ? Number(row.avg_shipment_quality) : null,
        rejections: Number(row.rejects || 0),
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
    const [scope, setScope] = useState("Fabric");
    const [showAddSupplier, setShowAddSupplier] = useState(false);
    const [profileTab, setProfileTab] = useState("overview");
    // Comparison lives beside the register rather than below the fold, so
    // ticking suppliers and reading the result do not need a scroll between them.
    const [workspaceTab, setWorkspaceTab] = useState("profile");
    const [copied, setCopied] = useState("");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const [form, setForm] = useState({
        name: "", country: "", city: "", contact_person: "", contact_email: "", contact_phone: "", supplier_rating: "",
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
                // Blank means "not rated yet" - the API stores NULL rather than
                // giving a new supplier an unearned score.
                supplier_rating: form.supplier_rating === "" ? null : Number(form.supplier_rating),
            });
            setShowAddSupplier(false);
            window.location.reload();
        } catch (error) {
            setFormError(error.response?.data?.detail || "Could not add supplier. Please try again.");
            setSaving(false);
        }
    };

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
            axios.get(`${API_BASE_URL}/api/label/suppliers`),
        ])
            .then(([fabricResponse, labelResponse]) => {
                const normalized = [
                    ...(fabricResponse.data?.suppliers || []).map((row) => normalizeSupplier({ ...row, scope: "Fabric" })),
                    ...(labelResponse.data?.suppliers || []).map((row) => normalizeSupplier({ ...row, scope: "Label" })),
                ];
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
    const tierCounts = useMemo(() => {
        const inScope = suppliers.filter((s) => scope === "All" || s.scope === scope);
        return {
            All: inScope.length,
            Preferred: inScope.filter((s) => s.tier === "Preferred").length,
            Approved: inScope.filter((s) => s.tier === "Approved").length,
            Conditional: inScope.filter((s) => s.tier === "Conditional").length,
        };
    }, [suppliers, scope]);

    const filtered = useMemo(() => suppliers
        .filter((supplier) => (scope === "All" || supplier.scope === scope) && (tier === "All" || supplier.tier === tier) && supplier.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name);
            // Lower is better for defect rate; every other key sorts high to low.
            if (sortBy === "defect") return (a.defectRate ?? Infinity) - (b.defectRate ?? Infinity);
            const key = sortBy === "delivery" ? "onTime" : sortBy;
            return (Number(b[key]) || -Infinity) - (Number(a[key]) || -Infinity);
        }),
    [query, sortBy, suppliers, tier, scope]);

    // Scatter axes scale to the spread of the loaded rows, so a point's
    // position reflects the real data rather than an assumed price band.
    const scatterBounds = useMemo(() => {
        const prices = suppliers.map((s) => Number(s.unitPrice)).filter(Number.isFinite);
        const defects = suppliers.map((s) => Number(s.defectRate)).filter(Number.isFinite);
        const range = (values) => {
            if (!values.length) return { min: 0, span: 0 };
            const min = Math.min(...values);
            return { min, span: Math.max(...values) - min };
        };
        return { price: range(prices), defect: range(defects) };
    }, [suppliers]);

    const scatterX = (supplier) => {
        const { min, span } = scatterBounds.price;
        if (!span || supplier.unitPrice == null) return 50;
        return 8 + ((Number(supplier.unitPrice) - min) / span) * 82;
    };
    const scatterY = (supplier) => {
        const { min, span } = scatterBounds.defect;
        if (!span || supplier.defectRate == null) return 50;
        return 10 + ((Number(supplier.defectRate) - min) / span) * 78;
    };
    const compared = compareIds.map((id) => suppliers.find((supplier) => supplier.id === id)).filter(Boolean);

    const selectSupplier = (id) => setSearchParams({ selected: id });
    const toggleComparison = (id) => setCompareIds((current) => {
        const next = current.includes(id)
            ? current.filter((currentId) => currentId !== id)
            : current.length === 2 ? [current[1], id] : [...current, id];
        // Ticking a second supplier is a request to see the comparison.
        if (next.length >= 2) setWorkspaceTab("compare");
        if (next.length === 0) setWorkspaceTab("profile");
        return next;
    });

    if (loading && suppliers.length === 0) {
        return (
            <OperationsShell eyebrow="Supplier intelligence" title="Loading supplier data..." actions={<><button className="button button-quiet" onClick={() => window.print()}>Export negotiation packet</button><button className="button button-primary" onClick={() => setShowAddSupplier(true)}>Add supplier</button></>}>
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
        <OperationsShell eyebrow="Supplier intelligence" title="Manage the quality of your source." actions={<><button className="button button-quiet" onClick={() => window.print()}>Export negotiation packet</button><button className="button button-primary" onClick={() => setShowAddSupplier(true)}>Add supplier</button></>}>
            <FilterBar>
                <FilterGroup label="Find" grow>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Supplier name or location" aria-label="Find a supplier" />
                </FilterGroup>
                <FilterGroup label="Domain">
                    <ScopeToggle value={scope} onChange={setScope} counts={scopeCounts} />
                </FilterGroup>
                <FilterGroup label="Tier">
                    {/* These are the values stored on the supplier. The old list
                        offered "Standard" and "Watchlist", which match nothing in
                        the data, so both filtered the register down to zero. */}
                    <FilterPills options={["All", "Preferred", "Approved", "Conditional"]} value={tier} onChange={setTier} counts={tierCounts} />
                </FilterGroup>
                <FilterGroup label="Sort by">
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort suppliers by">
                        <option value="score">Measured quality</option>
                        <option value="rating">Contract rating</option>
                        <option value="defect">Lowest defect rate</option>
                        <option value="delivery">On-time delivery</option>
                        <option value="spend">Annual spend</option>
                        <option value="name">Name</option>
                    </select>
                </FilterGroup>
            </FilterBar>

            <section className="supplier-layout">
                <article className="workspace-card supplier-table-card">
                    <div className="supplier-table">
                        {filtered.map((supplier) => (
                            <button className={`supplier-row ${selected?.id === supplier.id ? "is-selected" : ""}`} onClick={() => selectSupplier(supplier.id)} key={supplier.id}>
                                <span className="avatar">{supplier.initials}</span>
                                {/* Name, place and tier stack in one flexible cell so the row
                                    fits the register column without truncating. The reject rate
                                    lives in the profile and comparison panels beside it. */}
                                <span className="supplier-row__id">
                                    <strong>{supplier.name}</strong>
                                    <small>{supplier.location}</small>
                                    <span className={`tier-badge tier-badge--${tierClass(supplier.tier)}`}>{supplier.tier}</span>
                                </span>
                                <strong className="supplier-row__score">{supplier.score}</strong>
                                <label className="compare-toggle" onClick={(event) => event.stopPropagation()} title="Add to comparison">
                                    <input type="checkbox" aria-label={`Compare ${supplier.name}`} checked={compareIds.includes(supplier.id)} onChange={() => toggleComparison(supplier.id)} />
                                </label>
                            </button>
                        ))}
                    </div>
                </article>

                <div className="supplier-workspace">
                    <div className="workspace-tabs" role="tablist" aria-label="Supplier workspace">
                        <button type="button" role="tab" aria-selected={workspaceTab === "profile"}
                            className={workspaceTab === "profile" ? "is-active" : ""}
                            onClick={() => setWorkspaceTab("profile")}>
                            Profile
                        </button>
                        <button type="button" role="tab" aria-selected={workspaceTab === "compare"}
                            className={workspaceTab === "compare" ? "is-active" : ""}
                            onClick={() => setWorkspaceTab("compare")}>
                            Compare{compared.length ? ` (${compared.length})` : ""}
                        </button>
                    </div>

                    {workspaceTab === "compare" ? (
        <article className="workspace-card">
                            <div className="card-heading">
                                <div><span className="section-label">Side-by-side</span><h2>Comparison desk</h2></div>
                                {compared.length > 0 && (
                                    // Carries the current selection through, so the full desk
                                    // opens with the same suppliers already loaded.
                                    <Link
                                        className="visual-link"
                                        to={`/analytics/suppliers?compare=${compared.map((supplier) => supplier.id).join(",")}`}
                                    >
                                        Full comparison <b aria-hidden="true">→</b>
                                    </Link>
                                )}
                            </div>
                            <SupplierComparison
                                suppliers={suppliers}
                                selectedIds={compareIds}
                                onSelectionChange={setCompareIds}
                            />
                        </article>
                    ) : !selected ? (
                        <article className="workspace-card">
                            <p>Select a supplier from the register to see its profile.</p>
                        </article>
                    ) : (
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
                            <span className="trend-label">{selected.rejectRate != null ? `${selected.rejectRate}% rejected` : "no inspections"}</span>
                            <span>{selected.inspections} inspections on record</span>
                        </div>
                        <div className="profile-tabs" role="tablist" aria-label="Supplier details">
                            {[["overview", "Overview"], ["contact", "Contact"], ["history", "Quality history"]].map(([key, label]) => (
                                <button key={key} role="tab" aria-selected={profileTab === key} className={profileTab === key ? "is-active" : ""} onClick={() => setProfileTab(key)}>{label}</button>
                            ))}
                        </div>
                        {profileTab === "overview" && (
                            <div className="profile-tab-panel">
                                <div className="score-breakdown">
                                    <div><span>Measured quality</span><b>{selected.quality ?? "—"}</b><i style={{ width: `${selected.quality || 0}%` }} /></div>
                                    <div><span>Contract rating</span><b>{selected.rating}</b><i style={{ width: `${selected.rating}%` }} /></div>
                                    <div><span>On-time delivery</span><b>{selected.onTime ?? "—"}</b><i style={{ width: `${selected.onTime || 0}%` }} /></div>
                                </div>
                                <div className="supplier-stat-grid">
                                    <div><span>Defects per inspection</span><b>{selected.defectRate ?? "—"}</b></div>
                                    <div><span>COPQ recorded</span><b>{selected.copq != null ? `$${Math.round(selected.copq).toLocaleString()}` : "—"}</b></div>
                                    <div><span>Contract unit price</span><b>{selected.unitPrice != null ? `$${selected.unitPrice}` : "—"}</b></div>
                                    <div><span>Inspections on record</span><b>{selected.inspections}</b></div>
                                </div>
                                <div className="profile-recommendation">
                                    <strong>{selected.tier === "Preferred" ? "Hold allocation" : "Review allocation"}</strong>
                                    <p>
                                        Measured quality {selected.score} against a contract rating of {selected.rating}
                                        {selected.rejectRate != null && <>, with {selected.rejectRate}% of {selected.inspections} inspections rejected</>}
                                        {selected.copq != null && <> and ${Math.round(selected.copq).toLocaleString()} of recorded loss</>}.
                                    </p>
                                </div>
                                <div className="profile-footer">
                                    <span>Contract renewal: <b>{selected.renewal}</b> ({selected.paymentTerms})</span>
                                    <span>Annual spend: <b>{selected.spend != null ? `$${Math.round(selected.spend).toLocaleString()}` : "—"}</b></span>
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
                                    <span className="section-label">Measured history</span>
                                    <div className="shipment-detail__facts">
                                        <div><span>Shipments</span><b>{selected.shipments}</b></div>
                                        <div><span>Inspections</span><b>{selected.inspections}</b></div>
                                        <div><span>Rejected</span><b>{selected.rejections}</b></div>
                                        <div><span>Avg shipment quality</span><b>{selected.avgShipmentQuality ?? "—"}</b></div>
                                    </div>
                                </div>
                                <div className="profile-recommendation">
                                    <strong>Trend outlook</strong>
                                    <p>Measured quality {selected.score} across {selected.inspections} inspections, {selected.rejectRate ?? 0}% rejected. Contract renews {selected.renewal}.</p>
                                </div>
                            </div>
                        )}
                    </article>
                    )}
                </div>
            </section>

            <section className="supplier-ranking-section">
                <article className="workspace-card">
                    <div className="card-heading">
                        <div><span className="section-label">Supplier ranking</span><h2>Price vs. quality exposure</h2></div>
                    </div>
                    <div className="scatter-plot">
                        {suppliers.filter((supplier) => scope === "All" || supplier.scope === scope).map((supplier) => (
                            <button key={supplier.id} className={`scatter-point scatter-point--${tierClass(supplier.tier)}`} style={{ left: `${scatterX(supplier)}%`, bottom: `${scatterY(supplier)}%` }} onClick={() => selectSupplier(supplier.id)} title={`${supplier.name}: ${supplier.unitPrice != null ? `$${supplier.unitPrice}/unit` : "no contract"} / ${supplier.defectRate ?? "—"} defects per inspection`}>
                                {supplier.initials}
                            </button>
                        ))}
                        <span className="scatter-x">Higher contract unit price -&gt;</span>
                        <span className="scatter-y">More defects per inspection ^</span>
                    </div>
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
