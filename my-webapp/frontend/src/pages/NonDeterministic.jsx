import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

function NonDeterministic() {
    const navigate = useNavigate();

    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const callBackend = async () => {
        try {
            setLoading(true);
            setError("");

            const response = await axios.get(
                "http://localhost:8000/api/non-deterministic"
            );

            setMessage(response.data.message);
        } catch (error) {
            console.error(error);
            setError("Could not connect to the backend.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <h1>Non-Deterministic Approach</h1>

            <p>
                This is the non-deterministic page.
            </p>

            <button
                style={styles.button}
                onClick={callBackend}
                disabled={loading}
            >
                {loading ? "Loading..." : "Call Python Backend"}
            </button>

            {message && (
                <p style={styles.message}>
                    Backend response: {message}
                </p>
            )}

            {error && (
                <p style={styles.error}>
                    {error}
                </p>
            )}

            <button
                style={styles.backButton}
                onClick={() => navigate("/")}
            >
                Back to Home
            </button>
        </div>
    );
}

const styles = {
    container: {
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, Segoe UI, sans-serif",
        background: "radial-gradient(circle at top, rgba(59,130,246,0.12), transparent 30%), linear-gradient(180deg, #070b14, #0b1020 45%, #0e1528)",
        color: "#e2e8f0",
        padding: "32px",
    },

    button: {
        padding: "14px 24px",
        fontSize: "16px",
        cursor: "pointer",
        borderRadius: "10px",
        border: "1px solid rgba(96, 165, 250, 0.32)",
        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
        color: "white",
        fontWeight: 600,
    },

    backButton: {
        padding: "12px 24px",
        fontSize: "16px",
        cursor: "pointer",
        borderRadius: "10px",
        border: "1px solid rgba(148,163,184,0.2)",
        background: "rgba(15,23,42,0.75)",
        color: "#e2e8f0",
        marginTop: "20px",
    },

    message: {
        marginTop: "20px",
        fontSize: "18px",
        color: "#dbeafe",
    },

    error: {
        marginTop: "20px",
        fontSize: "18px",
        color: "#fecaca",
    },
};

export default NonDeterministic;