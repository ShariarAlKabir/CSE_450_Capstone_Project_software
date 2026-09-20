import { useState } from "react";
import ComparisonEvidence from "./ComparisonEvidence";

const METRICS = [
    { key: "quality", label: "Measured quality", group: "Quality", unit: "/100", high: true, max: 100, help: "Average quality measured from inspections. A higher score means better observed quality." },
    { key: "rating", label: "Contract rating", group: "Quality", unit: "/100", high: true, max: 100, help: "The supplier’s agreed rating. This is separate from measured inspection quality." },
    { key: "defectRate", label: "Defects per inspection", group: "Quality", unit: "", high: false, help: "Total defects divided by inspections. Fewer defects per inspection is better." },
    { key: "rejectRate", label: "Reject rate", group: "Quality", unit: "%", high: false, max: 100, help: "Percentage of inspections rejected. A lower rate means fewer rejected inspections." },
    { key: "onTime", label: "On-time delivery", group: "Delivery", unit: "%", high: true, max: 100, help: "Percentage of shipments received by their promised date. Higher is better." },
];
const valueOf = (supplier, metric) => {
    const value = supplier?.[metric.key];
    return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
};
const format = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function SupplierComparison({ suppliers, selectedIds, onSelectionChange }) {
    const [group, setGroup] = useState("All metrics");
    const [expanded, setExpanded] = useState("quality");
    const pair = [0, 1].map((index) => suppliers.find((supplier) => supplier.id === selectedIds[index]));
    const ready = pair.every(Boolean);
    const metrics = METRICS.filter((metric) => group === "All metrics" || metric.group === group);
    const choose = (index, id) => {
        const next = [...selectedIds];
        next[index] = id;
        onSelectionChange(next);
    };

    return (
        <div className="supplier-compare">
            <p className="supplier-compare__intro">Two suppliers. One clear view of quality and delivery.</p>
            <div className="supplier-compare__pair">
                {[0, 1].map((index) => {
                    const supplier = pair[index];
                    return (
                        <div className={`supplier-compare__supplier supplier-compare__supplier--${index}`} key={index}>
                            <label htmlFor={`comparison-supplier-${index}`}><span className="supplier-compare__marker">{index === 0 ? "A" : "B"}</span> Supplier {index === 0 ? "A" : "B"}</label>
                            <select id={`comparison-supplier-${index}`} value={supplier?.id || ""} onChange={(event) => choose(index, event.target.value)}>
                                <option value="" disabled>Select a supplier</option>
                                {suppliers.map((option) => <option key={option.id} value={option.id} disabled={pair[1 - index]?.id === option.id}>{option.name}</option>)}
                            </select>
                            {supplier && <><h3>{supplier.name}</h3><p>{supplier.scope} · {supplier.location}</p><div className="supplier-compare__context"><span>{supplier.tier}</span><span>{supplier.inspections.toLocaleString()} inspections</span></div></>}
                        </div>
                    );
                })}
            </div>
            <div className="supplier-compare__toolbar">
                <div className="supplier-compare__filters" aria-label="Comparison metrics">
                    {["All metrics", "Quality", "Delivery"].map((option) => <button type="button" key={option} aria-pressed={group === option} onClick={() => setGroup(option)}>{option}</button>)}
                </div>
                <button type="button" className="supplier-compare__swap" disabled={!ready} onClick={() => onSelectionChange([...selectedIds].reverse())}>⇄ Swap sides</button>
            </div>
            {!ready ? <p className="supplier-compare__empty">Choose two suppliers above or tick them in the register to start comparing.</p> : <>
                {pair[0].scope !== pair[1].scope && <p className="supplier-compare__notice">Different domains: fabric and label inspection methods differ. Read these metrics in that context.</p>}
                <div className="supplier-compare__sticky" aria-label="Comparing suppliers">
                    {pair.map((supplier, index) => <div key={supplier.id} className={`supplier-compare__value--${index}`}><span className="supplier-compare__marker">{index === 0 ? "A" : "B"}</span><strong>{supplier.name}</strong></div>)}
                </div>
                <div className="supplier-compare__metrics">
                    {metrics.map((metric) => {
                        const values = pair.map((supplier) => valueOf(supplier, metric));
                        const available = values.every((value) => value !== null);
                        const gap = available ? Math.abs(values[0] - values[1]) : null;
                        const tied = available && gap < 0.005;
                        const best = !available || tied ? -1 : (metric.high ? values[0] > values[1] : values[0] < values[1]) ? 0 : 1;
                        const ceiling = metric.max || Math.max(...values.filter((value) => value !== null), 1);
                        const open = expanded === metric.key;
                        return <section className={`supplier-compare__metric${open ? " is-expanded" : ""}`} key={metric.key}>
                            <button type="button" className="supplier-compare__metric-heading" aria-expanded={open} aria-controls={`comparison-detail-${metric.key}`} onClick={() => setExpanded(open ? null : metric.key)}>
                                <span><strong>{metric.label}</strong><small>{metric.high ? "↑ Higher is better" : "↓ Lower is better"}</small></span><span aria-hidden="true">{open ? "−" : "+"}</span>
                            </button>
                            <p className="comparison-metric-help">{metric.key === "quality" ? "Inspection quality on a 0–100 scale: fabric uses defect penalty points; labels use similarity to a reference label." : metric.help} <span>Unit: {metric.unit === "/100" ? "points out of 100" : metric.unit === "%" ? "percent (%)" : "defects per inspection"}.</span></p>
                            <div className="supplier-compare__values">
                                {values.map((value, index) => <div className={`supplier-compare__value supplier-compare__value--${index}`} key={pair[index].id}>
                                    <div><span className="supplier-compare__marker">{index === 0 ? "A" : "B"}</span><b>{value === null ? "No data" : format(value)}<small>{value === null ? "" : metric.unit}</small></b>
                                        {available && <span
                                            className={`supplier-compare__delta supplier-compare__delta--${tied ? "neutral" : value > values[1 - index] ? "better" : "worse"}`}
                                            title={`Difference from ${pair[1 - index].name}${metric.unit === "%" ? " in percentage points" : ""}`}
                                        >({tied ? "0" : `${value > values[1 - index] ? "+" : "−"}${format(gap)}`}{metric.unit === "%" ? " pp" : ""})</span>}
                                        {best === index && <span className="supplier-compare__best">Better</span>}
                                    </div>
                                    <div className="supplier-compare__track" aria-hidden="true"><span style={{ width: `${value === null ? 0 : Math.max(0, Math.min(100, value / ceiling * 100))}%` }} /></div>
                                    {["quality", "defectRate", "rejectRate"].includes(metric.key) && <ComparisonEvidence supplier={pair[index]} quality={metric.key === "quality"} />}
                                    {metric.key === "rating" && <p className="comparison-metric-help">Contract value · not based on inspections</p>}
                                </div>)}
                            </div>
                            {open && <div className="supplier-compare__detail" id={`comparison-detail-${metric.key}`}>{metric.help} {metric.max ? "Bars use a fixed 0–100 scale." : "Bars share a scale based on the larger value in this row."}</div>}
                        </section>;
                    })}
                </div>
                <p className="supplier-compare__footnote">Signed differences beside each value compare it with the other supplier. “pp” means percentage points. Select a metric heading to see how it is measured. “Better” compares only these two suppliers; it is not an overall recommendation.</p>
            </>}
        </div>
    );
}
