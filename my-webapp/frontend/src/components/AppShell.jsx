import { Link } from "react-router-dom";

import OperationsShell from "./OperationsShell";

/**
 * The inspection tools (fabric, label, deterministic, non-deterministic) used to
 * render their own full-page shell: no sidebar, a different type scale, and a
 * separate accent per page. Launching an inspection from the dashboard dropped
 * the operator into what looked like a different product with no way back except
 * one "Back" link.
 *
 * AppShell now adapts its old API onto the operations shell, so those pages keep
 * their navigation and match the rest of the app without each page being
 * rewritten. `description` and `aside` become an intro band above the content.
 */
function AppShell({
    eyebrow,
    title,
    description,
    backTo,
    backLabel = "Back",
    children,
    aside,
}) {
    return (
        <OperationsShell
            eyebrow={eyebrow}
            title={title}
            actions={backTo && (
                <Link className="button button-quiet" to={backTo}>{backLabel}</Link>
            )}
        >
            {(description || aside) && (
                <section className="tool-intro">
                    {description && <p className="tool-intro__lead">{description}</p>}
                    {aside && <div className="tool-intro__aside">{aside}</div>}
                </section>
            )}

            <div className="tool-content">
                {children}
            </div>
        </OperationsShell>
    );
}

export default AppShell;
