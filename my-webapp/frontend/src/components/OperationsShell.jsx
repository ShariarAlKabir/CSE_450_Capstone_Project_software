import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "../config.js";

const navigation = [
    { to: "/", label: "Dashboard", mark: "01" },
    { to: "/suppliers", label: "Suppliers", mark: "02" },
    { to: "/shipments", label: "Shipments", mark: "03" },
    { to: "/inspections", label: "Inspections", mark: "04" },
    { to: "/reports", label: "Reports", mark: "05" },
];

const hiddenPages = [
    { to: "/analytics/quality", label: "Quality trend" },
    { to: "/analytics/defects", label: "Defects" },
    { to: "/analytics/suppliers", label: "Supplier scorecards" },
    { to: "/analytics/shipments", label: "Shipment lifecycle" },
    { to: "/analytics/inspections", label: "Inspection confidence" },
    { to: "/fabric-inspection", label: "Fabric inspection" },
    { to: "/label-inspection", label: "Label inspection" },
    { to: "/deterministic", label: "Deterministic review" },
    { to: "/non-deterministic", label: "Non-deterministic review" },
];

function OperationsShell({ title, eyebrow, children, actions }) {
    const [query, setQuery] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [pagesOpen, setPagesOpen] = useState(false);
    const location = useLocation();
    const [searchResults, setSearchResults] = useState([]);
    const [user, setUser] = useState(null);
    const [alertCount, setAlertCount] = useState(null);

    // The signed-in user and the alert badge both come from the database, so
    // the badge always equals the number of alerts the notifications page will
    // list, and the sidebar name matches the account page.
    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/workspace/user`)
            .then((response) => setUser(response.data))
            .catch(() => setUser(null));

        axios.get(`${API_BASE_URL}/api/workspace/alerts`, { params: { scope: "All" } })
            .then((response) => setAlertCount(response.data?.total ?? 0))
            .catch(() => setAlertCount(null));
    }, []);

    useEffect(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery.length < 2) {
            setSearchResults([]);
            return undefined;
        }

        let cancelled = false;
        const handle = window.setTimeout(() => {
            const supplierId = (prefix, id) => `${prefix}-${String(id).padStart(2, "0")}`;
            Promise.all([
                axios.get(`${API_BASE_URL}/api/fabric/suppliers`),
                axios.get(`${API_BASE_URL}/api/label/suppliers`),
                axios.get(`${API_BASE_URL}/api/fabric/shipments`),
                axios.get(`${API_BASE_URL}/api/label/shipments`),
            ])
                .then(([fabricSuppliers, labelSuppliers, fabricShipments, labelShipments]) => {
                    if (cancelled) return;
                    const results = [];
                    (fabricSuppliers.data?.suppliers || []).forEach((supplier) => {
                        if (supplier.name.toLowerCase().includes(normalizedQuery)) {
                            results.push({ label: supplier.name, meta: "Fabric supplier", to: `/suppliers?selected=${supplierId("sup", supplier.supplier_id)}` });
                        }
                    });
                    (labelSuppliers.data?.suppliers || []).forEach((supplier) => {
                        if (supplier.name.toLowerCase().includes(normalizedQuery)) {
                            results.push({ label: supplier.name, meta: "Label supplier", to: `/suppliers?selected=${supplierId("lbl", supplier.supplier_id)}` });
                        }
                    });
                    (fabricShipments.data?.shipments || []).forEach((shipment) => {
                        if (String(shipment.shipment_code).toLowerCase().includes(normalizedQuery)) {
                            results.push({ label: shipment.shipment_code, meta: "Fabric shipment", to: `/shipments?selected=${shipment.shipment_code}` });
                        }
                    });
                    (labelShipments.data?.shipments || []).forEach((shipment) => {
                        const haystack = `${shipment.shipment_code} ${shipment.label_type || ""} ${shipment.supplier || ""}`.toLowerCase();
                        if (haystack.includes(normalizedQuery)) {
                            results.push({ label: shipment.shipment_code, meta: "Label shipment", to: `/shipments?selected=${shipment.shipment_code}` });
                        }
                    });
                    setSearchResults(results.slice(0, 6));
                })
                .catch(() => {
                    if (!cancelled) setSearchResults([]);
                });
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [query]);

    return (
        <div className="operations-shell">
            <aside className={`operations-sidebar ${menuOpen ? "operations-sidebar--open" : ""}`}>
                <Link className="operations-brand" to="/">
                    <span className="operations-brand__mark">TQ</span>
                    <span>
                        <strong>Textile Quality</strong>
                        <small>Operations control</small>
                    </span>
                </Link>

                <nav className="operations-nav" aria-label="Primary navigation">
                    {navigation.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.to === "/"} className="operations-nav__link" onClick={() => setMenuOpen(false)}>
                            <span>{item.mark}</span>{item.label}
                        </NavLink>
                    ))}

                    <button
                        type="button"
                        className={`operations-nav__link operations-nav__toggle${pagesOpen ? " is-open" : ""}`}
                        onClick={() => setPagesOpen((isOpen) => !isOpen)}
                        aria-expanded={pagesOpen}
                    >
                        <span>06</span>Analytics <span className="operations-nav__caret" aria-hidden="true">▾</span>
                    </button>

                    {pagesOpen && (
                        <div className="operations-nav__submenu">
                            {hiddenPages.map((page) => (
                                <NavLink
                                    key={page.to}
                                    to={page.to}
                                    className="operations-nav__sublink"
                                    onClick={() => { setPagesOpen(false); setMenuOpen(false); }}
                                >
                                    {page.label}
                                </NavLink>
                            ))}
                        </div>
                    )}
                </nav>

                <div className="operations-sidebar__footer">
                    <NavLink to="/notifications" className="operations-nav__link"><span>07</span>Notifications {alertCount != null && <b>{alertCount}</b>}</NavLink>
                    <NavLink to="/blueprint" className="operations-nav__link"><span>08</span>Blueprint</NavLink>
                    <NavLink to="/account" className="operations-user"><span className="avatar">{user?.initials || "--"}</span><span><strong>{user?.full_name || "Not signed in"}</strong><small>{user?.job_title || ""}</small></span></NavLink>
                </div>
            </aside>

            <div className="operations-main">
                <header className="operations-topbar">
                    <button className="menu-button" onClick={() => setMenuOpen((isOpen) => !isOpen)} aria-label="Toggle navigation">Menu</button>
                    <div className="global-search">
                        <span aria-hidden="true">/</span>
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers, shipments, rolls..." aria-label="Global search" />
                        {searchResults.length > 0 && <div className="global-search__results">{searchResults.map((result) => <Link key={`${result.meta}-${result.label}`} to={result.to} onClick={() => setQuery("")}><span>{result.label}</span><small>{result.meta}</small></Link>)}</div>}
                    </div>
                    <div className="operations-topbar__actions">
                        <Link to="/notifications" className="icon-button" aria-label="Notifications">Alerts {alertCount != null && <b>{alertCount}</b>}</Link>
                        <Link to="/account" className="avatar">{user?.initials || "--"}</Link>
                    </div>
                </header>

                <main className="operations-content" key={location.pathname}>
                    <div className="operations-pagehead">
                        <div><span className="operations-eyebrow">{eyebrow}</span><h1>{title}</h1></div>
                        {actions && <div className="operations-pagehead__actions">{actions}</div>}
                    </div>
                    {children}
                </main>
            </div>
        </div>
    );
}

export default OperationsShell;
