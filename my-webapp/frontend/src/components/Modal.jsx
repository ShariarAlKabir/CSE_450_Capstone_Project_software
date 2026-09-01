import { useEffect } from "react";

function Modal({ eyebrow, title, onCancel, children }) {
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                onCancel();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onCancel]);

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
            <section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <span className="section-label">{eyebrow}</span>
                <h2 id="modal-title">{title}</h2>
                {children}
            </section>
        </div>
    );
}

export default Modal;
