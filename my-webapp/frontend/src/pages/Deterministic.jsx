import { useEffect, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import AppShell from "../components/AppShell";

function Deterministic() {
    const [golden, setGolden] = useState(null);
    const [candidate, setCandidate] = useState(null);
    const [goldenPreview, setGoldenPreview] = useState("");
    const [candidatePreview, setCandidatePreview] = useState("");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        return () => {
            if (goldenPreview) {
                URL.revokeObjectURL(goldenPreview);
            }

            if (candidatePreview) {
                URL.revokeObjectURL(candidatePreview);
            }
        };
    }, [goldenPreview, candidatePreview]);

    const handleFileChange = (event, type) => {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        const previewUrl = URL.createObjectURL(file);

        if (type === "golden") {
            if (goldenPreview) {
                URL.revokeObjectURL(goldenPreview);
            }

            setGolden(file);
            setGoldenPreview(previewUrl);
        } else {
            if (candidatePreview) {
                URL.revokeObjectURL(candidatePreview);
            }

            setCandidate(file);
            setCandidatePreview(previewUrl);
        }

        setResult(null);
        setError("");
    };

    const handleInspect = async () => {
        if (!golden || !candidate) {
            setError("Please select both a golden image and a candidate image.");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const formData = new FormData();

            formData.append("golden", golden);
            formData.append("candidate", candidate);

            const response = await axios.post(
                `${API_BASE_URL}/api/deterministic/inspect`,
                formData,
                {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                }
            );

            setResult(response.data);
        } catch (requestError) {
            console.error(requestError);

            if (requestError.response) {
                setError(requestError.response.data.detail || "Inspection failed.");
            } else {
                setError("Could not connect to the backend.");
            }
        } finally {
            setLoading(false);
        }
    };

    const verdictTone = String(result?.verdict || "")
        .toLowerCase()
        .includes("reject")
        ? "error"
        : "success";

    return (
        <AppShell
            accent="amber"
            eyebrow="Deterministic Label Review"
            title="Compare a golden label against a production candidate"
            description="Upload the approved reference and the sample under inspection. The result view is structured around verdict, inspection gates, and diagnostic evidence."
            backTo="/label-inspection"
            backLabel="Back to label modes"
            aside={
                <div className="hero-note">
                    <div className="section-label">Review model</div>
                    <p>
                        This flow is optimized for repeatable decision-making.
                        Operators get one consistent path from file upload to
                        final verdict.
                    </p>
                </div>
            }
        >
            <section className="section-grid section-grid--two">
                <article className="panel-card">
                    <div className="section-label">Golden reference</div>
                    <h2>Upload the approved label</h2>
                    <p>
                        This image acts as the standard for structural and visual
                        comparison.
                    </p>

                    <label className="upload-dropzone">
                        <span className="upload-dropzone__title">
                            Select golden image
                        </span>

                        <span className="upload-dropzone__text">
                            Use the accepted reference label
                        </span>

                        <input
                            className="file-input"
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleFileChange(event, "golden")}
                            disabled={loading}
                        />
                    </label>

                    {golden && (
                        <div className="file-meta">
                            <span className="status-pill status-pill--neutral">
                                Reference loaded
                            </span>
                            <span>{golden.name}</span>
                        </div>
                    )}

                    <div className="preview-frame">
                        {goldenPreview ? (
                            <img
                                src={goldenPreview}
                                alt="Golden preview"
                                className="preview-image"
                            />
                        ) : (
                            <div className="empty-state empty-state--compact">
                                <strong>No golden image selected</strong>
                                <span>
                                    The approved reference preview will appear
                                    here.
                                </span>
                            </div>
                        )}
                    </div>
                </article>

                <article className="panel-card panel-card--contrast">
                    <div className="section-label">Candidate sample</div>
                    <h2>Upload the label to inspect</h2>
                    <p>
                        The candidate image is evaluated against the golden
                        reference and summarized through inspection gates.
                    </p>

                    <label className="upload-dropzone">
                        <span className="upload-dropzone__title">
                            Select candidate image
                        </span>

                        <span className="upload-dropzone__text">
                            Use the current production sample
                        </span>

                        <input
                            className="file-input"
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleFileChange(event, "candidate")}
                            disabled={loading}
                        />
                    </label>

                    {candidate && (
                        <div className="file-meta">
                            <span className="status-pill status-pill--neutral">
                                Candidate loaded
                            </span>
                            <span>{candidate.name}</span>
                        </div>
                    )}

                    <div className="preview-frame">
                        {candidatePreview ? (
                            <img
                                src={candidatePreview}
                                alt="Candidate preview"
                                className="preview-image"
                            />
                        ) : (
                            <div className="empty-state empty-state--compact">
                                <strong>No candidate image selected</strong>
                                <span>
                                    The candidate preview will appear here after
                                    upload.
                                </span>
                            </div>
                        )}
                    </div>
                </article>
            </section>

            <div className="page-actions">
                <button
                    className="button button-primary button-primary--wide"
                    onClick={handleInspect}
                    disabled={loading}
                >
                    {loading ? "Running inspection..." : "Run deterministic inspection"}
                </button>
            </div>

            {error && (
                <div className="status-banner status-banner--error">
                    {error}
                </div>
            )}

            {result && (
                <section className="results-stack">
                    <article className="panel-card panel-card--elevated">
                        <div className="section-label">Inspection result</div>
                        <div className="result-header">
                            <h2>Verdict and summary</h2>
                            <span className={`status-pill status-pill--${verdictTone}`}>
                                {result.verdict}
                            </span>
                        </div>

                        <pre className="summary-block">{result.summary}</pre>
                    </article>

                    <section className="metric-grid metric-grid--three">
                        <article className="metric-card">
                            <span className="metric-card__label">
                                Gate 1 skew angle
                            </span>
                            <strong>
                                {result.gate1.angle_deg !== null
                                    ? `${result.gate1.angle_deg.toFixed(2)}°`
                                    : "N/A"}
                            </strong>
                        </article>

                        <article className="metric-card">
                            <span className="metric-card__label">
                                Target width
                            </span>
                            <strong>{result.target_size.width}px</strong>
                        </article>

                        <article className="metric-card">
                            <span className="metric-card__label">
                                Target height
                            </span>
                            <strong>{result.target_size.height}px</strong>
                        </article>
                    </section>

                    <section className="section-grid section-grid--two">
                        <article className="panel-card">
                            <div className="section-label">Gate 1</div>
                            <h3>Structural inspection</h3>
                            <p>
                                Confirms orientation and geometric consistency
                                before visual similarity checks are considered.
                            </p>
                            <div className="badge-row">
                                <span className="status-pill status-pill--neutral">
                                    Skew angle {result.gate1.angle_deg !== null
                                        ? `${result.gate1.angle_deg.toFixed(2)}°`
                                        : "N/A"}
                                </span>
                            </div>
                        </article>

                        <article className="panel-card panel-card--contrast">
                            <div className="section-label">Gate 2</div>
                            <h3>Visual inspection</h3>
                            {result.gate2 ? (
                                <div className="metric-grid metric-grid--two">
                                    <div className="metric-card">
                                        <span className="metric-card__label">
                                            SSIM score
                                        </span>
                                        <strong>
                                            {result.gate2.ssim_score.toFixed(3)}
                                        </strong>
                                    </div>

                                    <div className="metric-card">
                                        <span className="metric-card__label">
                                            Hotspots
                                        </span>
                                        <strong>{result.gate2.hotspot_count}</strong>
                                    </div>
                                </div>
                            ) : (
                                <div className="empty-state empty-state--compact">
                                    <strong>Gate 2 not returned</strong>
                                    <span>
                                        No visual inspection data was included in
                                        this response.
                                    </span>
                                </div>
                            )}
                        </article>
                    </section>

                    <article className="panel-card panel-card--contrast">
                        <div className="section-label">Diagnostic visualization</div>
                        <div className="preview-frame preview-frame--large">
                            <img
                                src={`${API_BASE_URL}${result.visualization_url}`}
                                alt="Inspection diagnostic visualization"
                                className="preview-image"
                            />
                        </div>
                    </article>
                </section>
            )}
        </AppShell>
    );
}

export default Deterministic;
