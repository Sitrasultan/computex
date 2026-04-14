import importlib
import ipaddress
import os
import json
import platform
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_CODE_SERVER_BUILD_CONTEXT = Path(
    os.environ.get(
        "COMPUTEX_CODE_BUILD_CONTEXT",
        str(Path(__file__).resolve().parent / "docker" / "code-server"),
    )
)

DEFAULT_DOCKER_ROOT = Path(__file__).resolve().parent / "docker"
DEFAULT_PRESET_BUILD_CONTEXTS = {
    "computex-code": DEFAULT_DOCKER_ROOT / "code-server",
    "computex-python": DEFAULT_DOCKER_ROOT / "presets" / "python",
    "computex-node": DEFAULT_DOCKER_ROOT / "presets" / "node",
    "computex-flutter": DEFAULT_DOCKER_ROOT / "presets" / "flutter",
    "computex-fullstack": DEFAULT_DOCKER_ROOT / "presets" / "fullstack",
    "computex-data": DEFAULT_DOCKER_ROOT / "presets" / "data",
    "computex-go": DEFAULT_DOCKER_ROOT / "presets" / "go",
    "computex-rust": DEFAULT_DOCKER_ROOT / "presets" / "rust",
    "computex-java": DEFAULT_DOCKER_ROOT / "presets" / "java",
    "computex-cpp": DEFAULT_DOCKER_ROOT / "presets" / "cpp",
    "computex-php": DEFAULT_DOCKER_ROOT / "presets" / "php",
    "computex-dotnet": DEFAULT_DOCKER_ROOT / "presets" / "dotnet",
    "computex-devops": DEFAULT_DOCKER_ROOT / "presets" / "devops",
}

PYTHON_READY_IMAGES = {
    "computex-python",
    "computex-data",
    "computex-fullstack",
    "computex-devops",
}


def _parse_coding_image_catalog() -> List[str]:
    # Keep warmup focused on the common launch path; larger presets build on demand.
    default_images = ["computex-code", "computex-python"]
    if os.environ.get("COMPUTEX_PREBUILD_ALL_IMAGES", "").lower() in ("1", "true", "yes", "on"):
        default_images = list(DEFAULT_PRESET_BUILD_CONTEXTS.keys())
    configured = os.environ.get("COMPUTEX_CODING_IMAGE_CATALOG", "")
    if not configured.strip():
        return default_images

    requested = [item.strip() for item in configured.split(",") if item.strip()]
    deduped = []
    for image in requested:
        if image not in deduped:
            deduped.append(image)
    return deduped or default_images



class HostStateStore:
    def __init__(self, file_path: Optional[Path] = None):
        self.file_path = file_path or Path.home() / ".computex_host_agent_state.json"

    def load(self) -> Dict[str, Any]:
        if not self.file_path.exists():
            return {
                "docker_connected_once": False,
                "last_connected_at": None,
                "last_error": None,
                "last_status": "setup",
                "host_registered_once": False,
                "linked_account_email": None,
                "host_profile": {},
                "activity_feed": [],
            }
        try:
            return json.loads(self.file_path.read_text(encoding="utf-8"))
        except Exception:
            return {
                "docker_connected_once": False,
                "last_connected_at": None,
                "last_error": "State file unreadable",
                "last_status": "setup",
                "host_registered_once": False,
                "linked_account_email": None,
                "host_profile": {},
                "activity_feed": [],
            }

    def save(self, state: Dict[str, Any]) -> None:
        self.file_path.write_text(json.dumps(state, indent=2), encoding="utf-8")


class DockerManager:
    def __init__(self, state_store: Optional[HostStateStore] = None):
        self.state_store = state_store or HostStateStore()
        self.client = None
        self._sdk_install_attempted = False
        self.last_connect_result = {
            "ok": False,
            "message": "Docker engine not checked yet",
            "requires_manual_start": False,
            "auto_start_attempted": False,
        }
        self.coding_image_catalog = _parse_coding_image_catalog()

    def resolve_build_context_for_image(self, image: str) -> Optional[Path]:
        context = DEFAULT_PRESET_BUILD_CONTEXTS.get(image)
        if context and context.exists():
            return context
        return DEFAULT_CODE_SERVER_BUILD_CONTEXT if DEFAULT_CODE_SERVER_BUILD_CONTEXT.exists() else None

    def connect(self) -> Tuple[bool, str]:
        docker_module, module_error = self._load_or_install_docker_sdk()
        if docker_module is None:
            self._set_error(module_error)
            self.last_connect_result = {
                "ok": False,
                "message": module_error,
                "requires_manual_start": False,
                "auto_start_attempted": False,
            }
            return False, module_error

        ok, msg, meta = self._connect_with_autostart(docker_module)
        if ok:
            self._mark_connected()
            self.last_connect_result = {
                "ok": True,
                "message": msg,
                "requires_manual_start": False,
                "auto_start_attempted": bool(meta.get("auto_start_attempted")),
            }
            return True, msg

        self.client = None
        self._set_error(msg)
        self.last_connect_result = {
            "ok": False,
            "message": msg,
            "requires_manual_start": bool(meta.get("requires_manual_start")),
            "auto_start_attempted": bool(meta.get("auto_start_attempted")),
        }
        return False, msg

    def ping(self) -> bool:
        if not self.client:
            ok, _ = self.connect()
            return ok

        try:
            self.client.ping()
            return True
        except Exception:
            self.client = None
            self._set_error("Docker engine unreachable")
            return False

    def list_computex_containers(self, include_stopped: bool = False) -> List[Any]:
        if not self.client:
            return []
        try:
            containers = self.client.containers.list(all=include_stopped)
            return [c for c in containers if c.name.startswith("computex")]
        except Exception:
            return []

    def engine_info(self) -> Dict[str, Any]:
        if not self.client:
            return {}
        try:
            info = self.client.info()
            return {
                "Containers": info.get("Containers", 0),
                "Images": info.get("Images", 0),
                "NCPU": info.get("NCPU", 0),
                "MemTotal": info.get("MemTotal", 0),
            }
        except Exception:
            return {}

    def pull_image(self, image: str) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"
        try:
            self.client.images.pull(image)
            return True, f"Image pulled: {image}"
        except Exception as exc:
            return False, f"Pull failed for {image}: {exc}"

    def ensure_image(
        self,
        image: str,
        build_context: Optional[Path] = None,
        progress_callback=None,
        force_rebuild: bool = False,
    ) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"

        if progress_callback:
            progress_callback("image.check", f"Checking image {image}", {"image": image})
        if not force_rebuild:
            try:
                self.client.images.get(image)
                if progress_callback:
                    progress_callback("image.ready", f"Image {image} already present", {"image": image})
                return True, f"Image ready: {image}"
            except Exception:
                pass

        effective_context = build_context if build_context else self.resolve_build_context_for_image(image)
        if effective_context and effective_context.exists():
            try:
                if progress_callback:
                    progress_callback("image.build", f"Building image {image}", {"image": image})
                self.client.images.build(path=str(effective_context), tag=image, rm=True)
                if progress_callback:
                    progress_callback("image.built", f"Image built: {image}", {"image": image})
                return True, f"Image built: {image}"
            except Exception as exc:
                if progress_callback:
                    progress_callback("image.error", f"Build failed for {image}", {"image": image, "error": str(exc)})
                return False, f"Build failed for {image}: {exc}"

        if progress_callback:
            progress_callback("image.pull", f"Pulling image {image}", {"image": image})
        return self.pull_image(image)

    def start_container(self, image: str, name: str, command: Optional[str] = None) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"

        try:
            existing = self.client.containers.get(name)
            try:
                existing.stop(timeout=5)
            except Exception:
                pass
            existing.remove(force=True)
        except Exception:
            pass

        try:
            run_kwargs = {
                "name": name,
                "detach": True,
            }
            if command:
                run_kwargs["command"] = command
            container = self.client.containers.run(image, **run_kwargs)
            return True, f"Container started: {container.name}"
        except Exception as exc:
            return False, f"Start container failed: {exc}"

    def start_code_server_session(
        self,
        session_id: str,
        image: str = "computex-code",
        password: Optional[str] = None,
        session_root: Optional[str] = None,
        workspace_path: Optional[str] = None,
        progress_callback=None,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        if not self.ping():
            return False, "Docker engine not available", {}

        self.record_activity(f"launch {session_id} -> image {image}")
        force_rebuild = os.environ.get("COMPUTEX_FORCE_REBUILD_IMAGES", "").lower() in ("1", "true", "yes", "on")
        image_ok, image_msg = self.ensure_image(image, progress_callback=progress_callback, force_rebuild=force_rebuild)
        if not image_ok:
            return False, image_msg, {}

        container_name = f"computex_session_{session_id}"
        chosen_password = password or f"sess_{session_id[-6:]}"
        workspace_root = Path(session_root or "C:/computex/workspaces")
        resolved_workspace_path = Path(workspace_path) if workspace_path else (workspace_root / session_id)
        resolved_workspace_path.mkdir(parents=True, exist_ok=True)
        (resolved_workspace_path / "project").mkdir(parents=True, exist_ok=True)
        (resolved_workspace_path / ".config" / "code-server").mkdir(parents=True, exist_ok=True)
        (resolved_workspace_path / ".local" / "share" / "code-server").mkdir(parents=True, exist_ok=True)

        try:
            existing = self.client.containers.get(container_name)
            try:
                existing.stop(timeout=5)
            except Exception:
                pass
            existing.remove(force=True)
        except Exception:
            pass

        last_error = None
        for _attempt in range(10):
            host_port = self._find_available_port()
            try:
                self.record_activity(f"starting container {container_name} on port {host_port}")
                if progress_callback:
                    progress_callback("container.start", f"Starting container on port {host_port}", {"port": host_port})
                container = self.client.containers.run(
                    image,
                    name=container_name,
                    detach=True,
                    environment={"PASSWORD": chosen_password},
                    ports={"8080/tcp": host_port},
                    volumes={str(resolved_workspace_path): {"bind": "/home/coder", "mode": "rw"}},
                    working_dir="/home/coder/project",
                )
                if image in PYTHON_READY_IMAGES:
                    python_ready_ok, python_ready_msg = self._bootstrap_python_workspace(container)
                    if not python_ready_ok:
                        try:
                            container.remove(force=True)
                        except Exception:
                            pass
                        return False, python_ready_msg, {}
                access_url = f"http://{self._detect_host_ip()}:{host_port}"
                if progress_callback:
                    progress_callback(
                        "container.ready",
                        f"Code server ready on port {host_port}",
                        {
                            "port": host_port,
                            "access_url": access_url,
                            "password": chosen_password,
                            "container_name": container.name,
                            "workspace_path": str(resolved_workspace_path),
                        },
                    )
                return True, f"Code server started on port {host_port}", {
                    "container_name": container.name,
                    "password": chosen_password,
                    "port": host_port,
                    "access_url": access_url,
                    "workspace_path": str(resolved_workspace_path),
                }
            except Exception as exc:
                last_error = exc
                error_text = str(exc).lower()
                if "port is already allocated" in error_text or "bind for 0.0.0.0:" in error_text:
                    continue
                return False, f"Start coding container failed: {exc}", {}

        return False, f"Start coding container failed: {last_error}", {}

    def _bootstrap_python_workspace(self, container) -> Tuple[bool, str]:
        try:
            result = container.exec_run(
                [
                    "/bin/bash",
                    "-lc",
                    (
                        "cd /home/coder/project && "
                        "if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi && "
                        "mkdir -p .vscode && "
                        "if [ ! -f .vscode/settings.json ]; then "
                        "printf '%s' "
                        '\'{\n'
                        '  "python.defaultInterpreterPath": "/home/coder/project/.venv/bin/python",\n'
                        '  "python.terminal.activateEnvironment": true\n'
                        "}\' > .vscode/settings.json; "
                        "fi"
                    ),
                ],
                user="coder",
            )
        except Exception as exc:
            return False, f"Python workspace bootstrap failed: {exc}"

        exit_code = getattr(result, "exit_code", 1)
        output = getattr(result, "output", b"")
        if exit_code != 0:
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            return False, f"Python workspace bootstrap failed: {str(output).strip() or 'unknown error'}"
        return True, "Python workspace ready"

    def delete_workspace_data(self, workspace_path: str) -> Tuple[bool, str]:
        target = Path(workspace_path)
        if not target.exists():
            return True, f"Workspace already removed: {workspace_path}"

        try:
            shutil.rmtree(target)
            return True, f"Workspace removed: {workspace_path}"
        except Exception as exc:
            return False, f"Workspace delete failed: {exc}"

    def stop_remove_container(self, name: str) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"
        try:
            container = self.client.containers.get(name)
            try:
                container.stop(timeout=5)
            except Exception:
                pass
            container.remove(force=True)
            return True, f"Container removed: {name}"
        except Exception as exc:
            return False, f"Remove container failed: {exc}"

    def remove_image(self, image: str, force: bool = False) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"
        try:
            self.client.images.remove(image=image, force=force)
            return True, f"Image removed: {image}"
        except Exception as exc:
            return False, f"Remove image failed: {exc}"

    def list_images(self) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"
        try:
            images = self.client.images.list()
            tags = []
            for img in images[:10]:
                if img.tags:
                    tags.append(img.tags[0])
                else:
                    tags.append(img.short_id)
            if not tags:
                return True, "No images found"
            return True, "Images: " + ", ".join(tags)
        except Exception as exc:
            return False, f"List images failed: {exc}"

    def prepare_coding_images(self, force: bool = False) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"

        state = self.state_store.load()
        if state.get("coding_images_prepared") and not force:
            return True, "Coding images already prepared"

        prepared = []
        failures = []
        for image in self.coding_image_catalog:
            ok, msg = self.ensure_image(image, force_rebuild=force)
            if ok:
                prepared.append(image)
            else:
                failures.append(f"{image}: {msg}")

        if failures:
            return False, "Some coding images failed to prepare: " + " | ".join(failures)
        state["coding_images_prepared"] = True
        self.state_store.save(state)
        return True, "Coding images ready: " + ", ".join(prepared)

    def _find_available_port(self, start_port: int = 8000, end_port: int = 8999) -> int:
        allocated_ports = self._get_allocated_host_ports()
        for port in range(start_port, end_port + 1):
            if port in allocated_ports:
                continue
            if self._port_is_available(port):
                return port
        raise RuntimeError("No available port found for ComputeX session")

    def _get_allocated_host_ports(self) -> set[int]:
        if not self.client:
            return set()

        allocated_ports: set[int] = set()
        try:
            for container in self.client.containers.list():
                for bindings in (container.ports or {}).values():
                    if not bindings:
                        continue
                    for binding in bindings:
                        host_port = binding.get("HostPort")
                        if not host_port:
                            continue
                        try:
                            allocated_ports.add(int(host_port))
                        except (TypeError, ValueError):
                            continue
        except Exception:
            return allocated_ports

        return allocated_ports

    def _port_is_available(self, port: int) -> bool:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False
        finally:
            sock.close()

    def _detect_host_ip(self) -> str:
        explicit = os.environ.get("COMPUTEX_ACCESS_HOST") or os.environ.get("COMPUTEX_HOST_IP")
        if explicit:
            return explicit.strip()

        server_url = os.environ.get("COMPUTEX_SERVER_URL", "")
        if server_url:
            try:
                hostname = urlparse(server_url).hostname
                if hostname in ("localhost", "127.0.0.1"):
                    return "127.0.0.1"
                if hostname:
                    parsed = ipaddress.ip_address(hostname)
                    if not parsed.is_loopback:
                        return hostname
            except Exception:
                pass

        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("8.8.8.8", 80))
            ip = probe.getsockname()[0]
            return ip or "127.0.0.1"
        except Exception:
            return "127.0.0.1"
        finally:
            probe.close()

    def record_activity(self, message: str) -> None:
        state = self.state_store.load()
        feed = state.get("activity_feed", [])
        ts = datetime.now().strftime("%H:%M")
        feed.insert(0, f"{ts}  {message}")
        state["activity_feed"] = feed[:20]
        self.state_store.save(state)

    def get_saved_activity(self) -> List[str]:
        state = self.state_store.load()
        return state.get("activity_feed", [])

    def get_state(self) -> Dict[str, Any]:
        return self.state_store.load()

    def _connect_with_autostart(self, docker_module) -> Tuple[bool, str, Dict[str, Any]]:
        try:
            self.client = docker_module.from_env()
            self.client.ping()
            return True, "Docker engine connected", {"auto_start_attempted": False}
        except Exception as first_exc:
            first_error = str(first_exc)

        started, startup_msg, startup_meta = self._auto_start_engine_if_needed()
        if not started:
            return False, f"Docker connection failed: {first_error} | {startup_msg}", {
                "auto_start_attempted": True,
                "requires_manual_start": bool(startup_meta.get("requires_manual_start")),
            }

        deadline = time.time() + 45
        last_error = "Docker engine not yet ready"
        while time.time() < deadline:
            try:
                self.client = docker_module.from_env()
                self.client.ping()
                return True, "Docker engine connected (auto-started)", {"auto_start_attempted": True}
            except Exception as exc:
                last_error = str(exc)
                time.sleep(2)

        return False, (
            "ComputeX tried to open Docker Desktop, but the engine is still not ready. "
            "Please start Docker Desktop manually and leave it open, then retry. "
            f"Last error: {last_error}"
        ), {
            "auto_start_attempted": True,
            "requires_manual_start": True,
        }

    def _auto_start_engine_if_needed(self) -> Tuple[bool, str, Dict[str, Any]]:
        system_name = platform.system().lower()
        if system_name != "windows":
            return False, "Please start Docker on this machine and leave it open, then retry.", {
                "requires_manual_start": True,
            }

        try:
            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Start-Service -Name com.docker.service -ErrorAction SilentlyContinue",
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=20,
            )
        except Exception:
            pass

        desktop_candidates = [
            Path("C:/Program Files/Docker/Docker/Docker Desktop.exe"),
            Path("C:/Program Files (x86)/Docker/Docker/Docker Desktop.exe"),
        ]

        for exe in desktop_candidates:
            if exe.exists():
                try:
                    subprocess.Popen([str(exe)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return True, "Docker Desktop launch requested", {
                        "requires_manual_start": False,
                    }
                except Exception:
                    continue

        return False, (
            "ComputeX could not open Docker Desktop automatically. "
            "Please start the Docker app yourself and leave it open."
        ), {
            "requires_manual_start": True,
        }

    def _load_or_install_docker_sdk(self):
        try:
            return importlib.import_module("docker"), ""
        except Exception:
            pass

        install_ok, install_msg = self._install_docker_sdk_if_needed()
        if not install_ok:
            return None, install_msg

        try:
            return importlib.import_module("docker"), ""
        except Exception as exc:
            return None, f"Docker SDK install completed but import failed: {exc}"

    def _install_docker_sdk_if_needed(self) -> Tuple[bool, str]:
        if self._sdk_install_attempted:
            return False, "Docker SDK auto-install already attempted and is still unavailable"

        self._sdk_install_attempted = True
        cmd = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "docker",
            "--disable-pip-version-check",
            "--no-input",
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=180)
        except Exception as exc:
            return False, f"Docker SDK auto-install failed: {exc}"

        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            details = stderr if stderr else stdout
            if len(details) > 220:
                details = details[:220] + "..."
            return False, f"Docker SDK auto-install failed (pip exit {result.returncode}): {details}"

        return True, "Docker SDK installed"

    def _mark_connected(self) -> None:
        state = self.state_store.load()
        state["docker_connected_once"] = True
        state["last_connected_at"] = datetime.now().isoformat(timespec="seconds")
        state["last_error"] = None
        self.state_store.save(state)

    def _set_error(self, message: str) -> None:
        state = self.state_store.load()
        state["last_error"] = message
        self.state_store.save(state)


