import { useNavigate } from "react-router-dom";

function Home() {
    const navigate = useNavigate();

    return (
        <div style={styles.container}>
            <div style={styles.panel}>
                <div style={styles.eyebrow}>Quality Control System</div>
                <h1>Inspection Dashboard</h1>
                <p style={styles.subtitle}>Choose a category to continue.</p>

                <div style={styles.buttonContainer}>
                    <button
                        style={styles.buttonPrimary}
                        onClick={() => navigate("/fabric-inspection")}
                    >
                        Fabric Inspection
                    </button>

                    <button
                        style={styles.buttonSecondary}
                        onClick={() => navigate("/label-inspection")}
                    >
                        Label Inspection
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
        background: "linear-gradient(180deg, rgba(17,24,39,0.95), rgba(15,23,42,0.9))",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "20px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        padding: "40px 32px",
        textAlign: "center",
    },

    eyebrow: {
        display: "inline-block",
        padding: "6px 12px",
        borderRadius: "999px",
        backgroundColor: "rgba(139, 92, 246, 0.15)",
        color: "#c4b5fd",
        fontSize: "12px",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: "18px",
        border: "1px solid rgba(139, 92, 246, 0.35)",
    },

    subtitle: {
        fontSize: "18px",
        marginBottom: "32px",
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
        border: "1px solid rgba(139, 92, 246, 0.5)",
        background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
        color: "white",
        fontWeight: 600,
        boxShadow: "0 12px 36px rgba(124, 58, 237, 0.38)",
    },

    buttonSecondary: {
        padding: "18px 28px",
        fontSize: "18px",
        cursor: "pointer",
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.25)",
        background: "rgba(15, 23, 42, 0.7)",
        color: "#e2e8f0",
        fontWeight: 600,
    },
};

export default Home;
