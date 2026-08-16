import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function FabricInspection() {
    const navigate = useNavigate();

    const [file, setFile] = useState(null);
    const [imagePreview, setImagePreview] = useState("");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        return () => {
            if (imagePreview) URL.revokeObjectURL(imagePreview);
        };
    }, [imagePreview]);

    const handleFileChange = (event) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;

        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setFile(selectedFile);
        setImagePreview(URL.createObjectURL(selectedFile));
    };

    const handleInspect = async () => {
        if (!file || loading) {
            if (!file) setError("Please upload a fabric image first.");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("supplier_id", "1");
            formData.append("shipment_id", "1");
            formData.append("roll_code", "R-01");

            const response = await axios.post(
                "http://localhost:8000/api/fabric/inspect",
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
        <div style={styles.page}>
            <div style={styles.panel}>
                <button style={styles.backButton} onClick={() => navigate("/")}>
                    ← Back
                </button>

                <div style={styles.eyebrow}>Fabric Quality</div>
                <h1>Fabric Inspection</h1>

                <div style={styles.uploadCard}>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={loading}
                        style={styles.fileInput}
                    />

                    {imagePreview && (
                        <img src={imagePreview} alt="Fabric preview" style={styles.preview} />
                    )}

                    {file && <p style={styles.filename}>Selected: {file.name}</p>}

                    <button
                        style={{
                            ...styles.inspectButton,
                            ...(loading ? styles.inspectButtonDisabled : {})
                        }}
                        onClick={handleInspect}
                        disabled={loading}
                    >
                        {loading ? "Running defect detection..." : "Run Fabric Inspection"}
                    </button>
                </div>

                {error && <div style={styles.error}>{error}</div>}

                {result && (
                    <div style={styles.resultCard}>
                        <h2>Inspection Result</h2>

                        <div style={styles.summaryRow}>
                            <span style={styles.badge}>Grade: {result.grade}</span>
                            <span style={styles.badge}>Status: {result.status}</span>
                        </div>

                        <div style={styles.metaGrid}>
                            <p><strong>Total defects:</strong> {result.total_defects_found}</p>
                            <p><strong>Total penalty points:</strong> {result.total_penalty_points}</p>
                            <p><strong>Points / 100 yards:</strong> {result.points_per_100_yards}</p>
                            <p><strong>Model:</strong> {result.model_version}</p>
                        </div>

                        {result.annotated_image && (
                            <div style={styles.annotatedImageWrapper}>
                                <img
                                    src={`data:image/png;base64,${result.annotated_image}`}
                                    alt="Fabric detection result"
                                    style={styles.annotatedImage}
                                />
                            </div>
                        )}

                        <h3>Detected defects</h3>
                        <ul style={styles.list}>
                            {result.detections?.map((d, index) => (
                                <li key={`${d.defect_type}-${index}`} style={styles.listItem}>
                                    <span style={styles.dot} />
                                    <span>
                                        {d.defect_type} — severity {d.severity}, confidence {d.confidence_score}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        padding: "32px",
        fontFamily: "Inter, Segoe UI, sans-serif",
    },

    panel: {
        maxWidth: "980px",
        margin: "0 auto",
        background: "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(15,23,42,0.9))",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "20px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        padding: "28px 32px 36px",
    },

    backButton: {
        padding: "10px 18px",
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: "10px",
        cursor: "pointer",
        fontSize: "15px",
        marginBottom: "18px",
        background: "rgba(15,23,42,0.8)",
        color: "#e2e8f0",
    },

    eyebrow: {
        display: "inline-block",
        padding: "6px 12px",
        borderRadius: "999px",
        backgroundColor: "rgba(96, 165, 250, 0.12)",
        color: "#bfdbfe",
        fontSize: "12px",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: "10px",
        border: "1px solid rgba(96, 165, 250, 0.3)",
    },

    uploadCard: {
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        padding: "24px",
        borderRadius: "16px",
        border: "1px solid rgba(148,163,184,0.2)",
        marginTop: "20px",
    },

    fileInput: {
        width: "100%",
        color: "#dbeafe",
        background: "rgba(15,23,42,0.8)",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "10px",
        padding: "12px 14px",
    },

    preview: {
        display: "block",
        marginTop: "20px",
        maxHeight: "320px",
        width: "100%",
        objectFit: "contain",
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.2)",
        backgroundColor: "rgba(15, 23, 42, 0.7)",
    },

    filename: {
        marginTop: "12px",
        fontSize: "14px",
        color: "#cbd5e1",
    },

    inspectButton: {
        marginTop: "24px",
        padding: "14px 26px",
        border: "none",
        borderRadius: "12px",
        cursor: "pointer",
        fontSize: "16px",
        fontWeight: 600,
        background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
        color: "#f5f3ff",
        boxShadow: "0 12px 24px rgba(124,58,237,0.35)",
    },

    inspectButtonDisabled: {
        opacity: 0.7,
        cursor: "not-allowed",
    },

    error: {
        maxWidth: "980px",
        margin: "20px auto 0",
        padding: "15px",
        borderRadius: "10px",
        backgroundColor: "rgba(239, 68, 68, 0.12)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        color: "#fecaca",
    },

    resultCard: {
        marginTop: "28px",
        background: "rgba(15, 23, 42, 0.76)",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "16px",
        padding: "24px",
    },

    summaryRow: {
        display: "flex",
        gap: "12px",
        flexWrap: "wrap",
        marginBottom: "16px",
    },

    badge: {
        backgroundColor: "rgba(59, 130, 246, 0.12)",
        border: "1px solid rgba(96,165,250,0.25)",
        color: "#dbeafe",
        padding: "8px 12px",
        borderRadius: "999px",
        fontWeight: "bold",
    },

    annotatedImageWrapper: {
        margin: "20px 0",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid rgba(148,163,184,0.2)",
        background: "rgba(15, 23, 42, 0.7)",
    },

    annotatedImage: {
        display: "block",
        width: "100%",
        maxHeight: "520px",
        objectFit: "contain",
    },

    metaGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "12px 16px",
        marginBottom: "12px",
    },

    list: {
        margin: "12px 0 0",
        paddingLeft: "0",
        listStyle: "none",
    },

    listItem: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 0",
        borderBottom: "1px solid rgba(148,163,184,0.12)",
        color: "#e2e8f0",
    },

    dot: {
        display: "inline-block",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        backgroundColor: "#8b5cf6",
    },
};

export default FabricInspection;
