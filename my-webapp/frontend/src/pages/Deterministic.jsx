import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function Deterministic() {
    const navigate = useNavigate();

    const [golden, setGolden] = useState(null);
    const [candidate, setCandidate] = useState(null);
    const [goldenPreview, setGoldenPreview] = useState("");
    const [candidatePreview, setCandidatePreview] = useState("");

    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        return () => {
            if (goldenPreview) URL.revokeObjectURL(goldenPreview);
            if (candidatePreview) URL.revokeObjectURL(candidatePreview);
        };
    }, [goldenPreview, candidatePreview]);

    const handleFileChange = (event, type) => {
        const file = event.target.files?.[0];

        if (!file) return;

        const previewUrl = URL.createObjectURL(file);

        if (type === "golden") {
            setGolden(file);
            setGoldenPreview(previewUrl);
        } else {
            setCandidate(file);
            setCandidatePreview(previewUrl);
        }
    };

    const handleInspect = async () => {
        if (!golden || !candidate) {
            setError(
                "Please select both a golden image and a candidate image."
            );

            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const formData = new FormData();

            formData.append(
                "golden",
                golden
            );

            formData.append(
                "candidate",
                candidate
            );

            const response = await axios.post(
                "http://localhost:8000/api/deterministic/inspect",
                formData,
                {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                }
            );

            setResult(response.data);

        } catch (error) {

            console.error(error);

            if (error.response) {

                setError(
                    error.response.data.detail ||
                    "Inspection failed."
                );

            } else {

                setError(
                    "Could not connect to the backend."
                );
            }

        } finally {

            setLoading(false);
        }
    };


    return (
        <div style={styles.page}>

            {/* -------------------------------- */}
            {/* Header */}
            {/* -------------------------------- */}

            <div style={styles.header}>

                <button
                    style={styles.backButton}
                    onClick={() => navigate("/")}
                >
                    ← Back
                </button>

                <h1>
                    Deterministic Label Inspection
                </h1>

                <p>
                    Upload a golden reference image and
                    a candidate image to inspect the label.
                </p>

            </div>


            {/* -------------------------------- */}
            {/* Upload Section */}
            {/* -------------------------------- */}

            <div style={styles.uploadContainer}>

                {/* Golden */}

                <div style={styles.uploadBox}>

                    <h2>
                        Golden Reference
                    </h2>

                    <p>
                        Upload the approved label image.
                    </p>

                    <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleFileChange(event, "golden")}
                    />

                    {goldenPreview && (
                        <img
                            src={goldenPreview}
                            alt="Golden preview"
                            style={styles.previewImage}
                        />
                    )}

                    {golden && (
                        <p style={styles.filename}>
                            Selected: {golden.name}
                        </p>
                    )}

                </div>


                {/* Candidate */}

                <div style={styles.uploadBox}>

                    <h2>
                        Candidate
                    </h2>

                    <p>
                        Upload the label you want to inspect.
                    </p>

                    <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleFileChange(event, "candidate")}
                    />

                    {candidatePreview && (
                        <img
                            src={candidatePreview}
                            alt="Candidate preview"
                            style={styles.previewImage}
                        />
                    )}

                    {candidate && (
                        <p style={styles.filename}>
                            Selected: {candidate.name}
                        </p>
                    )}

                </div>

            </div>


            {/* -------------------------------- */}
            {/* Inspect Button */}
            {/* -------------------------------- */}

            <button
                style={styles.inspectButton}
                onClick={handleInspect}
                disabled={loading}
            >

                {loading
                    ? "Inspecting..."
                    : "Run Inspection"
                }

            </button>


            {/* -------------------------------- */}
            {/* Error */}
            {/* -------------------------------- */}

            {error && (

                <div style={styles.error}>
                    {error}
                </div>

            )}


            {/* -------------------------------- */}
            {/* Result */}
            {/* -------------------------------- */}

            {result && (

                <div style={styles.resultContainer}>

                    <h2>
                        Inspection Result
                    </h2>


                    {/* Verdict */}

                    <div
                        style={{
                            ...styles.verdict,
                            ...(String(result.verdict).toLowerCase().includes("reject")
                                ? styles.reject
                                : styles.accept),
                        }}
                    >

                        {result.verdict}

                    </div>


                    {/* Summary */}

                    <div style={styles.card}>

                        <h3>
                            Summary
                        </h3>

                        <pre style={styles.summary}>
                            {result.summary}
                        </pre>

                    </div>


                    {/* Gate 1 */}

                    <div style={styles.card}>

                        <h3>
                            Gate 1 — Structural Inspection
                        </h3>

                        <p>
                            Skew angle:{" "}
                            {result.gate1.angle_deg !== null
                                ? `${result.gate1.angle_deg.toFixed(2)}°`
                                : "N/A"
                            }
                        </p>

                    </div>


                    {/* Gate 2 */}

                    {result.gate2 && (

                        <div style={styles.card}>

                            <h3>
                                Gate 2 — Visual Inspection
                            </h3>

                            <p>
                                SSIM Score:{" "}
                                {result.gate2.ssim_score.toFixed(3)}
                            </p>

                            <p>
                                Hotspots:{" "}
                                {result.gate2.hotspot_count}
                            </p>

                        </div>

                    )}


                    {/* Target size */}

                    <div style={styles.card}>

                        <h3>
                            Target Size
                        </h3>

                        <p>
                            Width:{" "}
                            {result.target_size.width}px
                        </p>

                        <p>
                            Height:{" "}
                            {result.target_size.height}px
                        </p>

                    </div>


                    {/* Visualization */}

                    <div style={styles.visualization}>

                        <h2>
                            Diagnostic Visualization
                        </h2>

                        <img
                            src={`http://localhost:8000${result.visualization_url}`}
                            alt="Inspection diagnostic visualization"
                            style={styles.reportImage}
                        />

                    </div>

                </div>

            )}

        </div>
    );
}


/* ================================================ */
/* Styles                                           */
/* ================================================ */

const styles = {

    page: {
        minHeight: "100vh",
        padding: "40px",
        fontFamily: "Inter, Segoe UI, sans-serif",
        background: "radial-gradient(circle at top, rgba(139, 92, 246, 0.13), transparent 30%), linear-gradient(180deg, #070b14, #0b1020 42%, #0e1528)",
        boxSizing: "border-box",
        color: "#e2e8f0",
    },

    header: {
        maxWidth: "1100px",
        margin: "0 auto 40px auto",
    },

    backButton: {
        padding: "10px 18px",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "10px",
        cursor: "pointer",
        fontSize: "15px",
        background: "rgba(15,23,42,0.8)",
        color: "#e2e8f0",
    },

    uploadContainer: {
        maxWidth: "1100px",
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "25px",
    },

    uploadBox: {
        background: "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(15,23,42,0.9))",
        padding: "30px",
        borderRadius: "16px",
        border: "1px solid rgba(148,163,184,0.2)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
    },

    filename: {
        marginTop: "15px",
        fontSize: "14px",
        color: "#cbd5e1",
    },

    previewImage: {
        display: "block",
        width: "100%",
        maxHeight: "260px",
        objectFit: "contain",
        marginTop: "18px",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "10px",
        backgroundColor: "rgba(15, 23, 42, 0.7)",
    },

    inspectButton: {
        display: "block",
        margin: "30px auto",
        padding: "15px 35px",
        border: "none",
        borderRadius: "12px",
        cursor: "pointer",
        fontSize: "18px",
        fontWeight: 600,
        background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
        color: "white",
        boxShadow: "0 12px 30px rgba(124,58,237,0.35)",
    },

    error: {
        maxWidth: "1100px",
        margin: "20px auto",
        padding: "15px",
        borderRadius: "10px",
        backgroundColor: "rgba(239, 68, 68, 0.12)",
        border: "1px solid rgba(239, 68, 68, 0.32)",
        color: "#fecaca",
    },

    resultContainer: {
        maxWidth: "1100px",
        margin: "40px auto",
    },

    verdict: {
        display: "inline-block",
        padding: "15px 30px",
        borderRadius: "10px",
        fontSize: "22px",
        fontWeight: "bold",
        marginBottom: "25px",
        border: "1px solid transparent",
    },

    accept: {
        backgroundColor: "rgba(16, 185, 129, 0.15)",
        borderColor: "rgba(52, 211, 153, 0.26)",
        color: "#a7f3d0",
    },

    reject: {
        backgroundColor: "rgba(239, 68, 68, 0.12)",
        borderColor: "rgba(248, 113, 113, 0.28)",
        color: "#fecaca",
    },

    card: {
        background: "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(15,23,42,0.9))",
        padding: "25px",
        marginBottom: "20px",
        borderRadius: "16px",
        border: "1px solid rgba(148,163,184,0.18)",
        boxShadow: "0 16px 32px rgba(0,0,0,0.15)",
    },

    summary: {
        whiteSpace: "pre-wrap",
        fontFamily: "SFMono-Regular, Consolas, monospace",
        color: "#dbeafe",
    },

    visualization: {
        background: "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(15,23,42,0.9))",
        padding: "25px",
        borderRadius: "16px",
        marginTop: "30px",
        border: "1px solid rgba(148,163,184,0.18)",
    },

    reportImage: {
        width: "100%",
        maxWidth: "1000px",
        display: "block",
        margin: "20px auto",
    },
};

export default Deterministic;