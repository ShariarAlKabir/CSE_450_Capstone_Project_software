export function TrendChart({ values, label = "Quality trend" }) {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const points = values.map((value, index) => {
        const x = (index / (values.length - 1)) * 100;
        const y = 88 - ((value - min) / Math.max(max - min, 1)) * 62;
        return `${x},${y}`;
    }).join(" ");

    return <div className="trend-chart" role="img" aria-label={label}><div className="trend-chart__grid" /><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points} /></svg><div className="trend-chart__labels"><span>Sep 25</span><span>Aug 26</span></div></div>;
}

export function ScoreRing({ value, label = "Overall score" }) {
    return <div className="score-ring" style={{ "--score": `${value * 3.6}deg` }}><strong>{value}</strong><span>{label}</span></div>;
}
