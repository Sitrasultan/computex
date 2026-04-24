import importlib
import ipaddress
import os
import json
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from code_server_image_manager import (
    get_coding_image_catalog,
    is_cpp_ready_image,
    is_java_ready_image,
    is_node_ready_image,
    is_php_ready_image,
    is_python_ready_image,
    resolve_build_context_for_image as resolve_managed_build_context,
)



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
        self.coding_image_catalog = get_coding_image_catalog()
        self._coding_prepare_lock = threading.Lock()
        self._runtime_prepare_lock = threading.Lock()

    def resolve_build_context_for_image(self, image: str) -> Optional[Path]:
        return resolve_managed_build_context(image)

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

    def verify_node_runtime(self, image: str = "computex-node-interpreter") -> Tuple[bool, str, Dict[str, Any]]:
        if not self.ping():
            return False, "Docker engine not available", {}

        requested_image = (image or "").strip() or "computex-node-interpreter"
        legacy_aliases = {
            "computex-node": "computex-node-interpreter",
        }
        effective_image = legacy_aliases.get(requested_image, requested_image)

        image_ok, image_msg = self.ensure_image(effective_image, force_rebuild=False)
        if not image_ok:
            return False, image_msg, {}

        checks: List[Dict[str, Any]] = [
            {"id": "node_version", "cmd": "node -v", "expect": "v"},
            {"id": "npm_version", "cmd": "npm -v"},
            {"id": "tsc_version", "cmd": "npx tsc -v", "expect": "Version"},
            {
                "id": "node_smoke",
                "cmd": (
                    "cd /home/coder/project && "
                    "cat > app.js <<'EOF'\n"
                    "console.log('Node OK');\n"
                    "EOF\n"
                    "node app.js"
                ),
                "expect": "Node OK",
            },
            {
                "id": "ts_smoke",
                "cmd": (
                    "cd /home/coder/project && "
                    "mkdir -p .tmp-healthcheck && "
                    "cat > hello.ts <<'EOF'\n"
                    "const msg: string = 'TS OK';\n"
                    "console.log(msg);\n"
                    "EOF\n"
                    "npx tsc hello.ts --target es2020 --module commonjs --outDir .tmp-healthcheck && "
                    "node .tmp-healthcheck/hello.js"
                ),
                "expect": "TS OK",
            },
        ]

        container_name = f"computex_node_healthcheck_{int(time.time())}"
        container = None
        results: List[Dict[str, Any]] = []

        try:
            container = self.client.containers.run(
                effective_image,
                name=container_name,
                entrypoint="/bin/bash",
                command=["-lc", "sleep 600"],
                detach=True,
                working_dir="/home/coder/project",
            )

            for check in checks:
                result = container.exec_run(
                    ["/bin/bash", "-lc", check["cmd"]],
                    user="coder",
                )
                exit_code = int(getattr(result, "exit_code", 1))
                output = getattr(result, "output", b"")
                if isinstance(output, bytes):
                    output = output.decode("utf-8", errors="replace")
                output_text = (output or "").strip()
                passed = exit_code == 0
                expect = check.get("expect")
                if passed and expect:
                    passed = expect in output_text
                results.append(
                    {
                        "id": check["id"],
                        "ok": passed,
                        "exit_code": exit_code,
                        "output": output_text,
                    }
                )
                if not passed:
                    return False, f"Node healthcheck failed at {check['id']}", {
                        "image": effective_image,
                        "checks": results,
                    }

            return True, "Node runtime healthcheck passed", {
                "image": effective_image,
                "checks": results,
            }
        except Exception as exc:
            return False, f"Node healthcheck failed: {exc}", {
                "image": effective_image,
                "checks": results,
            }
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

    def start_code_server_session(
        self,
        session_id: str,
        image: str = "computex-python-interpreter",
        password: Optional[str] = None,
        session_root: Optional[str] = None,
        workspace_path: Optional[str] = None,
        progress_callback=None,
        _allow_python_recovery: bool = True,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        if not self.ping():
            return False, "Docker engine not available", {}

        requested_image = (image or "").strip() or "computex-python-interpreter"
        legacy_aliases = {
            "computex-code": "computex-python-interpreter",
            "computex-python": "computex-python-interpreter",
            "computex-node": "computex-node-interpreter",
            "computex-php": "computex-php-interpreter",
            "computex-java": "computex-java-interpreter",
            "computex-cpp": "computex-cpp-interpreter",
        }
        effective_image = legacy_aliases.get(requested_image, requested_image)
        if effective_image != requested_image:
            self.record_activity(
                f"launch {session_id} requested legacy image {requested_image}; using {effective_image}"
            )
            if progress_callback:
                progress_callback(
                    "image.override",
                    f"Overriding legacy image {requested_image} to {effective_image}",
                    {"requested_image": requested_image, "image": effective_image},
                )
        else:
            self.record_activity(f"launch {session_id} -> image {effective_image}")

        image_ok, image_msg = self.ensure_image(
            effective_image,
            progress_callback=progress_callback,
            force_rebuild=False,
        )
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
        self._seed_workspace_from_prewarm_cache(effective_image, resolved_workspace_path)

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
                    progress_callback(
                        "container.start",
                        f"Starting container on port {host_port}",
                        {"port": host_port, "image": effective_image},
                    )
                container = self.client.containers.run(
                    effective_image,
                    name=container_name,
                    detach=True,
                    environment={"PASSWORD": chosen_password},
                    ports={"8080/tcp": host_port},
                    volumes={str(resolved_workspace_path): {"bind": "/home/coder", "mode": "rw"}},
                    working_dir="/home/coder/project",
                )
                if is_python_ready_image(effective_image):
                    python_ready_ok, python_ready_msg = self._bootstrap_python_workspace(container)
                    if not python_ready_ok:
                        try:
                            container.remove(force=True)
                        except Exception:
                            pass
                        if _allow_python_recovery:
                            fallback_image = "computex-python-interpreter"
                            if effective_image != fallback_image:
                                if progress_callback:
                                    progress_callback(
                                        "python.recover",
                                        f"Python bootstrap failed on {effective_image}. Retrying with {fallback_image}.",
                                        {"from_image": effective_image, "to_image": fallback_image},
                                    )
                                self.record_activity(
                                    f"python bootstrap failed on {effective_image}; retrying launch with {fallback_image}"
                                )
                            return self.start_code_server_session(
                                session_id=session_id,
                                image=fallback_image,
                                password=password,
                                session_root=session_root,
                                workspace_path=workspace_path,
                                progress_callback=progress_callback,
                                _allow_python_recovery=False,
                            )
                        return False, python_ready_msg, {}
                if is_node_ready_image(effective_image):
                    node_ready_ok, node_ready_msg = self._bootstrap_node_workspace(container)
                    if not node_ready_ok:
                        try:
                            container.remove(force=True)
                        except Exception:
                            pass
                        return False, node_ready_msg, {}
                if is_php_ready_image(effective_image):
                    php_ready_ok, php_ready_msg = self._bootstrap_php_workspace(container)
                    if not php_ready_ok:
                        try:
                            container.remove(force=True)
                        except Exception:
                            pass
                        return False, php_ready_msg, {}
                if is_java_ready_image(effective_image):
                    java_ready_ok, java_ready_msg = self._bootstrap_java_workspace(container)
                    if not java_ready_ok:
                        try:
                            container.remove(force=True)
                        except Exception:
                            pass
                        return False, java_ready_msg, {}
                if is_cpp_ready_image(effective_image):
                    cpp_ready_ok, cpp_ready_msg = self._bootstrap_cpp_workspace(container)
                    if not cpp_ready_ok:
                        try:
                            container.remove(force=True)
                        except Exception:
                            pass
                        return False, cpp_ready_msg, {}
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
                            "image": effective_image,
                        },
                    )
                return True, f"Code server started on port {host_port}", {
                    "container_name": container.name,
                    "password": chosen_password,
                    "port": host_port,
                    "access_url": access_url,
                    "workspace_path": str(resolved_workspace_path),
                    "image": effective_image,
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
            bootstrap_cmd = (
                "cd /home/coder/project && "
                "if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi && "
                "mkdir -p .vscode /home/coder/.local/share/code-server/User && "
                "PYTHON_EXT_DIR='/home/coder/.local/share/code-server/extensions' && "
                "PYTHON_EXT_CACHE='/opt/computex/extensions-cache' && "
                "if ! code-server --list-extensions | grep -Fxiq ms-python.python; then "
                "if [ -d \"$PYTHON_EXT_CACHE\" ]; then "
                "mkdir -p \"$PYTHON_EXT_DIR\" && "
                "cp -a \"$PYTHON_EXT_CACHE\"/. \"$PYTHON_EXT_DIR\"/ >/dev/null 2>&1 || true; "
                "fi; "
                "if ! code-server --list-extensions | grep -Fxiq ms-python.python; then "
                "code-server --install-extension ms-python.python >/dev/null 2>&1 || true; "
                "fi; "
                "fi && "
                "code-server --list-extensions | grep -Fxiq ms-python.python && "
                "python3 - <<'PY'\n"
                "import json\n"
                "from pathlib import Path\n"
                "settings_targets = [\n"
                "    Path('/home/coder/project/.vscode/settings.json'),\n"
                "    Path('/home/coder/.local/share/code-server/User/settings.json'),\n"
                "]\n"
                "for settings_file in settings_targets:\n"
                "    settings_file.parent.mkdir(parents=True, exist_ok=True)\n"
                "    data = {}\n"
                "    if settings_file.exists():\n"
                "        try:\n"
                "            data = json.loads(settings_file.read_text() or '{}')\n"
                "        except Exception:\n"
                "            data = {}\n"
                "    data['python.defaultInterpreterPath'] = '/home/coder/project/.venv/bin/python'\n"
                "    data['python.terminal.activateEnvironment'] = True\n"
                "    data['python.analysis.autoImportCompletions'] = True\n"
                "    settings_file.write_text(json.dumps(data, indent=2))\n"
                "PY\n"
                "test -x .venv/bin/python"
            )
            result = container.exec_run(
                [
                    "/bin/bash",
                    "-lc",
                    bootstrap_cmd,
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

    def _bootstrap_node_workspace(self, container) -> Tuple[bool, str]:
        try:
            install_on_demand = os.environ.get("COMPUTEX_NODE_INSTALL_EXT_ON_DEMAND", "").lower() in (
                "1",
                "true",
                "yes",
                "on",
            )
            copy_cache_on_launch = os.environ.get("COMPUTEX_NODE_COPY_EXT_CACHE_ON_LAUNCH", "").lower() in (
                "1",
                "true",
                "yes",
                "on",
            )
            extension_cache_copy_block = (
                "NODE_EXT_DIR='/home/coder/.local/share/code-server/extensions' && "
                "NODE_EXT_CACHE='/opt/computex/extensions-cache-node' && "
                "if [ -d \"$NODE_EXT_CACHE\" ]; then "
                "mkdir -p \"$NODE_EXT_DIR\" && "
                "cp -a \"$NODE_EXT_CACHE\"/. \"$NODE_EXT_DIR\"/ >/dev/null 2>&1 || true; "
                "fi && "
            ) if copy_cache_on_launch else ""
            extension_install_block = (
                "for ext in "
                "dbaeumer.vscode-eslint "
                "esbenp.prettier-vscode "
                "ms-vscode.vscode-typescript-next "
                "ritwickdey.LiveServer "
                "bradlc.vscode-tailwindcss; do "
                "if ! code-server --list-extensions | grep -Fxiq \"$ext\"; then "
                "code-server --install-extension \"$ext\" >/dev/null 2>&1 || true; "
                "fi; "
                "done && "
            ) if install_on_demand else ""
            bootstrap_cmd = (
                "cd /home/coder/project && "
                "mkdir -p .vscode /home/coder/.local/share/code-server/User && "
                + extension_cache_copy_block
                + extension_install_block
                + "python3 - <<'PY'\n"
                "import json\n"
                "from pathlib import Path\n"
                "settings_targets = [\n"
                "    Path('/home/coder/project/.vscode/settings.json'),\n"
                "    Path('/home/coder/.local/share/code-server/User/settings.json'),\n"
                "]\n"
                "updates = {\n"
                "    'javascript.updateImportsOnFileMove.enabled': 'always',\n"
                "    'typescript.updateImportsOnFileMove.enabled': 'always',\n"
                "    'editor.formatOnSave': True,\n"
                "    'liveServer.settings.donotShowInfoMsg': True,\n"
                "    'eslint.validate': [\n"
                "        'javascript',\n"
                "        'javascriptreact',\n"
                "        'typescript',\n"
                "        'typescriptreact',\n"
                "        'html',\n"
                "    ],\n"
                "}\n"
                "tsdk_candidates = [\n"
                "    Path('/usr/local/lib/node_modules/typescript/lib'),\n"
                "    Path('/usr/lib/node_modules/typescript/lib'),\n"
                "]\n"
                "detected_tsdk = next((str(candidate) for candidate in tsdk_candidates if (candidate / 'tsserver.js').exists()), None)\n"
                "if detected_tsdk:\n"
                "    updates['typescript.tsdk'] = detected_tsdk\n"
                "for settings_file in settings_targets:\n"
                "    settings_file.parent.mkdir(parents=True, exist_ok=True)\n"
                "    data = {}\n"
                "    if settings_file.exists():\n"
                "        try:\n"
                "            data = json.loads(settings_file.read_text() or '{}')\n"
                "        except Exception:\n"
                "            data = {}\n"
                "    if 'typescript.tsdk' in data and not detected_tsdk:\n"
                "        data.pop('typescript.tsdk', None)\n"
                "    data.update(updates)\n"
                "    settings_file.write_text(json.dumps(data, indent=2))\n"
                "PY\n"
                "node --version >/dev/null 2>&1 && npm --version >/dev/null 2>&1"
            )
            result = container.exec_run(
                [
                    "/bin/bash",
                    "-lc",
                    bootstrap_cmd,
                ],
                user="coder",
            )
        except Exception as exc:
            return False, f"Node workspace bootstrap failed: {exc}"

        exit_code = getattr(result, "exit_code", 1)
        output = getattr(result, "output", b"")
        if exit_code != 0:
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            return False, f"Node workspace bootstrap failed: {str(output).strip() or 'unknown error'}"
        if install_on_demand:
            return True, "Node workspace ready (on-demand extension install enabled)"
        if copy_cache_on_launch:
            return True, "Node workspace ready (using copied extension cache)"
        return True, "Node workspace ready (fast launch mode)"

    def _bootstrap_php_workspace(self, container) -> Tuple[bool, str]:
        try:
            bootstrap_cmd = (
                "cd /home/coder/project && "
                "mkdir -p .vscode /home/coder/.local/share/code-server/User && "
                "PHP_EXT_DIR='/home/coder/.local/share/code-server/extensions' && "
                "PHP_EXT_CACHE='/opt/computex/extensions-cache-php' && "
                "if [ -d \"$PHP_EXT_CACHE\" ]; then "
                "mkdir -p \"$PHP_EXT_DIR\" && "
                "cp -a \"$PHP_EXT_CACHE\"/. \"$PHP_EXT_DIR\"/ >/dev/null 2>&1 || true; "
                "fi && "
                "for ext in "
                "xdebug.php-pack "
                "bmewburn.vscode-intelephense-client "
                "mehedidracula.php-namespace-resolver "
                "esbenp.prettier-vscode; do "
                "if ! code-server --list-extensions | grep -Fxiq \"$ext\"; then "
                "code-server --install-extension \"$ext\" >/dev/null 2>&1 || true; "
                "fi; "
                "done && "
                "code-server --list-extensions | grep -Fxiq bmewburn.vscode-intelephense-client && "
                "python3 - <<'PY'\n"
                "import json\n"
                "from pathlib import Path\n"
                "settings_targets = [\n"
                "    Path('/home/coder/project/.vscode/settings.json'),\n"
                "    Path('/home/coder/.local/share/code-server/User/settings.json'),\n"
                "]\n"
                "updates = {\n"
                "    'php.validate.executablePath': '/usr/bin/php',\n"
                "    'php.suggest.basic': False,\n"
                "    'editor.formatOnSave': True,\n"
                "    'files.associations': {\n"
                "        '*.php': 'php',\n"
                "    },\n"
                "}\n"
                "for settings_file in settings_targets:\n"
                "    settings_file.parent.mkdir(parents=True, exist_ok=True)\n"
                "    data = {}\n"
                "    if settings_file.exists():\n"
                "        try:\n"
                "            data = json.loads(settings_file.read_text() or '{}')\n"
                "        except Exception:\n"
                "            data = {}\n"
                "    data.update(updates)\n"
                "    settings_file.write_text(json.dumps(data, indent=2))\n"
                "PY\n"
                "php --version >/dev/null 2>&1 && composer --version >/dev/null 2>&1"
            )
            result = container.exec_run(
                [
                    "/bin/bash",
                    "-lc",
                    bootstrap_cmd,
                ],
                user="coder",
            )
        except Exception as exc:
            return False, f"PHP workspace bootstrap failed: {exc}"

        exit_code = getattr(result, "exit_code", 1)
        output = getattr(result, "output", b"")
        if exit_code != 0:
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            return False, f"PHP workspace bootstrap failed: {str(output).strip() or 'unknown error'}"
        return True, "PHP workspace ready"

    def _bootstrap_java_workspace(self, container) -> Tuple[bool, str]:
        try:
            bootstrap_cmd = (
                "cd /home/coder/project && "
                "mkdir -p .vscode /home/coder/.local/share/code-server/User && "
                "JAVA_EXT_DIR='/home/coder/.local/share/code-server/extensions' && "
                "JAVA_EXT_CACHE='/opt/computex/extensions-cache-java' && "
                "if [ -d \"$JAVA_EXT_CACHE\" ]; then "
                "mkdir -p \"$JAVA_EXT_DIR\" && "
                "cp -a \"$JAVA_EXT_CACHE\"/. \"$JAVA_EXT_DIR\"/ >/dev/null 2>&1 || true; "
                "fi && "
                "for ext in "
                "redhat.java "
                "vscjava.vscode-java-debug "
                "vscjava.vscode-java-test "
                "vscjava.vscode-maven; do "
                "if ! code-server --list-extensions | grep -Fxiq \"$ext\"; then "
                "code-server --install-extension \"$ext\" >/dev/null 2>&1 || true; "
                "fi; "
                "done && "
                "code-server --list-extensions | grep -Fxiq redhat.java && "
                "python3 - <<'PY'\n"
                "import json\n"
                "from pathlib import Path\n"
                "settings_targets = [\n"
                "    Path('/home/coder/project/.vscode/settings.json'),\n"
                "    Path('/home/coder/.local/share/code-server/User/settings.json'),\n"
                "]\n"
                "jdk_candidates = [\n"
                "    Path('/usr/lib/jvm/java-21-openjdk-amd64'),\n"
                "    Path('/usr/lib/jvm/java-17-openjdk-amd64'),\n"
                "    Path('/usr/lib/jvm/default-java'),\n"
                "]\n"
                "detected_jdk = next((str(candidate) for candidate in jdk_candidates if (candidate / 'bin' / 'java').exists()), None)\n"
                "updates = {\n"
                "    'java.configuration.updateBuildConfiguration': 'automatic',\n"
                "    'java.maven.downloadSources': True,\n"
                "    'editor.formatOnSave': True,\n"
                "}\n"
                "if detected_jdk:\n"
                "    updates['java.jdt.ls.java.home'] = detected_jdk\n"
                "for settings_file in settings_targets:\n"
                "    settings_file.parent.mkdir(parents=True, exist_ok=True)\n"
                "    data = {}\n"
                "    if settings_file.exists():\n"
                "        try:\n"
                "            data = json.loads(settings_file.read_text() or '{}')\n"
                "        except Exception:\n"
                "            data = {}\n"
                "    if 'java.jdt.ls.java.home' in data and not detected_jdk:\n"
                "        data.pop('java.jdt.ls.java.home', None)\n"
                "    data.update(updates)\n"
                "    settings_file.write_text(json.dumps(data, indent=2))\n"
                "PY\n"
                "java -version >/dev/null 2>&1 && javac -version >/dev/null 2>&1 && mvn -v >/dev/null 2>&1"
            )
            result = container.exec_run(
                [
                    "/bin/bash",
                    "-lc",
                    bootstrap_cmd,
                ],
                user="coder",
            )
        except Exception as exc:
            return False, f"Java workspace bootstrap failed: {exc}"

        exit_code = getattr(result, "exit_code", 1)
        output = getattr(result, "output", b"")
        if exit_code != 0:
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            return False, f"Java workspace bootstrap failed: {str(output).strip() or 'unknown error'}"
        return True, "Java workspace ready"

    def _bootstrap_cpp_workspace(self, container) -> Tuple[bool, str]:
        try:
            bootstrap_cmd = (
                "cd /home/coder/project && "
                "mkdir -p .vscode /home/coder/.local/share/code-server/User && "
                "CPP_EXT_DIR='/home/coder/.local/share/code-server/extensions' && "
                "CPP_EXT_CACHE='/opt/computex/extensions-cache-cpp' && "
                "if [ -d \"$CPP_EXT_CACHE\" ]; then "
                "mkdir -p \"$CPP_EXT_DIR\" && "
                "cp -a \"$CPP_EXT_CACHE\"/. \"$CPP_EXT_DIR\"/ >/dev/null 2>&1 || true; "
                "fi && "
                "for ext in "
                "llvm-vs-code-extensions.vscode-clangd "
                "ms-vscode.cmake-tools; do "
                "if ! code-server --list-extensions | grep -Fxiq \"$ext\"; then "
                "code-server --install-extension \"$ext\" >/dev/null 2>&1 || true; "
                "fi; "
                "done && "
                "python3 - <<'PY'\n"
                "import json\n"
                "from pathlib import Path\n"
                "settings_targets = [\n"
                "    Path('/home/coder/project/.vscode/settings.json'),\n"
                "    Path('/home/coder/.local/share/code-server/User/settings.json'),\n"
                "]\n"
                "updates = {\n"
                "    'C_Cpp.default.cppStandard': 'c++20',\n"
                "    'C_Cpp.default.intelliSenseMode': 'linux-gcc-x64',\n"
                "    'C_Cpp.default.compilerPath': '/usr/bin/g++',\n"
                "    'clangd.path': '/usr/bin/clangd',\n"
                "    'cmake.configureOnOpen': True,\n"
                "    'editor.formatOnSave': True,\n"
                "    'code-runner.executorMap': {\n"
                "        'cpp': 'cd $dir && g++ -Wall -Wextra \"$fileName\" -o \"$fileNameWithoutExt\" && \"$dir/$fileNameWithoutExt\"',\n"
                "    },\n"
                "    'C_Cpp_Runner.cCompilerPath': '/usr/bin/gcc',\n"
                "    'C_Cpp_Runner.cppCompilerPath': '/usr/bin/g++',\n"
                "    'C_Cpp_Runner.debuggerPath': '/usr/bin/gdb',\n"
                "    'C_Cpp_Runner.compilerArgs': [],\n"
                "    'files.associations': {\n"
                "        '*.hpp': 'cpp',\n"
                "        '*.hh': 'cpp',\n"
                "        '*.hxx': 'cpp',\n"
                "        '*.tpp': 'cpp',\n"
                "    },\n"
                "}\n"
                "for settings_file in settings_targets:\n"
                "    settings_file.parent.mkdir(parents=True, exist_ok=True)\n"
                "    data = {}\n"
                "    if settings_file.exists():\n"
                "        try:\n"
                "            data = json.loads(settings_file.read_text() or '{}')\n"
                "        except Exception:\n"
                "            data = {}\n"
                "    data.update(updates)\n"
                "    settings_file.write_text(json.dumps(data, indent=2))\n"
                "PY\n"
                "g++ --version >/dev/null 2>&1 && "
                "clang++ --version >/dev/null 2>&1 && "
                "cmake --version >/dev/null 2>&1 && "
                "make --version >/dev/null 2>&1"
            )
            result = container.exec_run(
                [
                    "/bin/bash",
                    "-lc",
                    bootstrap_cmd,
                ],
                user="coder",
            )
        except Exception as exc:
            return False, f"C++ workspace bootstrap failed: {exc}"

        exit_code = getattr(result, "exit_code", 1)
        output = getattr(result, "output", b"")
        if exit_code != 0:
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            return False, f"C++ workspace bootstrap failed: {str(output).strip() or 'unknown error'}"
        return True, "C++ workspace ready"

    def _resolve_workspace_browse_root(self, workspace_path: str) -> Tuple[bool, str, Optional[Path], Optional[Path]]:
        root = Path(workspace_path or "").expanduser()
        if not str(root).strip():
            return False, "Workspace path is required", None, None
        if not root.exists():
            return False, f"Workspace path not found: {workspace_path}", None, None
        project_root = root / "project"
        browse_root = project_root if project_root.exists() else root
        return True, "Workspace resolved", root.resolve(), browse_root.resolve()

    def _path_within_root(self, root: Path, target: Path) -> bool:
        try:
            resolved_root = root.resolve()
            resolved_target = target.resolve()
        except Exception:
            return False
        return str(resolved_target) == str(resolved_root) or str(resolved_target).startswith(str(resolved_root) + os.sep)

    def list_workspace_files(
        self,
        workspace_path: str,
        max_files: int = 500,
        max_depth: int = 10,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        ok, msg, _workspace_root, browse_root = self._resolve_workspace_browse_root(workspace_path)
        if not ok or not browse_root:
            return False, msg, {}

        try:
            queue: List[Tuple[Path, str, int]] = [(browse_root, "", 0)]
            files: List[Dict[str, Any]] = []
            truncated = False

            while queue and len(files) < max_files:
                current_path, current_rel, depth = queue.pop(0)
                try:
                    entries = sorted(current_path.iterdir(), key=lambda item: item.name.lower())
                except Exception:
                    continue

                for entry in entries:
                    if entry.is_symlink():
                        continue
                    rel = f"{current_rel}/{entry.name}" if current_rel else entry.name
                    if not self._path_within_root(browse_root, entry):
                        continue
                    if entry.is_dir():
                        if depth < max_depth:
                            queue.append((entry, rel, depth + 1))
                        continue
                    if not entry.is_file():
                        continue
                    try:
                        stat = entry.stat()
                    except Exception:
                        continue
                    files.append(
                        {
                            "path": rel.replace("\\", "/"),
                            "size": int(stat.st_size),
                            "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
                            "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                        }
                    )
                    if len(files) >= max_files:
                        truncated = True
                        break

            return True, "Workspace files listed", {
                "files": files,
                "truncated": truncated,
                "root_path": str(browse_root).replace("\\", "/"),
            }
        except Exception as exc:
            return False, f"List workspace files failed: {exc}", {}

    def read_workspace_file(
        self,
        workspace_path: str,
        relative_path: str,
        max_bytes: int = 200 * 1024,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        ok, msg, _workspace_root, browse_root = self._resolve_workspace_browse_root(workspace_path)
        if not ok or not browse_root:
            return False, msg, {}

        normalized = str(relative_path or "").strip().replace("\\", "/").lstrip("/")
        if not normalized:
            return False, "Relative file path is required", {}
        segments = [segment for segment in normalized.split("/") if segment]
        if any(segment in (".", "..") for segment in segments):
            return False, "Invalid file path", {}

        target = browse_root.joinpath(*segments).resolve()
        if not self._path_within_root(browse_root, target):
            return False, "Invalid file path", {}
        if not target.exists() or not target.is_file():
            return False, "File not found", {}

        try:
            stat = target.stat()
            preview_limit = max(1, int(max_bytes) + 1)
            with target.open("rb") as handle:
                preview = handle.read(preview_limit)
            truncated = int(stat.st_size) > int(max_bytes)
            preview_view = preview[: int(max_bytes)]
            is_binary = b"\x00" in preview_view
            content = None if is_binary else preview_view.decode("utf-8", errors="replace")

            return True, "Workspace file read", {
                "path": normalized,
                "size": int(stat.st_size),
                "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "binary": is_binary,
                "truncated": truncated,
                "content": content,
                "root_path": str(browse_root).replace("\\", "/"),
            }
        except Exception as exc:
            return False, f"Read workspace file failed: {exc}", {}

    def get_workspace_last_activity(
        self,
        workspace_path: str,
        max_depth: int = 14,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        ok, msg, _workspace_root, browse_root = self._resolve_workspace_browse_root(workspace_path)
        if not ok or not browse_root:
            return False, msg, {}

        managed_segments = {
            ".venv",
            ".vscode",
            ".config",
            ".local",
            ".cache",
            "node_modules",
            "__pycache__",
            ".pytest_cache",
            ".mypy_cache",
            ".ruff_cache",
            ".ipynb_checkpoints",
        }

        try:
            queue: List[Tuple[Path, str, int]] = [(browse_root, "", 0)]
            latest_ts = None
            latest_path = None

            while queue:
                current_path, current_rel, depth = queue.pop(0)
                try:
                    entries = sorted(current_path.iterdir(), key=lambda item: item.name.lower())
                except Exception:
                    continue

                for entry in entries:
                    if entry.is_symlink():
                        continue
                    rel = f"{current_rel}/{entry.name}" if current_rel else entry.name
                    if not self._path_within_root(browse_root, entry):
                        continue
                    if entry.is_dir():
                        if entry.name in managed_segments:
                            continue
                        if depth < max_depth:
                            queue.append((entry, rel, depth + 1))
                        continue
                    if not entry.is_file():
                        continue
                    if any(segment in managed_segments for segment in rel.split("/")):
                        continue
                    try:
                        stat = entry.stat()
                    except Exception:
                        continue

                    candidate = max(float(stat.st_mtime or 0), float(stat.st_ctime or 0))
                    if latest_ts is None or candidate > latest_ts:
                        latest_ts = candidate
                        latest_path = rel.replace("\\", "/")

            if latest_ts is None:
                return True, "No user activity files found", {
                    "last_activity_at": None,
                    "last_activity_path": None,
                    "root_path": str(browse_root).replace("\\", "/"),
                }

            return True, "Workspace activity detected", {
                "last_activity_at": datetime.fromtimestamp(latest_ts, tz=timezone.utc).isoformat(),
                "last_activity_path": latest_path,
                "root_path": str(browse_root).replace("\\", "/"),
            }
        except Exception as exc:
            return False, f"Workspace activity scan failed: {exc}", {}

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

        with self._coding_prepare_lock:
            state = self.state_store.load()
            catalog = list(self.coding_image_catalog)
            state_prepared_images = state.get("coding_images_prepared_set")
            if not isinstance(state_prepared_images, list):
                state_prepared_images = []
            state_prepared_lookup = {str(image) for image in state_prepared_images}
            pending_images = [image for image in catalog if force or image not in state_prepared_lookup]

            if state.get("coding_images_prepared") and not pending_images:
                return True, "Coding images already prepared"

            prepared = []
            failures = []
            for image in pending_images:
                ok, msg = self.ensure_image(image, force_rebuild=force)
                if ok:
                    prepared.append(image)
                else:
                    failures.append(f"{image}: {msg}")

            if failures:
                return False, "Some coding images failed to prepare: " + " | ".join(failures)
            prepared_set = sorted(state_prepared_lookup.union(prepared).union(catalog if force else []))
            state["coding_images_prepared"] = True
            state["coding_images_prepared_set"] = prepared_set
            self.state_store.save(state)
            if not prepared:
                return True, "Coding images already prepared"
            return True, "Coding images ready: " + ", ".join(prepared)

    def prepare_coding_runtime_assets(self, force: bool = False) -> Tuple[bool, str]:
        if not self.ping():
            return False, "Docker engine not available"

        with self._runtime_prepare_lock:
            state = self.state_store.load()
            catalog = list(self.coding_image_catalog)
            prepared_assets = state.get("coding_runtime_prepared_set")
            if not isinstance(prepared_assets, list):
                prepared_assets = []
            prepared_lookup = {str(image) for image in prepared_assets}
            pending_images = [image for image in catalog if force or image not in prepared_lookup]

            if state.get("coding_runtime_prepared") and not pending_images:
                return True, "Coding runtime assets already prepared"

            prepared = []
            failures = []
            for image in pending_images:
                ok, msg = self._prepare_runtime_asset_for_image(image, force=force)
                if ok:
                    prepared.append(image)
                else:
                    failures.append(f"{image}: {msg}")

            if failures:
                return False, "Some coding runtime assets failed to prepare: " + " | ".join(failures)

            prepared_set = sorted(prepared_lookup.union(prepared).union(catalog if force else []))
            state["coding_runtime_prepared"] = True
            state["coding_runtime_prepared_set"] = prepared_set
            self.state_store.save(state)
            if not prepared:
                return True, "Coding runtime assets already prepared"
            return True, "Coding runtime assets ready: " + ", ".join(prepared)

    def _prepare_runtime_asset_for_image(self, image: str, force: bool = False) -> Tuple[bool, str]:
        image_ok, image_msg = self.ensure_image(image, force_rebuild=False)
        if not image_ok:
            return False, image_msg

        workspace_path = self._prewarm_workspace_for_image(image)
        try:
            if force and workspace_path.exists():
                shutil.rmtree(workspace_path, ignore_errors=True)
            (workspace_path / "project").mkdir(parents=True, exist_ok=True)
            (workspace_path / ".config" / "code-server").mkdir(parents=True, exist_ok=True)
            (workspace_path / ".local" / "share" / "code-server").mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            return False, f"Failed to prepare prewarm workspace for {image}: {exc}"

        container_name = f"computex_prewarm_{self._slug_image(image)}_{int(time.time())}"
        container = None
        try:
            container = self.client.containers.run(
                image,
                name=container_name,
                detach=True,
                environment={"PASSWORD": "prewarm"},
                volumes={str(workspace_path): {"bind": "/home/coder", "mode": "rw"}},
                working_dir="/home/coder/project",
            )
            if is_python_ready_image(image):
                ok, msg = self._bootstrap_python_workspace(container)
                if not ok:
                    return False, msg
            if is_node_ready_image(image):
                ok, msg = self._bootstrap_node_workspace(container)
                if not ok:
                    return False, msg
            if is_php_ready_image(image):
                ok, msg = self._bootstrap_php_workspace(container)
                if not ok:
                    return False, msg
            if is_java_ready_image(image):
                ok, msg = self._bootstrap_java_workspace(container)
                if not ok:
                    return False, msg
            if is_cpp_ready_image(image):
                ok, msg = self._bootstrap_cpp_workspace(container)
                if not ok:
                    return False, msg
            return True, f"Runtime assets prepared for {image}"
        except Exception as exc:
            return False, f"Runtime asset prep failed for {image}: {exc}"
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

    def _seed_workspace_from_prewarm_cache(self, image: str, workspace_path: Path) -> None:
        prewarm_path = self._prewarm_workspace_for_image(image)
        if not prewarm_path.exists():
            return
        if not self._workspace_looks_empty(workspace_path):
            return

        try:
            copy_map = []
            if is_python_ready_image(image):
                # Python gains most from reusing a prepared virtualenv.
                copy_map.append((prewarm_path / "project" / ".venv", workspace_path / "project" / ".venv"))
            else:
                # For non-Python runtimes, avoid copying large extension trees at launch time.
                copy_map.append((prewarm_path / ".vscode", workspace_path / ".vscode"))
            for src, dst in copy_map:
                if not src.exists():
                    continue
                if src.is_dir():
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
        except Exception as exc:
            self.record_activity(f"workspace prewarm seed skipped: {exc}")

    def _workspace_looks_empty(self, workspace_path: Path) -> bool:
        project_path = workspace_path / "project"
        try:
            if project_path.exists():
                for child in project_path.iterdir():
                    if child.name not in {".venv", ".vscode"}:
                        return False
            return True
        except Exception:
            return False

    def _prewarm_workspace_for_image(self, image: str) -> Path:
        root = Path(os.environ.get("COMPUTEX_PREWARM_ROOT", "C:/computex/cache/prewarm"))
        return root / self._slug_image(image)

    def _slug_image(self, image: str) -> str:
        return "".join(ch if ch.isalnum() else "_" for ch in (image or "image")).strip("_") or "image"

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
