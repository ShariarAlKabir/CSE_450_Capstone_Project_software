import OperationsShell from "../components/OperationsShell";
import { TrendChart } from "../components/Visuals";
import { trendData } from "../data/operationsData";

const exportReport = (type) => {
    const report = "Textile Quality Platform\nAugust 2026 quality and ROI report\nSaved since adoption: $42,860\nAI inspection time: 4 minutes per roll\nManual baseline: 18 minutes per roll\nProjected next-quarter reject cost: $18,400\n";
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `textile-quality-${type}-august-2026.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
};

function Reports() {
    return <OperationsShell eyebrow="Reports & forecasting" title="Translate inspection data into decisions." actions={<><button className="button button-quiet" onClick={() => exportReport("excel")}>Export Excel</button><button className="button button-primary" onClick={() => exportReport("management-report")}>Export PDF report</button></>}>
        <section className="dashboard-grid dashboard-grid--analytics"><article className="workspace-card workspace-card--large"><div className="card-heading"><div><span className="section-label">Quarter outlook</span><h2>Quality performance forecast</h2></div><span className="trend-chip positive">On target</span></div><TrendChart values={trendData} label="Quality performance forecast" /><div className="forecast-footer"><span>Next-quarter projected reject cost</span><strong>$18,400</strong><small>Down 22% from the prior quarter based on current supplier mix.</small></div></article><article className="workspace-card roi-card"><div className="card-heading"><div><span className="section-label">Payback tracker</span><h2>System adoption return</h2></div></div><div className="roi-card__amount"><span>Adoption investment</span><strong>$24,000</strong><small>Payback achieved in month 5</small></div><div className="payback-bars">{[38, 55, 68, 79, 100, 118].map((value, index) => <div key={value}><i style={{ height: `${Math.min(value, 100)}%` }} className={value >= 100 ? "is-paid" : ""} /><small>M{index + 1}</small></div>)}</div></article></section>
        <section className="dashboard-grid dashboard-grid--three"><article className="workspace-card report-stat"><span>Labor-hours saved</span><strong>612 h</strong><p>Manual inspection baseline: 18 minutes per roll. AI-assisted average: 4 minutes.</p></article><article className="workspace-card report-stat"><span>Cost saved per shipment</span><strong>$1,158</strong><p>Based on avoided rework, returns, and manual inspection labor.</p></article><article className="workspace-card report-stat"><span>Detection consistency</span><strong>96.8%</strong><p>Compared with an estimated 82% historical manual detection rate.</p></article></section>
        <section className="dashboard-grid dashboard-grid--two"><article className="workspace-card"><span className="section-label">Budget-impact simulator</span><h2>Shift volume before the cost moves.</h2><p>Move Northern Weaves volume to Pacific Mills and compare projected quality and cost exposure.</p><div className="simulator"><label>Volume to shift <input type="range" min="0" max="40" defaultValue="15" /><b>15%</b></label><div><span>Projected reject-cost reduction</span><strong>$4,480 / quarter</strong></div><div><span>Quality score impact</span><strong className="positive">+2.6 pts</strong></div></div></article><article className="workspace-card report-list"><span className="section-label">Ready reports</span><h2>Management pack</h2>{["August QC performance report", "Supplier negotiation packet", "AI return on investment summary", "Next-quarter risk forecast"].map((report) => <button key={report} onClick={() => exportReport("report")}><span>{report}</span><b>Export -&gt;</b></button>)}</article></section>
    </OperationsShell>;
}

export default Reports;
