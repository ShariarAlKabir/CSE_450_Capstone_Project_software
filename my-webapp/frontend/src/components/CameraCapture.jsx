import { useEffect, useRef, useState } from "react";
import axios from "axios";

import { API_BASE_URL } from "../config.js";
import Modal from "./Modal";

const PREVIEW_INTERVAL = 500;

const describeError = (error) => {
    switch (error?.name) {
        case "NotAllowedError":
        case "SecurityError":
            return "Camera permission was blocked. Allow camera access for this site and try again.";
        case "NotFoundError":
        case "OverconstrainedError":
            return "No camera was found on this device. Connect the camera and reopen the capture window.";
        case "NotReadableError":
            return "The camera is already in use by another application.";
        default:
            return "The camera could not be started on this device.";
    }
};

const hasLiveCamera = () =>
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

const fileStamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function CameraCapture({ onCapture, disabled = false, label = "Capture photo", hint }) {
    const [open, setOpen] = useState(false);
    const [checking, setChecking] = useState(false);
    const [pi, setPi] = useState(null);
    const [mode, setMode] = useState("device");
    const [preview, setPreview] = useState("");
    const [previewError, setPreviewError] = useState("");
    const [devices, setDevices] = useState([]);
    const [deviceId, setDeviceId] = useState("");
    const [frameFile, setFrameFile] = useState(null);
    const [frameUrl, setFrameUrl] = useState("");
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [fellBack, setFellBack] = useState(false);
    const videoRef = useRef(null);
    const fallbackRef = useRef(null);
    const frameUrlRef = useRef("");

    const live = hasLiveCamera();
    const piUsable = Boolean(pi?.reachable);

    useEffect(() => () => {
        if (frameUrlRef.current) {
            URL.revokeObjectURL(frameUrlRef.current);
        }
    }, []);

    useEffect(() => {
        if (!open || mode !== "device" || !live) {
            return undefined;
        }

        let cancelled = false;
        setError("");
        setReady(false);

        const start = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: deviceId
                        ? { deviceId: { exact: deviceId } }
                        : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });

                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    await video.play().catch(() => {});
                }
                setReady(true);

                const available = await navigator.mediaDevices.enumerateDevices();
                if (!cancelled) {
                    setDevices(available.filter((device) => device.kind === "videoinput"));
                }
            } catch (err) {
                if (!cancelled) {
                    setError(describeError(err));
                }
            }
        };

        start();

        return () => {
            cancelled = true;
            const video = videoRef.current;
            const stream = video?.srcObject;
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            if (video) {
                video.srcObject = null;
            }
        };
    }, [open, mode, deviceId, live]);

    useEffect(() => {
        if (!open || mode !== "pi" || !piUsable || frameFile) {
            return undefined;
        }

        let active = true;
        let objectUrl = "";

        const tick = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/camera/snapshot?t=${Date.now()}`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const blob = await response.blob();
                if (!active) {
                    return;
                }
                const next = URL.createObjectURL(blob);
                if (objectUrl) {
                    URL.revokeObjectURL(objectUrl);
                }
                objectUrl = next;
                setPreview(next);
                setPreviewError("");
            } catch {
                if (active) {
                    setPreviewError("Waiting for the Pi camera to respond…");
                }
            }
        };

        tick();
        const timer = window.setInterval(tick, PREVIEW_INTERVAL);

        return () => {
            active = false;
            window.clearInterval(timer);
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [open, mode, piUsable, frameFile]);

    const resetFrame = () => {
        if (frameUrlRef.current) {
            URL.revokeObjectURL(frameUrlRef.current);
            frameUrlRef.current = "";
        }
        setFrameUrl("");
        setFrameFile(null);
    };

    const stageFrame = (file) => {
        if (frameUrlRef.current) {
            URL.revokeObjectURL(frameUrlRef.current);
        }
        const url = URL.createObjectURL(file);
        frameUrlRef.current = url;
        setFrameUrl(url);
        setFrameFile(file);
    };

    const close = () => {
        setOpen(false);
        resetFrame();
        setError("");
        setPreviewError("");
    };

    const checkPi = async () => {
        try {
            const { data } = await axios.get(`${API_BASE_URL}/api/camera/status`, { timeout: 8000 });
            return data;
        } catch {
            return { configured: false, reachable: false, error: null };
        }
    };

    const handleOpen = async () => {
        if (checking) {
            return;
        }

        setError("");
        setPreviewError("");
        setPreview("");
        resetFrame();
        setChecking(true);
        const status = await checkPi();
        setChecking(false);
        setPi(status);

        if (status?.reachable) {
            setFellBack(false);
            setMode("pi");
            setOpen(true);
            return;
        }

        if (live) {
            setFellBack(false);
            setMode("device");
            setOpen(true);
            return;
        }

        if (status?.configured) {
            setFellBack(false);
            setMode("pi");
            setOpen(true);
            return;
        }

        setFellBack(true);
        fallbackRef.current?.click();
    };

    const retryPi = async () => {
        setChecking(true);
        setPreviewError("");
        const status = await checkPi();
        setPi(status);
        setChecking(false);
    };

    const captureDevice = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) {
            setError("The camera is still starting. Try again in a moment.");
            return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (blob) {
                stageFrame(new File([blob], `capture-${fileStamp()}.jpg`, { type: "image/jpeg" }));
                setError("");
            }
        }, "image/jpeg", 0.92);
    };

    const capturePi = async () => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/api/camera/snapshot?t=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const blob = await response.blob();
            stageFrame(new File([blob], `pi-capture-${fileStamp()}.jpg`, { type: blob.type || "image/jpeg" }));
        } catch {
            setError("Could not capture from the Pi camera. Check that the Pi is online and streaming.");
        } finally {
            setBusy(false);
        }
    };

    const usePhoto = () => {
        if (!frameFile) {
            return;
        }
        onCapture?.(frameFile);
        close();
    };

    const buttonLabel = checking ? "Looking for camera…" : label;

    return (
        <>
            <div className="capture-source">
                <button type="button" className="button button-quiet" onClick={handleOpen} disabled={disabled || checking}>
                    {buttonLabel}
                </button>
                {hint && <span className="capture-hint">{hint}</span>}
                {fellBack && (
                    <span className="capture-hint">
                        No live camera was found. Opened the device picker instead — live preview needs HTTPS, or configure the Pi camera.
                    </span>
                )}
                <input
                    ref={fallbackRef}
                    className="capture-fallback"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                            onCapture?.(file);
                        }
                        event.target.value = "";
                    }}
                    disabled={disabled}
                    tabIndex={-1}
                    aria-hidden="true"
                />
            </div>

            {open && (
                <Modal eyebrow="Camera capture" title="Capture the sample" onCancel={close}>
                    <div className="capture-modal">
                        {piUsable && live && (
                            <div className="capture-modes">
                                <button type="button" className={mode === "pi" ? "is-active" : ""} onClick={() => { resetFrame(); setMode("pi"); }}>Pi camera</button>
                                <button type="button" className={mode === "device" ? "is-active" : ""} onClick={() => { resetFrame(); setMode("device"); }}>This device</button>
                            </div>
                        )}

                        <div className="capture-stage">
                            {mode === "pi" ? (
                                <>
                                    {frameUrl
                                        ? <img className="capture-still" src={frameUrl} alt="Captured sample" />
                                        : preview
                                            ? <img className="capture-video" src={preview} alt="Pi camera preview" />
                                            : <span className="capture-placeholder">Connecting to the Pi camera…</span>}
                                    {mode === "pi" && !frameUrl && preview && <span className="capture-live">Live</span>}
                                </>
                            ) : (
                                <>
                                    <video ref={videoRef} className="capture-video" playsInline muted autoPlay />
                                    {frameUrl && <img className="capture-still" src={frameUrl} alt="Captured sample" />}
                                </>
                            )}
                        </div>

                        {previewError && <p className="capture-hint">{previewError}</p>}
                        {error && <div className="status-banner status-banner--error">{error}</div>}
                        {mode === "device" && !frameUrl && !error && !ready && <p className="capture-hint">Starting the camera…</p>}

                        {mode === "device" && !frameUrl && devices.length > 1 && (
                            <label className="select-control">Camera
                                <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
                                    {devices.map((device, index) => (
                                        <option key={device.deviceId} value={device.deviceId}>
                                            {device.label || `Camera ${index + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <div className="capture-toolbar">
                            {frameFile ? (
                                <>
                                    <button type="button" className="button button-quiet" onClick={() => { resetFrame(); setError(""); }}>Retake</button>
                                    <button type="button" className="button button-primary" onClick={usePhoto}>Use this photo</button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="button button-primary"
                                        onClick={mode === "pi" ? capturePi : captureDevice}
                                        disabled={busy || (mode === "device" ? (!ready || Boolean(error)) : !piUsable)}
                                    >
                                        {busy ? "Capturing…" : "Capture"}
                                    </button>
                                    {mode === "pi" && !piUsable && (
                                        <button type="button" className="button button-quiet" onClick={retryPi} disabled={checking}>
                                            {checking ? "Checking…" : "Retry"}
                                        </button>
                                    )}
                                    <button type="button" className="button button-quiet" onClick={close}>Cancel</button>
                                </>
                            )}
                            <span className="capture-hint capture-toolbar__spacer">Cameras attached to this device or a Pi on the network appear here.</span>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}

export default CameraCapture;
