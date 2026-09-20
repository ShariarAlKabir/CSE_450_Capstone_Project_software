const dateLabel = (value) => {
    if (!value) return null;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export default function ComparisonEvidence({ supplier, quality = false }) {
    const count = quality ? supplier.qualityInspections : supplier.inspections;
    const start = dateLabel(quality ? supplier.qualityStart : supplier.inspectionStart);
    const end = dateLabel(quality ? supplier.qualityEnd : supplier.inspectionEnd);
    return <div className="comparison-evidence">
        <strong>{(count || 0).toLocaleString()} {quality ? "scored inspections" : "inspections"}</strong>
        <span>{!count ? "No inspection evidence yet" : start && end ? `${start}${start === end ? "" : ` – ${end}`}` : "Inspection dates unavailable"}</span>
        {count > 0 && <small>All recorded history{quality ? " · with quality data" : ""}</small>}
    </div>;
}
