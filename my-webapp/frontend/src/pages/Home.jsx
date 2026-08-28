import { Link } from "react-router-dom";

import AppShell from "../components/AppShell";

const workflows = [
    {
        title: "Fabric Inspection",
        description:
            "Run defect detection on incoming rolls with annotated outputs, grading, and penalty summaries.",
        to: "/fabric-inspection",
        tone: "primary",
    },
    {
        title: "Label Inspection",
        description:
            "Validate packaging labels through deterministic and assisted review workflows.",
        to: "/label-inspection",
        tone: "secondary",
    },
];

const operationalSignals = [
    "Standardized review paths for fabric and label quality teams",
    "Clear upload, result, and verdict states across all workflows",
    "Designed for operators, supervisors, and audit reporting",
];

function Home() {
    return (
        <AppShell
            accent="teal"
            eyebrow="Quality Control Operations"
            title="Inspection dashboard for textile production teams"
            description="A single workspace for fabric defect review and label validation, redesigned to feel trustworthy, sharp, and production-ready."
            aside={
                <div className="hero-metrics">
                    <div className="hero-metric">
                        <span className="hero-metric__value">02</span>
                        <span className="hero-metric__label">Core workflows</span>
                    </div>

                    <div className="hero-metric">
                        <span className="hero-metric__value">Fast</span>
                        <span className="hero-metric__label">Operator handoff</span>
                    </div>

                    <div className="hero-metric">
                        <span className="hero-metric__value">Clear</span>
                        <span className="hero-metric__label">Decision visibility</span>
                    </div>
                </div>
            }
        >
            <section className="section-grid section-grid--two">
                <article className="panel-card">
                    <div className="section-label">Platform overview</div>
                    <h2>Built for inspection teams that need confidence, not clutter.</h2>
                    <p>
                        Every screen now follows the same visual language, so
                        operators can move from intake to decision without
                        re-learning the interface each time.
                    </p>

                    <ul className="feature-list">
                        {operationalSignals.map((signal) => (
                            <li key={signal}>{signal}</li>
                        ))}
                    </ul>
                </article>

                <article className="panel-card panel-card--elevated">
                    <div className="section-label">Available workflows</div>
                    <div className="choice-grid">
                        {workflows.map((workflow) => (
                            <Link
                                key={workflow.title}
                                className={`choice-card choice-card--${workflow.tone}`}
                                to={workflow.to}
                            >
                                <span className="choice-card__eyebrow">
                                    Open workflow
                                </span>

                                <h3>{workflow.title}</h3>
                                <p>{workflow.description}</p>

                                <span className="choice-card__cta">
                                    Continue
                                </span>
                            </Link>
                        ))}
                    </div>
                </article>
            </section>
        </AppShell>
    );
}

export default Home;
