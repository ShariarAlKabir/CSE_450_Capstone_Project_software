"""Proxy for a Raspberry Pi camera exposed over the local network.

The Pi runs a small MJPEG server (see pi/camera_server.py). Browsers cannot
consume that stream directly when the web app is served over HTTPS (mixed
content) and would also need CORS on the Pi, so the backend relays both the
live stream and single snapshots on behalf of the frontend.

Set these environment variables before starting the backend:

    CAMERA_STREAM_URL=http://<pi-address>:8081/stream.mjpg
    CAMERA_SNAPSHOT_URL=http://<pi-address>:8081/snapshot.jpg   # optional
"""

import os
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

router = APIRouter(prefix="/api/camera", tags=["camera"])

TIMEOUT = float(os.getenv("CAMERA_TIMEOUT", "6"))


def _stream_url() -> str:
    return os.getenv("CAMERA_STREAM_URL", "").strip()


def _snapshot_url() -> str:
    explicit = os.getenv("CAMERA_SNAPSHOT_URL", "").strip()
    if explicit:
        return explicit

    stream = _stream_url()
    if not stream:
        return ""

    base = stream.rsplit("/", 1)[0]
    return f"{base}/snapshot.jpg"


def _open(url: str):
    try:
        return urllib.request.urlopen(url, timeout=TIMEOUT)
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"Camera returned HTTP {error.code}.") from error
    except Exception as error:  # noqa: BLE001 - surfaced to the operator
        raise HTTPException(status_code=502, detail=f"Camera unavailable: {error}") from error


@router.get("/status")
def camera_status():
    """Tell the frontend whether a Pi camera is configured and responding."""
    stream = _stream_url()
    snapshot = _snapshot_url()

    if not stream or not snapshot:
        return {
            "configured": False,
            "reachable": False,
            "snapshot_url": snapshot,
            "error": "Set CAMERA_STREAM_URL on the backend to enable the Pi camera.",
        }

    try:
        with urllib.request.urlopen(snapshot, timeout=3) as response:
            response.read(64)
        return {"configured": True, "reachable": True, "snapshot_url": snapshot, "error": None}
    except Exception as error:  # noqa: BLE001
        return {"configured": True, "reachable": False, "snapshot_url": snapshot, "error": str(error)}


@router.get("/snapshot")
def camera_snapshot():
    """Return a single frame from the Pi camera as JPEG bytes."""
    snapshot = _snapshot_url()
    if not snapshot:
        raise HTTPException(status_code=503, detail="Pi camera is not configured.")

    with _open(snapshot) as upstream:
        payload = upstream.read()
        content_type = upstream.headers.get("Content-Type", "image/jpeg")

    return Response(
        content=payload,
        media_type=content_type,
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.get("/stream")
def camera_stream():
    """Relay the Pi MJPEG stream to the browser."""
    stream = _stream_url()
    if not stream:
        raise HTTPException(status_code=503, detail="Pi camera is not configured.")

    upstream = _open(stream)
    content_type = upstream.headers.get("Content-Type", "multipart/x-mixed-replace; boundary=frame")

    def relay():
        try:
            while True:
                chunk = upstream.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            upstream.close()

    return StreamingResponse(
        relay(),
        media_type=content_type,
        headers={"Cache-Control": "no-store, max-age=0"},
    )
