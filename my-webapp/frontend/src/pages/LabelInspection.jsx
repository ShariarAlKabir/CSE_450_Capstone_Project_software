import { useNavigate } from "react-router-dom";

function LabelInspection() {
    const navigate = useNavigate();

    return (
        <div style={styles.container}>
            <div style={styles.panel}>
                <button
                    style={styles.backButton}
                    onClick={() => navigate("/")}
                >
                    ← Back
                </button>

                <div style={styles.eyebrow}>Label Workflow</div>
                <h1>Label Inspection</h1>

                <p style={styles.subtitle}>Choose the inspection mode.</p>

                <div style={styles.buttonContainer}>
                    <button
                        style={styles.buttonPrimary}
                        onClick={() => navigate("/deterministic")}
                    >
                        Deterministic
                    </button>

                    <button
                        style={styles.buttonSecondary}
                        onClick={() => navigate("/non-deterministic")}
                    >
                        Non-Deterministic
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "32px",
        fontFamily: "Inter, Segoe UI, sans-serif",
    },

    panel: {
        width: "100%",
        maxWidth: "760px",
        background: "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(15,23,42,0.9))",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "20px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        padding: "28px 32px 36px",
    },

    backButton: {
        marginBottom: "18px",
        padding: "10px 18px",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "10px",
        cursor: "pointer",
        fontSize: "15px",
        background: "rgba(15,23,42,0.8)",
        color: "#e2e8f0",
    },

    eyebrow: {
        display: "inline-block",
        padding: "6px 12px",
        borderRadius: "999px",
        backgroundColor: "rgba(52, 211, 153, 0.12)",
        color: "#a7f3d0",
        fontSize: "12px",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: "12px",
        border: "1px solid rgba(52, 211, 153, 0.35)",
    },

    subtitle: {
        marginBottom: "30px",
        fontSize: "18px",
        color: "#cbd5e1",
    },

    buttonContainer: {
        display: "flex",
        gap: "20px",
        flexWrap: "wrap",
        justifyContent: "center",
    },

    buttonPrimary: {
        padding: "18px 28px",
        fontSize: "18px",
        cursor: "pointer",
        borderRadius: "12px",
        border: "1px solid rgba(52, 211, 153, 0.45)",
        background: "linear-gradient(135deg, #10b981, #059669)",
        color: "white",
        fontWeight: 600,
        boxShadow: "0 12px 32px rgba(16, 185, 129, 0.25)",
    },

    buttonSecondary: {
        padding: "18px 28px",
        fontSize: "18px",
        cursor: "pointer",
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.25)",
        background: "rgba(15, 23, 42, 0.75)",
        color: "#e2e8f0",
        fontWeight: 600,
    },
};

export default LabelInspection;
