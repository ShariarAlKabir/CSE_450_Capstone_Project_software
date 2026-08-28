import { Link } from "react-router-dom";

import AppShell from "../components/AppShell";

const inspectionModes = [
    {
        title: "Deterministic Inspection",
        description:
            "Compare a golden reference with a candidate label using structured gates and a visual diagnostic output.",
        to: "/deterministic",
        tone: "primary",
    },
    {
        title: "Non-Deterministic Review",
        description:
            "Use the assisted review path when the workflow depends on backend-driven or exploratory logic.",
        to: "/non-deterministic",
        tone: "secondary",
    },
];

function LabelInspection() {
    return (
        <AppShell
            accent="amber"
            eyebrow="Label Workflow"
            title="Choose the right label inspection mode"
            description="Separate routine comparison work from exploratory review so operators can pick the right process immediately."
            backTo="/"
            backLabel="Back to dashboard"
            aside={
                <div className="hero-note">
                    <div className="section-label">Why this split works</div>
                    <p>
                        Deterministic review is ideal for repeatable checks.
                        The secondary flow gives you room for backend-assisted
                        analysis when the path is less rigid.
                    </p>
                </div>
            }
        >
            <section className="panel-card panel-card--elevated">
                <div className="section-label">Inspection modes</div>
                <div className="choice-grid choice-grid--wide">
                    {inspectionModes.map((mode) => (
                        <Link
                            key={mode.title}
                            className={`choice-card choice-card--${mode.tone}`}
                            to={mode.to}
                        >
                            <span className="choice-card__eyebrow">
                                Select mode
                            </span>

                            <h3>{mode.title}</h3>
                            <p>{mode.description}</p>

                            <span className="choice-card__cta">
                                Open inspection
                            </span>
                        </Link>
                    ))}
                </div>
            </section>
        </AppShell>
    );
}

export default LabelInspection;
