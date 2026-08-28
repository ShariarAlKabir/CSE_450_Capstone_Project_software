import { useState } from "react";
import axios from "axios";

import AppShell from "../components/AppShell";

function NonDeterministic() {
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
        } catch (requestError) {
            console.error(requestError);
            setError("Could not connect to the backend.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppShell
            accent="blue"
            eyebrow="Assisted Review"
            title="Non-deterministic inspection workspace"
            description="Use this path when the label workflow depends on backend-driven logic rather than a fixed comparison pipeline."
            backTo="/label-inspection"
            backLabel="Back to label modes"
            aside={
                <div className="hero-note">
                    <div className="section-label">Intended use</div>
                    <p>
                        This screen is positioned as a secondary workflow, with
                        room for future model prompts, guided analysis, or
                        operator-led review states.
                    </p>
                </div>
            }
        >
            <section className="section-grid section-grid--two">
                <article className="panel-card">
                    <div className="section-label">Workflow trigger</div>
                    <h2>Request a backend response</h2>
                    <p>
                        The current implementation validates connectivity with
                        the Python service. The interface is now structured to
                        support richer analysis outputs later.
                    </p>

                    <button
                        className="button button-primary"
                        onClick={callBackend}
                        disabled={loading}
                    >
                        {loading ? "Contacting backend..." : "Run backend action"}
                    </button>
                </article>

                <article className="panel-card panel-card--contrast">
                    <div className="section-label">Live response</div>

                    {message ? (
                        <div className="status-banner status-banner--success">
                            Backend response: {message}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <strong>No response yet</strong>
                            <span>
                                Trigger the workflow to show the current backend
                                message here.
                            </span>
                        </div>
                    )}

                    {error && (
                        <div className="status-banner status-banner--error">
                            {error}
                        </div>
                    )}
                </article>
            </section>
        </AppShell>
    );
}

export default NonDeterministic;
