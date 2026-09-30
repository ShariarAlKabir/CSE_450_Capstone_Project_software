import { useId, useState } from "react";
import hole106 from "../../images/106.jpg";
import hole118 from "../../images/118.jpg";
import run125 from "../../images/125.jpg";
import run127 from "../../images/127.jpg";
import line19 from "../../images/19.jpg";
import hole2022 from "../../images/20220330_113759.jpg";
import "./FaultSamples.css";

// Manual visual annotations, expressed as percentages of the original image.
const samples = [
    { id: "106", image: hole106, fault: "Small opening", location: "Left of centre, halfway down the fabric.", description: "A small bright opening interrupts the surrounding rows of fabric.", box: [36, 46, 8, 8] },
    { id: "118", image: hole118, fault: "Small opening", location: "Lower-left area of the fabric.", description: "The rounded opening has a visibly disturbed edge around it.", box: [27, 50, 8, 9] },
    { id: "125", image: run125, fault: "Horizontal yarn disruption", location: "Across the lower half, starting near the left side.", description: "An enlarged patch leads into a long line where the regular fabric structure is interrupted.", box: [20, 56, 79, 9] },
    { id: "127", image: run127, fault: "Opening with a horizontal run", location: "From the opening at the lower left toward the right edge.", description: "A visible opening connects to a long disturbed row running across the fabric.", box: [18, 50, 81, 12] },
    { id: "19", image: line19, fault: "Vertical fabric irregularity", location: "A narrow strip near the centre, from top to bottom.", description: "A continuous vertical line and nearby puckering interrupt the otherwise regular surface.", box: [43, 1, 8, 98] },
    { id: "20220330_113759", image: hole2022, fault: "Hole / open structure", location: "Slightly right of centre, above the midpoint.", description: "A clear opening exposes the background, with displaced threads along its edges.", box: [54, 38, 7, 11] },
];

export default function FaultSamples({ report = false }) {
    const [selected, setSelected] = useState(null);
    const [showFault, setShowFault] = useState(true);
    const detailId = useId();

    return <section className="workspace-card fault-samples" aria-label="Sample fabric faults">
        <div className="card-heading"><div><span className="section-label">Sample fabric evidence · Demo</span><h2>{report ? "Sample fault reports" : "Explore sample fabric faults"}</h2></div></div>
        <p>Choose a sample to see where the fault appears. These are illustrative visual annotations, not verified model results.</p>
        <div className="fault-samples__grid">
            {samples.map((sample, index) => <button type="button" key={sample.id} className={`fault-samples__card${selected?.id === sample.id ? " is-selected" : ""}`} aria-expanded={selected?.id === sample.id} aria-controls={detailId} onClick={() => { setSelected(sample); setShowFault(true); }}>
                <img src={sample.image} alt={`Fabric sample ${index + 1}: ${sample.fault}`} loading="lazy" />
                <span><small>Sample {String(index + 1).padStart(2, "0")}</small><strong>{sample.fault}</strong><b>{report ? "View sample report" : "View fault"} →</b></span>
            </button>)}
        </div>
        <div id={detailId}>
            {selected && <article className="fault-samples__detail">
                <div className="fault-samples__image">
                    <img src={selected.image} alt={`${selected.fault}. ${selected.location}`} />
                    {showFault && <span className="fault-samples__box" aria-hidden="true" style={{ left: `${selected.box[0]}%`, top: `${selected.box[1]}%`, width: `${selected.box[2]}%`, height: `${selected.box[3]}%` }} />}
                </div>
                <div className="fault-samples__description" aria-live="polite">
                    <span className="section-label">Demo evidence</span>
                    <h3>{selected.fault}</h3>
                    <p>{selected.description}</p>
                    <div><strong>Where to look</strong><p>{selected.location}</p></div>
                    <small>Source: {selected.id}.jpg · Manually marked area</small>
                    <label><input type="checkbox" checked={showFault} onChange={(event) => setShowFault(event.target.checked)} /> Highlight fault area</label>
                    <a className="button button-quiet" href={selected.image} target="_blank" rel="noreferrer">Open full-size image ↗</a>
                    <button type="button" className="button button-quiet" onClick={() => setSelected(null)}>Close evidence</button>
                </div>
            </article>}
        </div>
    </section>;
}
