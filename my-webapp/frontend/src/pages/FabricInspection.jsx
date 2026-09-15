import { useEffect, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import AppShell from "../components/AppShell";
import CameraCapture from "../components/CameraCapture";

function FabricInspection() {
    const [file, setFile] = useState(null);
    const [imagePreview, setImagePreview] = useState("");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [shipments, setShipments] = useState([]);
    const [shipmentId, setShipmentId] = useState("");
    const [rollLength, setRollLength] = useState("");

    // The roll has to be picked, not assumed: points per 100 yards is a rate,
    // so grading without a real length (and a real shipment to file it under)
    // would produce a grade that means nothing. This page used to post
    // supplier_id=1, shipment_id=1, roll_code="R-01" for every upload.
    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/fabric/shipments`)
            .then((response) => {
                const rows = response.data?.shipments || [];
                setShipments(rows);
                if (rows.length) setShipmentId(String(rows[0].shipment_id));
            })
            .catch(() => setShipments([]));
    }, []);

    useEffect(() => {
        return () => {
            if (imagePreview) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    const applyFile = (selectedFile) => {
        if (!selectedFile) {
            return;
        }
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }

        setFile(selectedFile);
        setImagePreview(URL.createObjectURL(selectedFile));
        setResult(null);
        setError("");
    };

    const handleFileChange = (event) => applyFile(event.target.files?.[0]);

    const handleInspect = async () => {
        if (!file || loading) {
            if (!file) {
                setError("Please upload a fabric image first.");
            }

            return;
        }
        if (!shipmentId) {
            setError("Select the shipment this roll belongs to.");
            return;
        }
        if (!Number(rollLength) || Number(rollLength) <= 0) {
            setError("Enter the roll length in yards so the four-point score can be calculated.");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const shipment = shipments.find((row) => String(row.shipment_id) === String(shipmentId));
            const formData = new FormData();

            formData.append("file", file);
            formData.append("supplier_id", String(shipment?.supplier_id ?? ""));
            formData.append("shipment_id", String(shipmentId));
            formData.append("roll_code", `${shipment?.shipment_code || "ROLL"}-ADHOC`);
            formData.append("roll_length_yards", String(rollLength));

            const response = await axios.post(
                `${API_BASE_URL}/api/fabric/inspect`,
                formData,
                {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                }
            );

            setResult(response.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || "Fabric inspection failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppShell
            accent="slate"
            eyebrow="Fabric Quality"
            title="Fabric inspection with fast visual defect review"
            description="Upload a fabric image to generate a graded inspection summary, annotated defect view, and defect-level detail for operators."
            backTo="/"
            backLabel="Back to dashboard"
            aside={
                <div className="hero-note">
                    <div className="section-label">Workflow</div>
                    <p>
                        Designed for intake review. Operators upload a roll
                        image, run detection, and get both an at-a-glance grade
                        and a visual output they can verify quickly.
                    </p>
                </div>
            }
        >
            <section className="section-grid section-grid--two">
                <article className="panel-card">
                    <div className="section-label">Upload image</div>
                    <h2>Prepare a fabric image for inspection</h2>
                    <p>
                        Use a clear fabric capture. Once uploaded, the preview
                        stays visible so the operator can confirm the right file
                        before running the model.
                    </p>

                    <label className="upload-dropzone">
                        <span className="upload-dropzone__title">
                            Select fabric image
                        </span>

                        <span className="upload-dropzone__text">
                            JPG, PNG, or similar image formats
                        </span>

                        <input
                            className="file-input"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            disabled={loading}
                        />
                    </label>

                    <CameraCapture
                        onCapture={applyFile}
                        disabled={loading}
                        label="Capture fabric photo"
                        hint="Use a connected or Raspberry Pi camera to shoot the roll directly."
                    />

                    {file && (
                        <div className="file-meta">
                            <span className="status-pill status-pill--neutral">
                                File ready
                            </span>
                            <span>{file.name}</span>
                        </div>
                    )}

                    <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                        <label className="select-control">
                            Shipment
                            <select
                                value={shipmentId}
                                onChange={(event) => setShipmentId(event.target.value)}
                                disabled={loading || !shipments.length}
                            >
                                {!shipments.length && <option value="">No shipments on record</option>}
                                {shipments.map((row) => (
                                    <option key={row.shipment_id} value={row.shipment_id}>
                                        {row.shipment_code} · {row.supplier} · {row.fabric_type}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="select-control">
                            Roll length (yards)
                            <input
                                type="number"
                                min="1"
                                step="0.01"
                                value={rollLength}
                                onChange={(event) => setRollLength(event.target.value)}
                                placeholder="e.g. 92.5"
                                disabled={loading}
                            />
                        </label>
                        <small style={{ color: "var(--muted)", fontSize: "0.68rem" }}>
                            The four-point score is penalty points per 100 yards, so the grade
                            depends on the real length of the roll being inspected.
                        </small>
                    </div>

                    <button
                        className="button button-primary"
                        onClick={handleInspect}
                        disabled={loading}
                    >
                        {loading
                            ? "Running defect detection..."
                            : "Run fabric inspection"}
                    </button>
                </article>

                <article className="panel-card panel-card--contrast">
                    <div className="section-label">Preview</div>
                    <div className="preview-frame preview-frame--large">
                        {imagePreview ? (
                            <img
                                src={imagePreview}
                                alt="Fabric preview"
                                className="preview-image"
                            />
                        ) : (
                            <div className="empty-state">
                                <strong>No image selected yet</strong>
                                <span>
                                    Your uploaded fabric image will appear here.
                                </span>
                            </div>
                        )}
                    </div>
                </article>
            </section>

            {error && (
                <div className="status-banner status-banner--error">
                    {error}
                </div>
            )}

            {result && (
                <section className="results-stack">
                    <article className="panel-card panel-card--elevated">
                        <div className="section-label">Inspection result</div>
                        <div className="badge-row">
                            <span className="status-pill status-pill--accent">
                                Grade {result.grade}
                            </span>

                            <span className="status-pill status-pill--neutral">
                                {result.status}
                            </span>
                        </div>

                        <div className="metric-grid">
                            <div className="metric-card">
                                <span className="metric-card__label">
                                    Total defects
                                </span>
                                <strong>{result.total_defects_found}</strong>
                            </div>

                            <div className="metric-card">
                                <span className="metric-card__label">
                                    Penalty points
                                </span>
                                <strong>{result.total_penalty_points}</strong>
                            </div>

                            <div className="metric-card">
                                <span className="metric-card__label">
                                    Points / 100 yards
                                </span>
                                <strong>{result.points_per_100_yards}</strong>
                            </div>

                            <div className="metric-card">
                                <span className="metric-card__label">
                                    Quality score
                                </span>
                                <strong>{result.quality_score}<small>/100</small></strong>
                            </div>

                            <div className="metric-card">
                                <span className="metric-card__label">
                                    Model version
                                </span>
                                <strong>{result.model_version}</strong>
                            </div>
                        </div>
                    </article>

                    {result.annotated_image && (
                        <article className="panel-card panel-card--contrast">
                            <div className="section-label">Annotated output</div>
                            <div className="preview-frame preview-frame--large">
                                <img
                                    src={`data:image/png;base64,${result.annotated_image}`}
                                    alt="Fabric detection result"
                                    className="preview-image"
                                />
                            </div>
                        </article>
                    )}

                    <article className="panel-card">
                        <div className="section-label">Detected defects</div>
                        {result.detections?.length ? (
                            <ul className="result-list">
                                {result.detections.map((detection, index) => (
                                    <li
                                        key={`${detection.defect_type}-${index}`}
                                        className="result-list__item"
                                    >
                                        <div>
                                            <strong>{detection.defect_type}</strong>
                                            <p>
                                                Severity {detection.severity}
                                            </p>
                                        </div>

                                        <span className="status-pill status-pill--neutral">
                                            Confidence {detection.confidence_score}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="empty-state empty-state--compact">
                                <strong>No defects returned</strong>
                                <span>
                                    The backend did not include any individual
                                    detections for this inspection.
                                </span>
                            </div>
                        )}
                    </article>
                </section>
            )}
        </AppShell>
    );
}

export default FabricInspection;
