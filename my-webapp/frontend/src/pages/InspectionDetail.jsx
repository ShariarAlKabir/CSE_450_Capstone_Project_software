import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import OperationsShell from "../components/OperationsShell";

const SEVERITY_LABELS = { 1: "Minor", 2: "Moderate", 3: "Serious", 4: "Critical" };

export default function InspectionDetail() {
    const { inspectionId } = useParams();
    const [data, setData] = useState(null);
    const [activeClass, setActiveClass] = useState("All");
    const [expanded, setExpanded] = useState(null);
    const [hoveredDefect, setHoveredDefect] = useState(null);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/inspections/${inspectionId}`)
            .then((response) => setData(response.data))
            .catch(() => setData(null));
    }, [inspectionId]);

    const defectSummary = useMemo(() => {
        const counts = {};
        (data?.defects || []).forEach((defect) => {
            counts[defect.defect_type] = (counts[defect.defect_type] || 0) + 1;
        });
        return Object.entries(counts).map(([className, count]) => ({ className, count }));
    }, [data]);

    const severityCounts = useMemo(() => {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        (data?.defects || []).forEach((defect) => {
            counts[defect.severity] = (counts[defect.severity] || 0) + 1;
        });
        return [1, 2, 3, 4].map((severity) => ({ severity, count: counts[severity] }));
    }, [data]);

    const effectiveClass = activeClass === "All" || defectSummary.some((item) => item.className === activeClass) ? activeClass : "All";
    const visibleDefects = effectiveClass === "All" ? (data?.defects || []) : (data?.defects || []).filter((defect) => defect.defect_type === effectiveClass);
    const maxSeverity = Math.max(1, ...severityCounts.map((item) => item.count));

    if (!data) {
        return <OperationsShell eyebrow="Inspection evidence" title="Loading inspection detail..."><section className="workspace-card"><p>Fetching inspection evidence.</p></section></OperationsShell>;
    }

    return (
        <OperationsShell eyebrow="Inspection evidence" title={`Inspection IN-${inspectionId}`} actions={<Link className="button button-quiet" to="/inspections">Back to queue</Link>}>
            <section className="workspace-card">
                <div className="card-heading">
                    <div>
                        <span className="section-label">Decision summary</span>
                        <h2>{data.shipment_code} · {data.roll_code}</h2>
                        <p>{data.supplier}</p>
                    </div>
                    <strong className="inspection-detail__grade">{data.grade || "Pending"}</strong>
                </div>
                <div className="shipment-detail__facts">
                    <div><span>Status</span><b>{data.status}</b></div>
                    <div><span>Images processed</span><b>{data.total_images_processed}</b></div>
                    <div><span>Defects found</span><b>{data.total_defects_found}</b></div>
                    <div><span>Penalty points</span><b>{data.total_penalty_points}</b></div>
                    <div><span>Points / 100 yards</span><b>{data.points_per_100_yards}</b></div>
                </div>
            </section>

            <section className="workspace-card">
                <div className="card-heading">
                    <div><span className="section-label">Defect breakdown</span><h2>What was found on this roll.</h2></div>
                </div>
                <div className="severity-chart" role="img" aria-label="Defects by severity">
                    {severityCounts.map(({ severity, count }) => (
                        <div className="severity-chart__bar" key={severity} title={`${SEVERITY_LABELS[severity]} (severity ${severity}): ${count}`}>
                            <span>{count}</span>
                            <i style={{ height: `${Math.round((count / maxSeverity) * 100)}%` }} />
                            <b>{SEVERITY_LABELS[severity]}</b>
                        </div>
                    ))}
                </div>
                <div className="defect-type-filters">
                    <button className={activeClass === "All" ? "is-active" : ""} onClick={() => setActiveClass("All")}>All types <b>{data.defects?.length || 0}</b></button>
                    {defectSummary.map(({ className, count }) => (
                        <button key={className} className={activeClass === className ? "is-active" : ""} onClick={() => setActiveClass(className)}>{className} <b>{count}</b></button>
                    ))}
                </div>
            </section>

            <section className="workspace-card">
                <div className="card-heading">
                    <div><span className="section-label">Defect register</span><h2>{effectiveClass === "All" ? "All detected defects" : `${effectiveClass} defects`}</h2></div>
                    <span className="defect-count-pill">{visibleDefects.length} shown</span>
                </div>
                <div className="inspection-defect-map" aria-hidden="true">
                    {(data.defects || []).map((defect) => (
                        <i
                            key={defect.defect_id}
                            className={`inspection-defect-map__dot inspection-defect-map__dot--sev-${defect.severity} ${hoveredDefect === defect.defect_id ? "is-hovered" : ""} ${effectiveClass === "All" || effectiveClass === defect.defect_type ? "" : "is-dimmed"}`}
                            style={{ left: `${Math.max(2, Math.min(98, Number(defect.position_x || 0.5) * 100))}%`, top: `${Math.max(2, Math.min(98, Number(defect.position_y || 0.5) * 100))}%` }}
                            onMouseEnter={() => setHoveredDefect(defect.defect_id)}
                            onMouseLeave={() => setHoveredDefect(null)}
                        />
                    ))}
                    <span className="inspection-defect-map__axis">position across roll →</span>
                </div>
                {hoveredDefect != null && (
                    <div className="inspection-defect-map__tooltip">
                        {(data.defects || []).find((defect) => defect.defect_id === hoveredDefect)?.defect_type} · {Math.round(Number((data.defects || []).find((defect) => defect.defect_id === hoveredDefect)?.confidence_score || 0) * 100)}% confidence
                    </div>
                )}
                <div className="compact-table inspection-defect-table">
                    <div className="compact-table__row compact-table__row--header"><span>Defect</span><small>Severity</small><small>Confidence</small><small>Image</small></div>
                    {visibleDefects.map((defect) => (
                        <div className="compact-table__row compact-table__row--defect" key={defect.defect_id} onClick={() => setExpanded(expanded === defect.defect_id ? null : defect.defect_id)}>
                            <span><b>{defect.defect_type}</b><small>{expanded === defect.defect_id ? "Click to collapse" : "Click for details"}</small></span>
                            <span className={`severity-pill severity-pill--sev-${defect.severity}`}>{SEVERITY_LABELS[defect.severity]}</span>
                            <strong>{Math.round(Number(defect.confidence_score || 0) * 100)}%</strong>
                            <small>Image {defect.image_index}</small>
                            {expanded === defect.defect_id && (
                                <div className="defect-expanded">
                                    <span>Confidence <b>{Math.round(Number(defect.confidence_score || 0) * 100)}%</b></span>
                                    <span>Position <b>({Number(defect.position_x || 0).toFixed(3)}, {Number(defect.position_y || 0).toFixed(3)})</b></span>
                                    <span>Image index <b>{defect.image_index}</b></span>
                                    <span>Severity level <b>{defect.severity} / 4</b></span>
                                </div>
                            )}
                        </div>
                    ))}
                    {!visibleDefects.length && (
                        <div className="compact-table__row"><span><b>No defects for this filter</b></span><small>Try another defect type or reset to All.</small></div>
                    )}
                </div>
            </section>
        </OperationsShell>
    );
}
