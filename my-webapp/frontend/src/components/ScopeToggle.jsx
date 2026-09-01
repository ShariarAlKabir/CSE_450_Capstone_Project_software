const SCOPES = ["All", "Fabric", "Label"];

function ScopeToggle({ value, onChange, counts }) {
    return (
        <div className="filter-pills" role="group" aria-label="Filter by scope">
            {SCOPES.map((scope) => (
                <button
                    key={scope}
                    className={value === scope ? "is-active" : ""}
                    onClick={() => onChange(scope)}
                >
                    {scope}
                    {counts && counts[scope] != null ? ` (${counts[scope]})` : ""}
                </button>
            ))}
        </div>
    );
}

export default ScopeToggle;
