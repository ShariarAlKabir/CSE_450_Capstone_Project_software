import { Link, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";

import { shipments, suppliers } from "../data/operationsData";

const navigation = [
    { to: "/", label: "Dashboard", mark: "01" },
    { to: "/suppliers", label: "Suppliers", mark: "02" },
    { to: "/shipments", label: "Shipments", mark: "03" },
    { to: "/inspections", label: "Inspections", mark: "04" },
    { to: "/reports", label: "Reports", mark: "05" },
];

const hiddenPages = [
    { to: "/analytics/quality", label: "Quality trend" },
    { to: "/analytics/roi", label: "Time returned" },
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
    const normalizedQuery = query.trim().toLowerCase();
    const searchResults = normalizedQuery
        ? [
              ...suppliers
                  .filter((supplier) => supplier.name.toLowerCase().includes(normalizedQuery))
                  .map((supplier) => ({ label: supplier.name, meta: "Supplier", to: `/suppliers?selected=${supplier.id}` })),
              ...shipments
                  .filter((shipment) => `${shipment.id} ${shipment.supplier} ${shipment.fabric}`.toLowerCase().includes(normalizedQuery))
                  .map((shipment) => ({ label: shipment.id, meta: shipment.supplier, to: `/shipments?selected=${shipment.id}` })),
          ].slice(0, 5)
        : [];

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
                    <NavLink to="/notifications" className="operations-nav__link"><span>07</span>Notifications <b>3</b></NavLink>
                    <NavLink to="/account" className="operations-user"><span className="avatar">KH</span><span><strong>Shariar Al Kabir</strong><small>Quality manager</small></span></NavLink>
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
                        <Link to="/notifications" className="icon-button" aria-label="Notifications">Alerts <b>3</b></Link>
                        <Link to="/account" className="avatar">KH</Link>
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
