import { useState } from "react";
import "./ComparisonCharts.css";

const format = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const read = (supplier, key) => supplier[key] == null || !Number.isFinite(Number(supplier[key])) ? null : Number(supplier[key]);

export default function ComparisonCharts({ pair, metrics }) {
    const [metricKey, setMetricKey] = useState("quality");
    const [selectedSide, setSelectedSide] = useState(null);
    const [outcome, setOutcome] = useState("Rejected");
    const metric = metrics.find((item) => item.key === metricKey) || metrics[0];
    const values = pair.map((supplier) => read(supplier, metric.key));
    const ceiling = metric.max || Math.max(...values.filter((value) => value !== null), 1);
    const complete = values.every((value) => value !== null);
    const gap = complete ? Math.abs(values[0] - values[1]) : null;
    const best = !complete || gap < 0.005 ? null : (metric.high ? values[0] > values[1] : values[0] < values[1]) ? 0 : 1;
    return <section className="comparison-charts" aria-label="Interactive supplier comparison">
        <div className="comparison-charts__heading"><div><span className="section-label">Explore the comparison</span><h3>Two suppliers, one shared scale</h3></div><label>Metric<select value={metric.key} onChange={(event) => { setMetricKey(event.target.value); setSelectedSide(null); }}>{metrics.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div>
        <p className="comparison-charts__help">{metric.help} Select a bar for supplier details.</p>
        <div className="comparison-charts__plot">
            <div className="comparison-charts__axis" aria-hidden="true">{[1, .75, .5, .25, 0].map((fraction) => <span key={fraction}>{format(ceiling * fraction)}</span>)}</div>
            <div className="comparison-charts__bars">{pair.map((supplier, index) => <button type="button" key={supplier.id} className={`comparison-charts__bar comparison-charts__side-${index}`} aria-pressed={selectedSide === index} aria-label={`${supplier.name}, ${metric.label}: ${values[index] === null ? "No data" : `${format(values[index])}${metric.unit}`}`} onClick={() => setSelectedSide(selectedSide === index ? null : index)}>
                <span className="comparison-charts__column"><i style={{ height: `${values[index] === null ? 0 : Math.max(0, Math.min(100, values[index] / ceiling * 100))}%` }} /><strong>{values[index] === null ? "No data" : `${format(values[index])}${metric.unit}`}</strong></span>
                <span className="comparison-charts__name">{index === 0 ? "A" : "B"} · {supplier.name}</span>
            </button>)}</div>
        </div>
        <p className="comparison-charts__help">Scale: 0–{format(ceiling)} {metric.unit === "/100" ? "points" : metric.unit === "%" ? "percent" : "defects per inspection"}. {metric.high ? "Higher" : "Lower"} is better.</p>
        <div className="comparison-charts__insight" aria-live="polite">{selectedSide !== null
            ? <><strong>{pair[selectedSide].name}</strong><span>{metric.label}: {values[selectedSide] === null ? "No data recorded" : `${format(values[selectedSide])}${metric.unit}`}. {format(pair[selectedSide].inspections)} total recorded inspections.</span></>
            : <><strong>{!complete ? "More data needed" : best === null ? "Both suppliers are level" : `${pair[best].name} leads on ${metric.label.toLowerCase()}`}</strong><span>{!complete ? "A missing value is shown as No data, not as a zero score." : `Difference: ${format(gap)} ${metric.unit === "%" ? "percentage points" : metric.unit === "/100" ? "points" : "defects per inspection"}. This compares this metric only.`}</span></>}</div>
        <div className="comparison-charts__heading"><div><h3>Inspection outcomes</h3><p className="comparison-charts__help">Each ring represents that supplier’s recorded inspections.</p></div><div className="comparison-charts__toggle">{["Rejected", "Not rejected"].map((item) => <button type="button" key={item} aria-pressed={outcome === item} onClick={() => setOutcome(item)}>{item}</button>)}</div></div>
        <div className="comparison-charts__outcomes">{pair.map((supplier, index) => {
            const total = read(supplier, "inspections");
            const rejected = read(supplier, "rejections");
            const valid = total > 0 && rejected !== null && rejected >= 0 && rejected <= total;
            const value = valid ? outcome === "Rejected" ? rejected : total - rejected : null;
            const share = valid ? value / total * 100 : 0;
            return <div className={`comparison-charts__outcome comparison-charts__side-${index}`} key={supplier.id}>
                <strong>{index === 0 ? "A" : "B"} · {supplier.name}</strong>
                <div className="comparison-charts__ring" role="img" aria-label={valid ? `${supplier.name}: ${format(value)} of ${format(total)} inspections ${outcome.toLowerCase()}, ${format(share)} percent` : `${supplier.name}: no valid inspection outcome data`}>
                    <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="45" fill="none" stroke="#e5ece9" strokeWidth="12" /><circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" strokeWidth="12" pathLength="100" strokeDasharray={`${share} ${100 - share}`} transform="rotate(-90 60 60)" /></svg><b>{valid ? `${format(share)}%` : "No data"}</b>
                </div><span>{valid ? `${format(value)} of ${format(total)} ${outcome.toLowerCase()}` : "No inspection outcomes available"}</span>
            </div>;
        })}</div>
        <p className="comparison-charts__help">All recorded history. “Not rejected” may include items awaiting review; it does not mean approved. Sample sizes and inspection dates may differ.</p>
    </section>;
}
