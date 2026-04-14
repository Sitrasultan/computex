import os
import subprocess
import threading
import time


def _ensure_socketio():
    try:
        import socketio  # type: ignore
        return socketio, None
    except Exception:
        pass

    try:
        subprocess.run(
            [
                os.environ.get("PYTHON", "python"),
                "-m",
                "pip",
                "install",
                "python-socketio[client]",
                "--disable-pip-version-check",
                "--no-input",
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except Exception as exc:
        return None, f"socketio install failed: {exc}"

    try:
        import socketio  # type: ignore
        return socketio, None
    except Exception as exc:
        return None, f"socketio import failed: {exc}"


class HostBridge:
    def __init__(
        self,
        docker_manager,
        on_log=None,
        on_state_change=None,
        host_id=None,
        secret=None,
        server_url=None,
        label=None,
        os_name=None,
        machine_profile=None,
    ):
        self.docker = docker_manager
        self.on_log = on_log or (lambda _msg: None)
        self.on_state_change = on_state_change or (lambda _state: None)
        self.server_url = server_url or os.environ.get("COMPUTEX_SERVER_URL", "http://localhost:8080")
        self.host_id = host_id or os.environ.get("COMPUTEX_HOST_ID", "host_local")
        self.secret = secret or os.environ.get("COMPUTEX_HOST_SECRET", "computex_host_secret")
        self.label = label or os.environ.get("COMPUTEX_HOST_LABEL", "ComputeX Host")
        self.os_name = os_name or os.environ.get("COMPUTEX_HOST_OS", "unknown")
        self.machine_profile = machine_profile or {}
        self._thread = None
        self._stop = False
        self._client = None
        self._coding_image_prepare_thread = None

    def _emit_progress(self, session_id, stage, message=None, extra=None):
        try:
            if not self._client or not self._client.connected:
                return
            payload = {
                "hostId": self.host_id,
                "sessionId": session_id,
                "stage": stage,
                "message": message or stage,
            }
            if extra:
                payload.update(extra)
            self._client.emit("host:progress", payload)
        except Exception:
            pass

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop = False
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop = True
        try:
            if self._client:
                self._client.disconnect()
        except Exception:
            pass

    def send_telemetry(self, payload):
        try:
            if self._client and self._client.connected:
                data = dict(payload or {})
                data["hostId"] = self.host_id
                self._client.emit("host:telemetry", data)
        except Exception:
            pass

    def _start_coding_image_warmup(self):
        if self._coding_image_prepare_thread and self._coding_image_prepare_thread.is_alive():
            return

        def _worker():
            force_rebuild = os.environ.get("COMPUTEX_FORCE_REBUILD_IMAGES", "").lower() in ("1", "true", "yes", "on")
            self.on_log("Preparing coding images on host...")
            ok, msg = self.docker.prepare_coding_images(force=force_rebuild)
            self.on_log(msg)
            if not ok:
                self.on_log("Continuing with partial image availability; missing images will be prepared on demand.")
            self.on_state_change("connected")

        self._coding_image_prepare_thread = threading.Thread(target=_worker, daemon=True)
        self._coding_image_prepare_thread.start()

    def _run(self):
        socketio, err = _ensure_socketio()
        if not socketio:
            self.on_log(f"Host bridge disabled: {err}")
            return

        sio = socketio.Client(reconnection=True, reconnection_attempts=0, reconnection_delay=3)
        self._client = sio

        @sio.event
        def connect():
            self.on_log("Host bridge connected to server")
            self.on_state_change("connected")
            self._start_coding_image_warmup()
            sio.emit(
                "host:hello",
                {
                    "hostId": self.host_id,
                    "secret": self.secret,
                    "label": self.label,
                    "os": self.os_name,
                    "hostname": self.machine_profile.get("hostname"),
                    "cpu_model": self.machine_profile.get("cpu"),
                    "ram_gb": self.machine_profile.get("ram_gb"),
                    "disk_total_gb": self.machine_profile.get("disk_total_gb"),
                    "disk_free_gb": self.machine_profile.get("disk_free_gb"),
                },
                callback=lambda resp: self.on_log(f"Host auth: {resp}") if resp else None,
            )

        @sio.event
        def disconnect():
            self.on_log("Host bridge disconnected")
            self.on_state_change("disconnected")

        @sio.on("host:command")
        def on_command(payload):
            command = payload.get("command") if payload else None
            data = payload.get("payload", {}) if payload else {}
            self.on_state_change("processing_command")
            ok = False
            msg = "Unknown command"
            meta = {}

            if command == "start_container":
                self.on_log(f"Host command start_container: {data}")
                ok, msg = self.docker.start_container(
                    image=data.get("image", "computex-container"),
                    name=data.get("name", "computex_session"),
                    command=data.get("command"),
                )
            elif command == "docker_ping":
                self.on_log("Host command docker_ping")
                ok = self.docker.ping()
                msg = "Docker engine reachable" if ok else "Docker engine not available"
            elif command == "start_coding_session":
                self.on_log(f"Host command start_coding_session: {data}")
                session_id = data.get("sessionId", "session")
                progress_cb = lambda stage, message=None, extra=None: self._emit_progress(session_id, stage, message, extra)
                progress_cb("session.start", "Starting coding session", {"image": data.get("image", "computex-code")})
                ok, msg, meta = self.docker.start_code_server_session(
                    session_id=data.get("sessionId", "session"),
                    image=data.get("image", "computex-code"),
                    password=data.get("password"),
                    session_root=data.get("sessionRoot"),
                    workspace_path=data.get("workspacePath"),
                    progress_callback=progress_cb,
                )
                progress_cb("session.finish", msg, {"ok": ok, **(meta or {})})
            elif command == "stop_container":
                ok, msg = self.docker.stop_remove_container(name=data.get("name", "computex_session"))
            elif command == "delete_workspace_data":
                ok, msg = self.docker.delete_workspace_data(workspace_path=data.get("workspacePath", ""))
            elif command == "pull_image":
                ok, msg = self.docker.pull_image(image=data.get("image", "computex-dev-env"))
            else:
                msg = f"Unknown host command: {command}"

            self.on_log(msg)
            self.on_state_change("connected")
            return {"ok": ok, "message": msg, **meta}

        while not self._stop:
            try:
                self.on_state_change("connecting")
                sio.connect(self.server_url, transports=["websocket", "polling"])
                sio.wait()
            except Exception as exc:
                self.on_log(f"Host bridge retrying: {exc}")
                self.on_state_change("retrying")
                time.sleep(5)







