// Format "2026-03" as "Mar 26" for the chart axis.
const monthLabel = (value) => {
    if (!value) return "";
    const [year, month] = String(value).split("-");
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const name = names[Number(month) - 1];
    return name ? `${name} ${String(year).slice(2)}` : value;
};

export function TrendChart({ values, months, label = "Quality trend" }) {
    const chartValues = values?.length > 1 ? values : [values?.[0] ?? 0, values?.[0] ?? 0];
    const max = Math.max(...chartValues);
    const min = Math.min(...chartValues);
    const points = chartValues.map((value, index) => {
        const x = (index / (chartValues.length - 1)) * 100;
        const y = 88 - ((value - min) / Math.max(max - min, 1)) * 62;
        return `${x},${y}`;
    }).join(" ");

    // Axis labels track the data. They used to be fixed strings that could
    // disagree with the series being drawn.
    const first = months?.length ? monthLabel(months[0]) : "";
    const last = months?.length ? monthLabel(months[months.length - 1]) : "";

    return (
        <div className="trend-chart" role="img" aria-label={label}>
            <div className="trend-chart__grid" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points} /></svg>
            {(first || last) && (
                <div className="trend-chart__labels"><span>{first}</span><span>{last}</span></div>
            )}
        </div>
    );
}

export function ScoreRing({ value, label = "Overall score" }) {
    return <div className="score-ring" style={{ "--score": `${value * 3.6}deg` }}><strong>{value}</strong><span>{label}</span></div>;
}
