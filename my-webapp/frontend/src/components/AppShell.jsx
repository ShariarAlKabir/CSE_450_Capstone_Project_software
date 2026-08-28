import { Link } from "react-router-dom";

function AppShell({
    accent = "teal",
    eyebrow,
    title,
    description,
    backTo,
    backLabel = "Back",
    children,
    aside,
}) {
    return (
        <main className={`app-shell accent-${accent}`}>
            <div className="app-shell__backdrop" />

            <div className="app-shell__container">
                <header className="app-header">
                    <div className="app-header__brand">
                        <span className="app-header__kicker">
                            Textile Quality Platform
                        </span>

                        <span className="app-header__date">
                            Professional inspection workspace
                        </span>
                    </div>

                    {backTo && (
                        <Link className="button button-ghost" to={backTo}>
                            {backLabel}
                        </Link>
                    )}
                </header>

                <section className="hero-card">
                    <div className="hero-card__content">
                        {eyebrow && (
                            <span className="eyebrow">
                                {eyebrow}
                            </span>
                        )}

                        <h1>
                            {title}
                        </h1>

                        {description && (
                            <p className="hero-card__description">
                                {description}
                            </p>
                        )}
                    </div>

                    {aside && (
                        <aside className="hero-card__aside">
                            {aside}
                        </aside>
                    )}
                </section>

                <div className="page-content">
                    {children}
                </div>
            </div>
        </main>
    );
}

export default AppShell;
