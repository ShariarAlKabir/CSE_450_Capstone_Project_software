#!/usr/bin/env python3
"""Camera server for a Raspberry Pi on the same network as the web app.

Exposes a tiny HTTP interface that the web app backend proxies:

    GET /stream.mjpg    MJPEG stream used for the live preview
    GET /snapshot.jpg   single JPEG frame used by the Capture button
    GET /health         JSON health check

Raspberry Pi Camera Module (default):
    sudo apt install -y python3-picamera2
    python3 camera_server.py --port 8081

USB webcam instead:
    python3 camera_server.py --source usb --port 8081

The camera can only be opened by one process at a time, so by default the
server releases it again once no one has used it for --idle-timeout seconds
(45s). That leaves the camera free for rpicam-hello and other tools whenever
the web app is idle. Use --idle-timeout 0 to hold it permanently.
"""

import argparse
import io
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FrameBuffer(io.BufferedIOBase):
    """Latest JPEG frame shared between the capture loop and HTTP handlers."""

    def __init__(self):
        self.frame = None
        self.condition = threading.Condition()

    def write(self, buf):
        payload = bytes(buf)
        with self.condition:
            self.frame = payload
            self.condition.notify_all()
        return len(payload)

    def latest(self):
        with self.condition:
            return self.frame

    def clear(self):
        with self.condition:
            self.frame = None

    def wait_for_new_frame(self, previous, timeout=5.0):
        deadline = time.time() + timeout
        with self.condition:
            while True:
                if self.frame is not None and self.frame is not previous:
                    return self.frame
                remaining = deadline - time.time()
                if remaining <= 0:
                    return None
                self.condition.wait(remaining)


def run_usb_camera(buffer, index, width, height, fps):
    import cv2

    capture = cv2.VideoCapture(index)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    delay = 1.0 / max(fps, 1)
    stop = threading.Event()

    def produce():
        while not stop.is_set():
            ok, frame = capture.read()
            if not ok:
                time.sleep(0.2)
                continue
            encoded_ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            if encoded_ok:
                buffer.write(encoded.tobytes())
            time.sleep(delay)

    threading.Thread(target=produce, daemon=True).start()
    return stop


class CameraManager:
    """Owns the camera and hands it back when the web app goes idle."""

    def __init__(self, args):
        self.args = args
        self.buffer = FrameBuffer()
        self.lock = threading.Lock()
        self.clients = 0
        self.last_used = time.time()
        self.picam = None
        self.stop_event = None
        self.running = False

    def _start(self):
        if self.running:
            return

        if self.args.source == "picamera":
            from picamera2 import Picamera2
            from picamera2.encoders import MJPEGEncoder
            from picamera2.outputs import FileOutput

            camera = Picamera2()
            camera.configure(
                camera.create_video_configuration(
                    main={"size": (self.args.width, self.args.height)},
                    buffer_count=4,
                )
            )
            camera.start_recording(MJPEGEncoder(), FileOutput(self.buffer))
            self.picam = camera
        else:
            self.stop_event = run_usb_camera(
                self.buffer, self.args.usb_index, self.args.width, self.args.height, self.args.fps
            )

        self.running = True
        self.last_used = time.time()
        print("Camera acquired")

    def _stop(self):
        if not self.running:
            return

        if self.picam is not None:
            try:
                self.picam.stop_recording()
            except Exception:
                pass
            try:
                self.picam.close()
            except Exception:
                pass
        if self.stop_event is not None:
            self.stop_event.set()

        self.picam = None
        self.stop_event = None
        self.running = False
        self.buffer.clear()
        print("Camera released - free for other applications")

    def acquire(self):
        with self.lock:
            self._start()
            self.clients += 1
            self.last_used = time.time()
        return self.buffer

    def release(self):
        with self.lock:
            self.clients = max(0, self.clients - 1)
            self.last_used = time.time()

    def touch(self):
        self.last_used = time.time()

    def monitor(self):
        while True:
            time.sleep(1)
            if self.args.idle_timeout <= 0:
                continue
            with self.lock:
                if self.running and self.clients == 0 and time.time() - self.last_used > self.args.idle_timeout:
                    self._stop()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    manager = None

    def log_message(self, *args):
        pass

    def _send_bytes(self, payload, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _camera_busy(self, error):
        self.send_error(503, f"Camera unavailable: {error}")

    def do_GET(self):
        path = self.path.split("?")[0]

        if path in ("/", "/health"):
            self._send_bytes(json.dumps({"status": "ok"}).encode(), "application/json")
            return

        if path == "/snapshot.jpg":
            try:
                buffer = self.manager.acquire()
            except Exception as error:  # camera held by another process
                self._camera_busy(error)
                return
            try:
                frame = buffer.wait_for_new_frame(None, timeout=8.0)
                if frame is None:
                    self.send_error(503, "No frame captured yet")
                    return
                self._send_bytes(frame, "image/jpeg")
            finally:
                self.manager.release()
            return

        if path == "/stream.mjpg":
            try:
                buffer = self.manager.acquire()
            except Exception as error:
                self._camera_busy(error)
                return
            try:
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                previous = None
                while True:
                    frame = buffer.wait_for_new_frame(previous, timeout=10.0)
                    if frame is None:
                        break
                    previous = frame
                    self.manager.touch()
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(frame)}\r\n\r\n".encode())
                    self.wfile.write(frame)
                    self.wfile.write(b"\r\n")
            except (BrokenPipeError, ConnectionResetError):
                return
            finally:
                self.manager.release()
            return

        self.send_error(404, "Not found")


def main():
    parser = argparse.ArgumentParser(description="MJPEG camera server for the textile quality web app.")
    parser.add_argument("--host", default="0.0.0.0", help="interface to bind (default: all)")
    parser.add_argument("--port", type=int, default=8081, help="port to serve on (default: 8081)")
    parser.add_argument("--source", choices=["picamera", "usb"], default="picamera", help="camera type")
    parser.add_argument("--usb-index", type=int, default=0, help="USB camera index when --source usb")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--fps", type=int, default=10, help="preview frames per second for USB cameras")
    parser.add_argument(
        "--idle-timeout",
        type=float,
        default=45.0,
        help="release the camera after this many idle seconds (0 = never)",
    )
    args = parser.parse_args()

    manager = CameraManager(args)
    Handler.manager = manager
    threading.Thread(target=manager.monitor, daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), Handler)

    print(f"Camera server listening on http://{args.host}:{args.port}")
    print(f"  stream   http://<pi-address>:{args.port}/stream.mjpg")
    print(f"  snapshot http://<pi-address>:{args.port}/snapshot.jpg")
    if args.idle_timeout > 0:
        print(f"  camera is released after {args.idle_timeout:g}s of inactivity")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping...")
    finally:
        with manager.lock:
            manager._stop()
        server.server_close()


if __name__ == "__main__":
    main()
