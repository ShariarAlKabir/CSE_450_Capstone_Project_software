import { useState } from "react";
import "./DashboardCharts.css";

const colors = ["#168477", "#478bc2", "#d79a32", "#c85c66"];
const count = (value) => Number(value).toLocaleString();

export default function DashboardCharts({ stats, scope, period }) {
    const [selected, setSelected] = useState(null);
    const [percent, setPercent] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const grades = stats?.grade_distribution || [];
    const defects = [...(stats?.defect_breakdown || [])].sort((a, b) => b.value - a.value);
    const total = grades.reduce((sum, item) => sum + Number(item.value), 0);
    const defectTotal = defects.reduce((sum, item) => sum + Number(item.value), 0);
    const active = grades.find((item) => item.label === selected);
    const shown = showAll ? defects : defects.slice(0, 6);
    const max = Math.max(...defects.map((item) => Number(item.value)), 1);
    const segments = grades.map((item, index) => ({
        ...item,
        offset: grades.slice(0, index).reduce((sum, grade) => sum + Number(grade.value), 0) / (total || 1) * 100,
        share: Number(item.value) / (total || 1) * 100,
    }));

    return <section className="data-explorer" aria-label="Interactive inspection charts">
        <article className="workspace-card">
            <div className="card-heading"><div><span className="section-label">{scope} / {period}</span><h2>How did inspections grade?</h2></div></div>
            <p className="data-explorer__hint">Select a grade to see its share of inspected items.</p>
            {!total ? <p className="data-explorer__empty">No graded inspections for this selection.</p> : <>
                <div className="grade-explorer">
                    <div className="grade-explorer__donut">
                        <svg viewBox="0 0 160 160" role="group" aria-label="Inspection grade distribution">
                            {segments.filter((item) => item.value > 0).map((item) => {
                                const index = grades.findIndex((grade) => grade.label === item.label);
                                const label = `${item.label}: ${count(item.value)} inspections, ${item.share.toFixed(1)} percent`;
                                return <circle key={item.label} cx="80" cy="80" r="60" pathLength="100" fill="none" stroke={colors[index % colors.length]} strokeWidth={selected === item.label ? 23 : 18}
                                    strokeDasharray={`${item.share} ${100 - item.share}`} strokeDashoffset={-item.offset} transform="rotate(-90 80 80)"
                                    opacity={selected && selected !== item.label ? 0.3 : 1} tabIndex="0" role="button" aria-label={label} aria-pressed={selected === item.label}
                                    onClick={() => setSelected(selected === item.label ? null : item.label)}
                                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(selected === item.label ? null : item.label); } }}><title>{label}</title></circle>;
                            })}
                        </svg>
                        <div className="grade-explorer__center" aria-live="polite"><strong>{count(active ? active.value : total)}</strong><span>{active ? `Grade ${active.label}` : "inspections"}</span><small>{active ? `${(active.value / total * 100).toFixed(1)}% of total` : "All grades"}</small></div>
                    </div>
                    <div className="grade-explorer__legend">{segments.map((item, index) => <button key={item.label} aria-pressed={selected === item.label} onClick={() => setSelected(selected === item.label ? null : item.label)}>
                        <i style={{ background: colors[index % colors.length] }} /><span>{item.label === "Reject" ? "Reject" : `Grade ${item.label}`}</span><strong>{count(item.value)}</strong><small>{item.share.toFixed(1)}%</small>
                    </button>)}<button className="grade-explorer__reset" disabled={!selected} onClick={() => setSelected(null)}>Show all grades</button></div>
                </div>
                <details className="data-explorer__table"><summary>View grade data table</summary><table><caption>Inspection grades — {scope}, {period}</caption><thead><tr><th>Grade</th><th>Inspections</th><th>Share</th></tr></thead><tbody>{segments.map((item) => <tr key={item.label}><th>{item.label}</th><td>{count(item.value)}</td><td>{item.share.toFixed(1)}%</td></tr>)}</tbody></table></details>
            </>}
        </article>
        <article className="workspace-card">
            <div className="card-heading"><div><span className="section-label">{scope} / {period}</span><h2>Which defects are most common?</h2></div></div>
            <div className="data-explorer__toolbar"><p className="data-explorer__hint">{count(defectTotal)} detected defects. One item may have several.</p><div className="filter-pills" aria-label="Defect chart units"><button aria-pressed={!percent} className={!percent ? "is-active" : ""} onClick={() => setPercent(false)}>Count</button><button aria-pressed={percent} className={percent ? "is-active" : ""} onClick={() => setPercent(true)}>Percent</button></div></div>
            {!defectTotal ? <p className="data-explorer__empty">No defects recorded for this selection.</p> : <>
                <div className="defect-explorer">{shown.map((item) => <div className="defect-explorer__row" key={item.label}>
                    <div><span>{item.label}</span><strong>{percent ? `${(item.value / defectTotal * 100).toFixed(1)}%` : count(item.value)}</strong></div>
                    <div className="defect-explorer__track" role="img" aria-label={`${item.label}: ${count(item.value)} defects, ${(item.value / defectTotal * 100).toFixed(1)} percent of all defects`} title={`${count(item.value)} defects · ${(item.value / defectTotal * 100).toFixed(1)}% of all defects`}><i style={{ width: `${item.value / (percent ? defectTotal : max) * 100}%` }} /></div>
                </div>)}</div>
                <div className="data-explorer__foot"><small>{percent ? "Bar scale: 0–100% of all defects" : `Bar scale: 0–${count(max)} defects`}</small>{defects.length > 6 && <button onClick={() => setShowAll(!showAll)}>{showAll ? "Show top 6" : `Show all ${defects.length} types`}</button>}</div>
            </>}
        </article>
    </section>;
}
