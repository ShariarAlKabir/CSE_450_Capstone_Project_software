/**
 * A filter toolbar whose controls are grouped and labelled.
 *
 * Every page used to drop its controls into one flex row, so a scope toggle and
 * a tier toggle rendered as one undifferentiated run of pills and it was not
 * obvious which pill belonged to which question. Each group here carries its own
 * label and is separated by a rule.
 */
export function FilterGroup({ label, children, grow = false }) {
    return (
        <div className={`filterbar__group${grow ? " filterbar__group--grow" : ""}`}>
            {label && <span className="filterbar__label">{label}</span>}
            <div className="filterbar__controls">{children}</div>
        </div>
    );
}

export function FilterPills({ options, value, onChange, counts }) {
    return (
        <div className="filter-pills">
            {options.map((option) => (
                <button
                    key={option}
                    type="button"
                    className={value === option ? "is-active" : ""}
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                >
                    {option}
                    {counts && counts[option] != null ? ` (${counts[option]})` : ""}
                </button>
            ))}
        </div>
    );
}

export default function FilterBar({ children }) {
    return <section className="workspace-card filterbar">{children}</section>;
}
