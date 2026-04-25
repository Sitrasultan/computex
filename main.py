import ctypes
import math
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import tkinter as tk
import uuid
from datetime import datetime, timezone
from tkinter import messagebox
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from docker_manager import DockerManager
from host_bridge import HostBridge


def _resource_path(relative_path: str) -> str:
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


class ComputeXHostDashboard(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("ComputeX Host Agent")
        self.geometry("1380x860")
        self.minsize(1160, 760)
        self._set_window_icon()

        self.colors = {
            "bg": "#07111F",
            "panel": "#0D1B2F",
            "card": "#102540",
            "soft": "#163250",
            "stroke": "#234972",
            "text": "#EAF4FF",
            "muted": "#8FA9C9",
            "accent": "#4ED6C5",
            "accent2": "#5FA8FF",
            "ok": "#59E7A8",
            "warn": "#FFCF72",
            "danger": "#FF7A9C",
        }
        self.configure(bg=self.colors["bg"])

        self.docker = DockerManager()
        self.device_id = self._load_device_id()
        self.server_url = os.environ.get("COMPUTEX_SERVER_URL", "http://localhost:8080")
        self.host_secret = os.environ.get("COMPUTEX_HOST_SECRET", "computex_host_secret")
        self.host_label = os.environ.get("COMPUTEX_HOST_LABEL", socket.gethostname())
        self.host_os = platform.system()
        self.machine = self._collect_machine_profile()
        self.account_token = self._load_account_token()
        self.allow_auto_restore = os.environ.get("COMPUTEX_HOST_AUTO_RESTORE", "").strip().lower() in ("1", "true", "yes", "on")
        self.server_device_registered = None
        self.bridge_state = "disconnected"
        self.host_online = True
        self.maintenance_mode = False
        self.account_linking = False
        self.app_started_at = time.time()
        self.last_metric_sample = None
        self.metric_job = None
        self.watch_job = None
        self.startup_image_prepare_thread = None
        self._dashboard_scroll_canvas = None
        self._prestart_after_job = None
        self._prestart_start_time = None
        self._prestart_logo = None

        self.cpu_var = tk.IntVar(value=0)
        self.ram_var = tk.IntVar(value=0)
        self.disk_var = tk.IntVar(value=0)
        self.active_sessions = tk.IntVar(value=0)
        self.queued_sessions = tk.IntVar(value=0)
        self.net_up = tk.StringVar(value="0.0 Mbps")
        self.net_down = tk.StringVar(value="0.0 Mbps")
        self.account_email_var = tk.StringVar(value=os.environ.get("COMPUTEX_ACCOUNT_EMAIL", ""))
        self.account_password_var = tk.StringVar(value="")
        self.account_status_var = tk.StringVar(value="Not linked")
        self.account_detail_var = tk.StringVar(value="Sign in with your ComputeX host account to register this machine.")
        self.status_text_var = tk.StringVar(value="Preparing host agent")

        self.root_container = tk.Frame(self, bg=self.colors["bg"])
        self.root_container.pack(fill="both", expand=True, padx=18, pady=18)
        self.root_container.grid_rowconfigure(0, weight=1)
        self.root_container.grid_columnconfigure(0, weight=1)

        self.host_bridge = HostBridge(
            self.docker,
            on_log=self._log_activity,
            on_state_change=self._on_bridge_state_change,
            host_id=self.device_id,
            secret=self.host_secret,
            server_url=self.server_url,
            label=self.host_label,
            os_name=self.host_os,
            machine_profile=self.machine,
        )

        self._persist_machine_profile()
        self.after(80, self._start_launch_flow)

    def _set_window_icon(self):
        icon_path = _resource_path(os.path.join("assets", "computex.ico"))
        if not os.path.exists(icon_path):
            return
        try:
            self.iconbitmap(icon_path)
        except Exception:
            pass

    def _clear_root(self):
        if self._prestart_after_job:
            self.after_cancel(self._prestart_after_job)
            self._prestart_after_job = None
        self.unbind_all("<MouseWheel>")
        self.unbind_all("<Button-4>")
        self.unbind_all("<Button-5>")
        self._dashboard_scroll_canvas = None
        if self.metric_job:
            self.after_cancel(self.metric_job)
            self.metric_job = None
        if self.watch_job:
            self.after_cancel(self.watch_job)
            self.watch_job = None
        for widget in self.root_container.winfo_children():
            widget.destroy()

    def _card(self, parent, title, body_bg=None):
        bg = body_bg or self.colors["card"]
        outer = tk.Frame(parent, bg=bg, highlightbackground=self.colors["stroke"], highlightthickness=1)
        tk.Label(outer, text=title, bg=bg, fg=self.colors["text"], font=("Segoe UI Semibold", 12)).pack(anchor="w", padx=18, pady=(16, 10))
        inner = tk.Frame(outer, bg=bg)
        inner.pack(fill="both", expand=True, padx=18, pady=(0, 18))
        return outer, inner

    def _button(self, parent, text, command, bg, fg):
        return tk.Button(parent, text=text, command=command, bg=bg, fg=fg, activebackground=bg, activeforeground=fg, relief="flat", bd=0, padx=14, pady=10, cursor="hand2", font=("Segoe UI Semibold", 10))

    def _entry(self, parent, variable, show=None):
        return tk.Entry(parent, textvariable=variable, show=show, bg=self.colors["soft"], fg=self.colors["text"], insertbackground=self.colors["text"], relief="flat", bd=0, font=("Segoe UI", 11))

    def _start_launch_flow(self):
        self._show_prestart_screen()

    def _begin_bootstrap(self):
        self._show_launch_screen()
        threading.Thread(target=self._bootstrap_host, daemon=True).start()

    def _bootstrap_host(self):
        ok, message = self.docker.connect()
        self.after(0, lambda: self._after_bootstrap(ok, message))

    def _after_bootstrap(self, ok, message):
        if not ok:
            self._show_docker_wizard(message, self.docker.last_connect_result.get("requires_manual_start"))
            return
        self._start_startup_image_prepare()
        if self.account_token and self.allow_auto_restore:
            self._show_sign_in_wizard(auto_restore=True)
            self._link_account(token=self.account_token, auto=True, on_success=self._show_dashboard, on_failure=self._restore_failed)
            return
        server_registered = self._check_server_device_registered()
        known_host = self._has_registered_before() if server_registered is None else bool(server_registered or self._has_registered_before())
        self._show_sign_in_wizard(known_host_override=known_host)
        if self.account_token and not self.allow_auto_restore:
            self.account_status_var.set("Sign in required")
            self.account_detail_var.set("Saved host session detected. Enter your email and password to continue.")

    def _restore_failed(self):
        self.account_token = None
        self._save_account_token("")
        self._show_sign_in_wizard()

    def _show_launch_screen(self):
        self._clear_root()
        panel = tk.Frame(self.root_container, bg=self.colors["panel"], highlightbackground=self.colors["stroke"], highlightthickness=1)
        panel.grid(row=0, column=0, sticky="nsew", padx=50, pady=50)
        tk.Label(panel, text="ComputeX Host Agent", bg=self.colors["panel"], fg=self.colors["text"], font=("Segoe UI Semibold", 28)).pack(anchor="w", padx=34, pady=(34, 8))
        tk.Label(
            panel,
            text="Please make sure Docker Engine is running. The Host Agent handles the rest automatically. Once Docker has started, you can minimize or close the Docker window.",
            bg=self.colors["panel"],
            fg=self.colors["muted"],
            justify="left",
            wraplength=920,
            font=("Segoe UI", 12),
        ).pack(anchor="w", padx=34)

    def _show_prestart_screen(self):
        self._clear_root()
        panel = tk.Frame(
            self.root_container,
            bg=self.colors["panel"],
            highlightbackground=self.colors["stroke"],
            highlightthickness=1,
        )
        panel.grid(row=0, column=0, sticky="nsew", padx=32, pady=32)
        panel.grid_columnconfigure(0, weight=1)
        panel.grid_rowconfigure(2, weight=1)

        tk.Label(
            panel,
            text="ComputeX",
            bg=self.colors["panel"],
            fg=self.colors["text"],
            font=("Segoe UI Semibold", 30),
        ).grid(row=0, column=0, pady=(24, 2))
        tk.Label(
            panel,
            text="Host Agent Initialization",
            bg=self.colors["panel"],
            fg=self.colors["muted"],
            font=("Segoe UI", 11),
        ).grid(row=1, column=0, pady=(0, 8))

        canvas = tk.Canvas(
            panel,
            bg=self.colors["panel"],
            highlightthickness=0,
            bd=0,
            width=820,
            height=470,
        )
        canvas.grid(row=2, column=0, sticky="nsew", padx=20, pady=(6, 10))

        self._prestart_start_time = time.time()
        duration_s = 5.6

        logo_path = _resource_path(os.path.join("assets", "computex-preview.png"))
        if os.path.exists(logo_path):
            try:
                logo_image = tk.PhotoImage(file=logo_path)
                target_logo_px = 140
                scale = max(1, int(round(max(logo_image.width(), logo_image.height()) / target_logo_px)))
                self._prestart_logo = logo_image.subsample(scale, scale) if scale > 1 else logo_image
            except Exception:
                self._prestart_logo = None
        else:
            self._prestart_logo = None

        cx = 410
        cy = 235
        rings = [
            canvas.create_oval(0, 0, 0, 0, outline="#2A4D72", width=2),
            canvas.create_oval(0, 0, 0, 0, outline="#2E628F", width=2),
            canvas.create_oval(0, 0, 0, 0, outline="#3E89B8", width=2),
            canvas.create_oval(0, 0, 0, 0, outline="#49B6CC", width=2),
        ]
        sweep = canvas.create_line(cx, cy, cx + 140, cy, fill="#7EDBFF", width=3)
        halo = canvas.create_oval(cx - 82, cy - 82, cx + 82, cy + 82, outline="#5BA5DF", width=3)
        glow = canvas.create_oval(cx - 96, cy - 96, cx + 96, cy + 96, outline="#2E5677", width=2)
        progress_track = canvas.create_rectangle(250, 390, 570, 402, outline="#274966", width=1)
        progress_fill = canvas.create_rectangle(252, 392, 252, 400, outline="", fill="#4ED6C5")
        loading_text = canvas.create_text(
            cx,
            432,
            text="Synchronizing host systems",
            fill="#9BC2EA",
            font=("Segoe UI", 11),
        )

        if self._prestart_logo:
            logo = canvas.create_image(cx, cy, image=self._prestart_logo)
            logo_text = None
        else:
            logo = None
            logo_text = canvas.create_text(
                cx,
                cy,
                text="CX",
                fill="#EAF4FF",
                font=("Segoe UI Semibold", 44),
            )

        def animate():
            elapsed = time.time() - self._prestart_start_time
            progress = min(1.0, elapsed / duration_s)
            cw = max(640, canvas.winfo_width())
            ch = max(360, canvas.winfo_height())
            cx = cw / 2
            cy = (ch / 2) - 26

            for idx, ring in enumerate(rings):
                radius = 88 + (idx * 26) + (math.sin((elapsed * 2.3) + idx) * 6)
                canvas.coords(ring, cx - radius, cy - radius, cx + radius, cy + radius)

            halo_radius = 83 + (math.sin(elapsed * 4.4) * 5)
            glow_radius = 96 + (math.sin(elapsed * 3.1) * 4)
            canvas.coords(halo, cx - halo_radius, cy - halo_radius, cx + halo_radius, cy + halo_radius)
            canvas.coords(glow, cx - glow_radius, cy - glow_radius, cx + glow_radius, cy + glow_radius)

            angle = elapsed * 3.2
            sweep_x = cx + math.cos(angle) * 162
            sweep_y = cy + math.sin(angle) * 162
            canvas.coords(sweep, cx, cy, sweep_x, sweep_y)

            track_left = cx - 160
            track_right = cx + 160
            track_top = cy + 178
            track_bottom = track_top + 12
            fill_right = track_left + (320 * progress)
            safe_fill_right = max(track_left + 2, fill_right - 2)
            canvas.coords(progress_track, track_left, track_top, track_right, track_bottom)
            canvas.coords(progress_fill, track_left + 2, track_top + 2, safe_fill_right, track_bottom - 2)
            canvas.coords(loading_text, cx, track_bottom + 30)

            y_shift = math.sin(elapsed * 3.6) * 3
            if logo:
                canvas.coords(logo, cx, cy + y_shift)
            if logo_text:
                canvas.coords(logo_text, cx, cy + y_shift)

            if progress < 0.35:
                canvas.itemconfig(loading_text, text="Synchronizing host systems")
            elif progress < 0.7:
                canvas.itemconfig(loading_text, text="Warming container runtime")
            else:
                canvas.itemconfig(loading_text, text="Finalizing startup sequence")

            if progress >= 1.0:
                self._prestart_after_job = None
                self._begin_bootstrap()
                return

            self._prestart_after_job = self.after(33, animate)

        animate()

    def _wizard_shell(self, step_title, subtitle, step_no):
        self._clear_root()
        shell = tk.Frame(self.root_container, bg=self.colors["bg"])
        shell.grid(row=0, column=0, sticky="nsew")
        shell.grid_columnconfigure(0, weight=1)
        shell.grid_columnconfigure(1, weight=1)
        shell.grid_rowconfigure(0, weight=1)
        left = tk.Frame(shell, bg=self.colors["panel"], highlightbackground=self.colors["stroke"], highlightthickness=1)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        right = tk.Frame(shell, bg=self.colors["bg"])
        right.grid(row=0, column=1, sticky="nsew", padx=(12, 0))
        tk.Label(left, text=step_title, bg=self.colors["panel"], fg=self.colors["text"], font=("Segoe UI Semibold", 24)).pack(anchor="w", padx=28, pady=(28, 8))
        tk.Label(left, text=subtitle, bg=self.colors["panel"], fg=self.colors["muted"], wraplength=520, justify="left", font=("Segoe UI", 11)).pack(anchor="w", padx=28)
        step_row = tk.Frame(left, bg=self.colors["panel"])
        step_row.pack(anchor="w", padx=28, pady=24)
        for idx, label in enumerate(["Docker", "Host Sign-In", "Launch"]):
            active = idx + 1 <= step_no
            tk.Label(step_row, text=f"{idx + 1}. {label}", bg=self.colors["accent2"] if active else self.colors["soft"], fg="#041626" if active else self.colors["muted"], font=("Segoe UI Semibold", 10), padx=12, pady=6).pack(side="left", padx=(0, 8))
        return left, right

    def _show_docker_wizard(self, message="", prompt_manual=False):
        self.host_bridge.stop()
        _, right = self._wizard_shell("Step 1: Prepare Docker", "ComputeX sessions run in Docker isolation. If Docker cannot be opened automatically, we ask the user to start Docker Desktop and leave it running.", 1)
        card, body = self._card(right, "Docker readiness")
        card.pack(fill="x", pady=(0, 14))
        self.setup_status = tk.Label(body, text=message or "Checking Docker Desktop...", bg=self.colors["card"], fg=self.colors["warn"], justify="left", wraplength=520, font=("Segoe UI Semibold", 10))
        self.setup_status.pack(anchor="w", pady=(0, 12))
        prompt = "Please start the Docker app yourself and leave it open, then click Retry Docker." if prompt_manual else "If Docker is still booting, give it a moment and retry."
        tk.Label(body, text=prompt, bg=self.colors["card"], fg=self.colors["muted"], wraplength=520, justify="left", font=("Segoe UI", 10)).pack(anchor="w", pady=(0, 14))
        row = tk.Frame(body, bg=self.colors["card"])
        row.pack(anchor="w")
        self._button(row, "Retry Docker", self._retry_docker, self.colors["accent"], "#052019").pack(side="left", padx=(0, 10))
        self._button(row, "Refresh Machine Info", self._refresh_machine_info, self.colors["accent2"], "#051628").pack(side="left")
        self._wizard_info(right)
        if prompt_manual:
            self.after(120, lambda: messagebox.showinfo("Start Docker Desktop", "Please open Docker Desktop manually and leave it running, then return here and click Retry Docker."))

    def _show_sign_in_wizard(self, auto_restore=False, known_host_override=None):
        self.host_bridge.stop()
        known_host = self._has_registered_before() if known_host_override is None else bool(known_host_override)
        step_title = "Step 2: Sign In To Continue" if known_host else "Step 2: Sign In To Register This Host"
        step_subtitle = (
            "This device is already registered. Sign in to continue to the host dashboard."
            if known_host
            else "First-time setup: sign in with your ComputeX host account to register this machine."
        )
        _, right = self._wizard_shell(step_title, step_subtitle, 2)
        if not auto_restore:
            self.account_status_var.set("Sign in")
            self.account_detail_var.set(
                "Sign in to your ComputeX host account." if known_host else "Sign in with your ComputeX host account to register this machine."
            )
        card, body = self._card(right, "ComputeX host account")
        card.pack(fill="x", pady=(0, 14))
        tk.Label(body, text="Email", bg=self.colors["card"], fg=self.colors["muted"], font=("Segoe UI", 10)).pack(anchor="w", pady=(0, 4))
        self.signin_email = self._entry(body, self.account_email_var)
        self.signin_email.pack(fill="x", pady=(0, 10))
        tk.Label(body, text="Password", bg=self.colors["card"], fg=self.colors["muted"], font=("Segoe UI", 10)).pack(anchor="w", pady=(0, 4))
        self.signin_password = self._entry(body, self.account_password_var, show="*")
        self.signin_password.pack(fill="x", pady=(0, 10))
        self.account_status_label = tk.Label(body, textvariable=self.account_status_var, bg=self.colors["card"], fg=self.colors["accent2"], font=("Segoe UI Semibold", 10))
        self.account_status_label.pack(anchor="w", pady=(2, 2))
        tk.Label(body, textvariable=self.account_detail_var, bg=self.colors["card"], fg=self.colors["muted"], wraplength=520, justify="left", font=("Segoe UI", 10)).pack(anchor="w", pady=(0, 14))
        row = tk.Frame(body, bg=self.colors["card"])
        row.pack(anchor="w")
        self.signin_button = self._button(row, "Sign In" if known_host else "Sign In And Register Host", self._manual_sign_in, self.colors["accent"], "#052019")
        self.signin_button.pack(side="left", padx=(0, 10))
        self._button(row, "Back To Docker", lambda: self._show_docker_wizard("Return to Docker setup if the engine is not ready yet."), self.colors["accent2"], "#051628").pack(side="left")
        if auto_restore:
            self.account_status_var.set("Restoring session")
            self.account_detail_var.set("Trying your saved token so you do not have to sign in again.")
            self.signin_button.config(state="disabled")
        self._wizard_info(right)

    def _wizard_info(self, parent):
        profile_card, profile = self._card(parent, "Host profile for this machine")
        profile_card.pack(fill="x", pady=(0, 14))
        rows = [("Hostname", self.machine["hostname"]), ("OS", self.machine["os"]), ("CPU", self.machine["cpu"]), ("Memory", f'{self.machine["ram_gb"]} GB'), ("Disk free", f'{self.machine["disk_free_gb"]} GB / {self.machine["disk_total_gb"]} GB')]
        for key, value in rows:
            row = tk.Frame(profile, bg=self.colors["card"])
            row.pack(fill="x", pady=4)
            tk.Label(row, text=key, bg=self.colors["card"], fg=self.colors["muted"], font=("Segoe UI", 10)).pack(side="left")
            tk.Label(row, text=value, bg=self.colors["card"], fg=self.colors["text"], font=("Segoe UI Semibold", 10)).pack(side="right")
        promise_card, promise = self._card(parent, "What the host agent handles")
        promise_card.pack(fill="x")
        for item in ["Links this machine to the signed-in ComputeX host account on first sign-in.", "Sends heartbeat updates with CPU, RAM, disk, sessions, and status.", "Listens for task commands and starts or cleans up Docker-based sessions."]:
            tk.Label(promise, text=item, bg=self.colors["card"], fg=self.colors["text"], wraplength=520, justify="left", font=("Segoe UI", 10)).pack(anchor="w", pady=4)

    def _manual_sign_in(self):
        self._link_account(on_success=self._show_dashboard)

    def _retry_docker(self):
        self.setup_status.config(text="Retrying Docker connection...")
        threading.Thread(target=self._retry_docker_bg, daemon=True).start()

    def _retry_docker_bg(self):
        ok, msg = self.docker.connect()
        self.after(0, lambda: self._after_retry(ok, msg))

    def _after_retry(self, ok, msg):
        if ok:
            self._start_startup_image_prepare()
            self._log_activity("Docker engine connected")
            server_registered = self._check_server_device_registered()
            known_host = self._has_registered_before() if server_registered is None else bool(server_registered or self._has_registered_before())
            self._show_sign_in_wizard(known_host_override=known_host)
            return
        self.setup_status.config(text=msg)
        if self.docker.last_connect_result.get("requires_manual_start"):
            messagebox.showinfo("Docker Desktop Required", "Please start Docker Desktop and leave it open, then click Retry Docker again.")

    def _refresh_machine_info(self):
        self.machine = self._collect_machine_profile()
        self._persist_machine_profile()
        self._show_docker_wizard(self.setup_status.cget("text") if hasattr(self, "setup_status") else "")

    def _show_dashboard(self):
        self._clear_root()

        shell = tk.Frame(self.root_container, bg=self.colors["bg"])
        shell.grid(row=0, column=0, sticky="nsew")
        shell.grid_rowconfigure(0, weight=1)
        shell.grid_columnconfigure(0, weight=1)

        dashboard_canvas = tk.Canvas(shell, bg=self.colors["bg"], highlightthickness=0, bd=0)
        dashboard_canvas.grid(row=0, column=0, sticky="nsew")
        scroll = tk.Scrollbar(shell, orient="vertical", command=dashboard_canvas.yview)
        scroll.grid(row=0, column=1, sticky="ns")
        dashboard_canvas.configure(yscrollcommand=scroll.set)

        root = tk.Frame(dashboard_canvas, bg=self.colors["bg"])
        root_window = dashboard_canvas.create_window((0, 0), window=root, anchor="nw")

        def _is_descendant(widget, ancestor):
            current = widget
            while current is not None:
                if current == ancestor:
                    return True
                current = current.master
            return False

        def _sync_dashboard_scrollregion(_event=None):
            dashboard_canvas.configure(scrollregion=dashboard_canvas.bbox("all"))

        def _sync_dashboard_width(event):
            dashboard_canvas.itemconfigure(root_window, width=event.width)

        def _dashboard_mousewheel(event):
            if not _is_descendant(event.widget, root):
                return
            if event.delta:
                step = -int(event.delta / 120)
            elif getattr(event, "num", None) == 4:
                step = -1
            elif getattr(event, "num", None) == 5:
                step = 1
            else:
                step = 0
            if step:
                dashboard_canvas.yview_scroll(step, "units")
                return "break"

        root.bind("<Configure>", _sync_dashboard_scrollregion)
        dashboard_canvas.bind("<Configure>", _sync_dashboard_width)
        self.bind_all("<MouseWheel>", _dashboard_mousewheel)
        self.bind_all("<Button-4>", _dashboard_mousewheel)
        self.bind_all("<Button-5>", _dashboard_mousewheel)
        self._dashboard_scroll_canvas = dashboard_canvas

        root.grid_columnconfigure(0, weight=1)
        root.grid_rowconfigure(2, weight=1)

        hero = tk.Frame(root, bg=self.colors["panel"], highlightbackground=self.colors["stroke"], highlightthickness=1)
        hero.grid(row=0, column=0, sticky="ew")
        hero.grid_columnconfigure(0, weight=1)
        tk.Label(hero, text="ComputeX Host Control Center", bg=self.colors["panel"], fg=self.colors["text"], font=("Segoe UI Semibold", 26)).grid(row=0, column=0, sticky="w", padx=24, pady=(22, 6))
        tk.Label(hero, text="Docker isolation, host registration, heartbeat, and task listener status in one place.", bg=self.colors["panel"], fg=self.colors["muted"], font=("Segoe UI", 11)).grid(row=1, column=0, sticky="w", padx=24)
        self.meta_label = tk.Label(hero, text="", bg=self.colors["panel"], fg=self.colors["accent2"], font=("Segoe UI Semibold", 10))
        self.meta_label.grid(row=2, column=0, sticky="w", padx=24, pady=(10, 22))
        right = tk.Frame(hero, bg=self.colors["panel"])
        right.grid(row=0, column=1, rowspan=3, sticky="e", padx=24, pady=20)
        tk.Label(right, text="Host status", bg=self.colors["panel"], fg=self.colors["muted"], font=("Segoe UI", 10)).pack(anchor="e")
        self.status_chip = tk.Label(right, text="", bg="#163528", fg=self.colors["ok"], font=("Segoe UI Semibold", 11), padx=14, pady=6)
        self.status_chip.pack(anchor="e", pady=(6, 8))
        tk.Label(right, textvariable=self.status_text_var, bg=self.colors["panel"], fg=self.colors["text"], justify="right", font=("Segoe UI", 10)).pack(anchor="e")

        stats = tk.Frame(root, bg=self.colors["bg"])
        stats.grid(row=1, column=0, sticky="ew", pady=(16, 0))
        for i in range(4):
            stats.grid_columnconfigure(i, weight=1)
        self.availability_value = self._stat_tile(stats, 0, "Availability")
        self.sessions_value = self._stat_tile(stats, 1, "Active Sessions")
        self.resource_value = self._stat_tile(stats, 2, "Resource Load")
        self.bridge_value = self._stat_tile(stats, 3, "Agent Link")

        lower = tk.Frame(root, bg=self.colors["bg"])
        lower.grid(row=2, column=0, sticky="nsew", pady=(16, 0))
        lower.grid_columnconfigure(0, weight=3)
        lower.grid_columnconfigure(1, weight=2)
        lower.grid_rowconfigure(0, weight=1)

        left = tk.Frame(lower, bg=self.colors["bg"])
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        right_col = tk.Frame(lower, bg=self.colors["bg"])
        right_col.grid(row=0, column=1, sticky="nsew", padx=(10, 0))
        left.grid_columnconfigure(0, weight=1)
        left.grid_columnconfigure(1, weight=1)
        right_col.grid_columnconfigure(0, weight=1)
        left.grid_rowconfigure(1, weight=1)
        right_col.grid_rowconfigure(2, weight=1)

        orch_card, orch = self._card(left, "Host orchestration")
        orch_card.grid(row=0, column=0, sticky="ew", padx=(0, 8), pady=(0, 12))
        machine_card, machine = self._card(left, "Machine profile")
        machine_card.grid(row=0, column=1, sticky="ew", padx=(8, 0), pady=(0, 12))
        tele_card, tele = self._card(left, "Live resource heartbeat")
        tele_card.grid(row=1, column=0, columnspan=2, sticky="nsew")
        session_card, session = self._card(right_col, "Sessions and isolation")
        session_card.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        security_card, security = self._card(right_col, "Safety and cleanup")
        security_card.grid(row=1, column=0, sticky="ew", pady=(0, 12))
        activity_card, activity = self._card(right_col, "Activity feed")
        activity_card.grid(row=2, column=0, sticky="nsew")

        row = tk.Frame(orch, bg=self.colors["card"])
        row.pack(anchor="w", pady=(0, 10))
        self.host_toggle_btn = self._button(row, "Pause Hosting", self._toggle_hosting, self.colors["danger"], "#FFFFFF")
        self.host_toggle_btn.pack(side="left", padx=(0, 10))
        self.maintenance_btn = self._button(row, "Enable Maintenance", self._toggle_maintenance, self.colors["warn"], "#291A00")
        self.maintenance_btn.pack(side="left")
        self.account_badge = tk.Label(orch, text="", bg=self.colors["soft"], fg=self.colors["accent2"], font=("Segoe UI Semibold", 10), padx=12, pady=8)
        self.account_badge.pack(anchor="w", pady=(0, 8))
        self.runtime_label = tk.Label(orch, text="", bg=self.colors["card"], fg=self.colors["text"], justify="left", wraplength=420, font=("Segoe UI", 10))
        self.runtime_label.pack(anchor="w")

        self.machine_labels = {}
        for label, key in [("Hostname", "hostname"), ("OS", "os"), ("CPU", "cpu"), ("Memory", "ram_gb"), ("Disk", "disk_total_gb")]:
            line = tk.Frame(machine, bg=self.colors["card"])
            line.pack(fill="x", pady=4)
            tk.Label(line, text=label, bg=self.colors["card"], fg=self.colors["muted"], font=("Segoe UI", 10)).pack(side="left")
            value = tk.Label(line, text="", bg=self.colors["card"], fg=self.colors["text"], font=("Segoe UI Semibold", 10))
            value.pack(side="right")
            self.machine_labels[key] = value

        self._meter(tele, "CPU usage", self.cpu_var, self.colors["accent"]).pack(fill="x", pady=6)
        self._meter(tele, "RAM usage", self.ram_var, self.colors["accent2"]).pack(fill="x", pady=6)
        self._meter(tele, "Disk usage", self.disk_var, self.colors["warn"]).pack(fill="x", pady=6)
        self.network_label = tk.Label(tele, text="", bg=self.colors["card"], fg=self.colors["muted"], font=("Segoe UI", 10))
        self.network_label.pack(anchor="w", pady=(8, 0))

        self.session_label = tk.Label(session, text="", bg=self.colors["card"], fg=self.colors["text"], justify="left", wraplength=360, font=("Segoe UI", 10))
        self.session_label.pack(anchor="w", pady=(0, 8))
        self.session_hint = tk.Label(session, text="", bg=self.colors["card"], fg=self.colors["muted"], justify="left", wraplength=360, font=("Segoe UI", 10))
        self.session_hint.pack(anchor="w")

        self.security_labels = []
        for _ in range(4):
            lbl = tk.Label(security, text="", bg=self.colors["card"], fg=self.colors["text"], justify="left", wraplength=360, font=("Segoe UI", 10))
            lbl.pack(anchor="w", pady=4)
            self.security_labels.append(lbl)

        self.activity_list = tk.Listbox(activity, height=10, bg=self.colors["soft"], fg=self.colors["text"], selectbackground=self.colors["accent2"], selectforeground="#041626", highlightbackground=self.colors["stroke"], highlightthickness=1, bd=0, font=("Consolas", 10))
        self.activity_list.pack(fill="both", expand=True)
        for item in self.docker.get_saved_activity()[:20]:
            self.activity_list.insert("end", item)

        self._refresh_container_counts()
        self._start_host_bridge()
        self._refresh_dashboard()
        self._tick_metrics()
        self._watch_docker()

    def _stat_tile(self, parent, column, title):
        tile = tk.Frame(parent, bg=self.colors["card"], highlightbackground=self.colors["stroke"], highlightthickness=1)
        tile.grid(row=0, column=column, sticky="ew", padx=(0 if column == 0 else 8, 0))
        tk.Label(tile, text=title, bg=self.colors["card"], fg=self.colors["muted"], font=("Segoe UI", 10)).pack(anchor="w", padx=18, pady=(16, 6))
        value = tk.Label(tile, text="...", bg=self.colors["card"], fg=self.colors["text"], font=("Segoe UI Semibold", 20))
        value.pack(anchor="w", padx=18, pady=(0, 16))
        return value

    def _ensure_requests(self):
        try:
            import requests  # type: ignore
            return requests, None
        except Exception:
            pass
        try:
            subprocess.run([os.environ.get("PYTHON", "python"), "-m", "pip", "install", "requests", "--disable-pip-version-check", "--no-input"], check=False, capture_output=True, text=True, timeout=180)
        except Exception as exc:
            return None, f"requests install failed: {exc}"
        try:
            import requests  # type: ignore
            return requests, None
        except Exception as exc:
            return None, f"requests import failed: {exc}"

    def _link_account(self, token=None, auto=False, on_success=None, on_failure=None):
        if self.account_linking:
            return
        self.account_linking = True
        first_link = not self._has_registered_before() and not token
        self.account_status_var.set("Registering host" if first_link else "Signing in")
        self.account_detail_var.set(
            "Creating the first host registration for this machine."
            if first_link
            else "Signing in to your ComputeX host account."
        )
        if hasattr(self, "signin_button"):
            self.signin_button.config(state="disabled")

        def task():
            try:
                requests, err = self._ensure_requests()
                if not requests:
                    raise RuntimeError(err or "Requests library unavailable")
                auth_token = token
                if not auth_token:
                    email = self.account_email_var.get().strip()
                    password = self.account_password_var.get().strip()
                    if not email or not password:
                        raise RuntimeError("Enter both email and password")
                    response = requests.post(f"{self.server_url}/api/auth/login", json={"email": email, "password": password, "deviceId": self.device_id, "label": self.host_label, "os": self.host_os}, timeout=30)
                    if response.status_code != 200:
                        raise RuntimeError(response.text[:180])
                    auth_token = response.json().get("token")
                    if not auth_token:
                        raise RuntimeError("No auth token returned")
                else:
                    response = requests.post(f"{self.server_url}/api/hosts/agent/link", json={"deviceId": self.device_id, "label": self.host_label, "os": self.host_os}, headers={"Authorization": f"Bearer {auth_token}"}, timeout=30)
                    if response.status_code != 200:
                        raise RuntimeError(response.text[:180])
                self.account_token = auth_token
                self._save_account_token(auth_token)
                self.server_device_registered = True
                state = self.docker.get_state()
                state["host_registered_once"] = True
                state["linked_account_email"] = self.account_email_var.get().strip() or state.get("linked_account_email")
                self.docker.state_store.save(state)
                self.after(0, lambda: self.account_status_var.set("Host registered" if first_link else "Signed in"))
                self.after(0, lambda: self.account_detail_var.set("This machine is now linked to your ComputeX host account." if first_link else "Signed in successfully. Restoring your host session."))
                self._log_activity("Host registered to ComputeX account" if first_link else "Signed in to ComputeX host account")
                if on_success:
                    self.after(220, on_success)
            except Exception as exc:
                msg = str(exc)
                self.after(0, lambda: self.account_status_var.set("Link failed"))
                self.after(0, lambda: self.account_detail_var.set(msg))
                self._log_activity(f"Host registration failed: {msg}")
                if auto and on_failure:
                    self.after(0, on_failure)
            finally:
                self.account_linking = False
                self.after(0, self._unlock_sign_in)

        threading.Thread(target=task, daemon=True).start()

    def _unlock_sign_in(self):
        if hasattr(self, "signin_button"):
            self.signin_button.config(state="normal")

    def _has_registered_before(self):
        state = self.docker.get_state()
        return bool(state.get("host_registered_once") or state.get("linked_account_email") or self.account_token or self.server_device_registered)

    def _check_server_device_registered(self, timeout=3):
        try:
            query = urlencode({"deviceId": self.device_id})
            url = f"{self.server_url.rstrip('/')}/api/hosts/agent/device-status?{query}"
            req = Request(
                url,
                headers={"Authorization": f"Bearer {self.host_secret}"},
                method="GET",
            )
            with urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8") or "{}")
            registered = bool(payload.get("registered"))
            self.server_device_registered = registered
            if registered:
                state = self.docker.get_state()
                state["host_registered_once"] = True
                self.docker.state_store.save(state)
            return registered
        except Exception:
            return None

    def _collect_machine_profile(self):
        disk_total, disk_free = self._disk_usage()
        return {
            "hostname": socket.gethostname(),
            "os": f"{platform.system()} {platform.release()}",
            "cpu": platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER") or "Unknown CPU",
            "ram_gb": self._total_ram_gb(),
            "disk_total_gb": disk_total,
            "disk_free_gb": disk_free,
        }

    def _total_ram_gb(self):
        try:
            import psutil  # type: ignore
            return max(1, int(round(psutil.virtual_memory().total / (1024 ** 3))))
        except Exception:
            pass
        try:
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return max(1, int(round(stat.ullTotalPhys / (1024 ** 3))))
        except Exception:
            return 8

    def _available_ram_gb(self):
        try:
            import psutil  # type: ignore
            return psutil.virtual_memory().available / (1024 ** 3)
        except Exception:
            return float(self._total_ram_gb())

    def _disk_usage(self):
        try:
            total, _, free = shutil.disk_usage(os.path.abspath(os.sep))
            return int(round(total / (1024 ** 3))), int(round(free / (1024 ** 3)))
        except Exception:
            return 256, 128

    def _sample_metrics(self):
        try:
            import psutil  # type: ignore
            cpu = int(round(psutil.cpu_percent(interval=None)))
            ram = int(round(psutil.virtual_memory().percent))
            disk = int(round(psutil.disk_usage(os.path.abspath(os.sep)).percent))
            now = time.time()
            net = psutil.net_io_counters()
            if self.last_metric_sample:
                prev_time, prev_sent, prev_recv = self.last_metric_sample
                elapsed = max(1e-6, now - prev_time)
                up = ((net.bytes_sent - prev_sent) * 8) / elapsed / 1_000_000
                down = ((net.bytes_recv - prev_recv) * 8) / elapsed / 1_000_000
            else:
                up, down = 0.0, 0.0
            self.last_metric_sample = (now, net.bytes_sent, net.bytes_recv)
            return cpu, ram, disk, f"{up:.1f} Mbps", f"{down:.1f} Mbps"
        except Exception:
            total_disk, free_disk = self._disk_usage()
            used_disk = 0 if total_disk == 0 else int(round(((total_disk - free_disk) / total_disk) * 100))
            ram = int(round((1 - (self._available_ram_gb() / max(1, self.machine["ram_gb"]))) * 100))
            return self.cpu_var.get(), max(0, min(100, ram)), used_disk, self.net_up.get(), self.net_down.get()

    def _tick_metrics(self):
        cpu, ram, disk, up, down = self._sample_metrics()
        self.cpu_var.set(max(0, min(100, cpu)))
        self.ram_var.set(max(0, min(100, ram)))
        self.disk_var.set(max(0, min(100, disk)))
        self.net_up.set(up)
        self.net_down.set(down)
        self._refresh_container_counts()
        self._refresh_dashboard()
        if self.account_token:
            self.host_bridge.send_telemetry({"cpu": self.cpu_var.get(), "ram": self.ram_var.get(), "disk": self.disk_var.get(), "net_up": up, "net_down": down, "status": self._host_status_key(), "activeSessions": self.active_sessions.get(), "hostname": self.machine["hostname"]})
        self.metric_job = self.after(5000, self._tick_metrics)

    def _watch_docker(self):
        if not self.docker.ping():
            self._show_docker_wizard("Docker connection was lost. Please start Docker Desktop and leave it open, then retry.", True)
            return
        self.watch_job = self.after(5000, self._watch_docker)

    def _start_host_bridge(self):
        if self.account_token:
            self.host_bridge.start()

    def _refresh_container_counts(self):
        containers = self.docker.list_computex_containers(include_stopped=True)
        running = sum(1 for c in containers if getattr(c, "status", "") == "running")
        self.active_sessions.set(running)
        self.queued_sessions.set(max(0, len(containers) - running))

    def _refresh_dashboard(self):
        if not hasattr(self, "status_chip"):
            return
        status, bg, fg = self._host_status_view()
        self.status_chip.config(text=status, bg=bg, fg=fg)
        self.status_text_var.set(self._status_detail())
        self.meta_label.config(text=f"{self.host_label}  |  {self.device_id}  |  Coordinator: {self.bridge_state.replace('_', ' ').title()}")
        self.availability_value.config(text=status)
        self.sessions_value.config(text=str(self.active_sessions.get()))
        self.resource_value.config(text=f"{self.cpu_var.get()}% / {self.ram_var.get()}%")
        self.bridge_value.config(text=self.bridge_state.replace("_", " ").title())
        account_email = self.account_email_var.get().strip() or self.docker.get_state().get("linked_account_email") or "Saved ComputeX account"
        self.account_badge.config(text=f"Registered account: {account_email}")
        mins = int((time.time() - self.app_started_at) / 60)
        self.runtime_label.config(text=f"Host uptime {mins // 60}h {mins % 60:02d}m. Task listener is {self.bridge_state.replace('_', ' ')} and Docker cleanup only touches ComputeX containers.")
        self.session_label.config(text=f"Running sessions: {self.active_sessions.get()}  |  Pending containers: {self.queued_sessions.get()}")
        self.session_hint.config(text="New tasks shift the host from available to busy. Ending a session removes the ComputeX container so user data does not linger on the host.")
        for lbl, text in zip(self.security_labels, [f"Docker isolation: {'ready' if self.docker.client else 'waiting for Docker'}", "Registration gate: dashboard unlocks only after ComputeX sign-in succeeds", "Auto cleanup: ComputeX session containers are stopped and removed on session end", f"Heartbeat payload: CPU {self.cpu_var.get()}%, RAM {self.ram_var.get()}%, status {self._host_status_key()}"]):
            lbl.config(text=text)
        self.network_label.config(text=f"Network heartbeat: up {self.net_up.get()}  |  down {self.net_down.get()}")
        self._refresh_machine_labels()

    def _refresh_machine_labels(self):
        if not hasattr(self, "machine_labels"):
            return
        self.machine_labels["hostname"].config(text=self.machine["hostname"])
        self.machine_labels["os"].config(text=self.machine["os"])
        self.machine_labels["cpu"].config(text=self.machine["cpu"])
        self.machine_labels["ram_gb"].config(text=f'{self.machine["ram_gb"]} GB')
        self.machine_labels["disk_total_gb"].config(text=f'{self.machine["disk_free_gb"]} GB free / {self.machine["disk_total_gb"]} GB')

    def _host_status_key(self):
        if not self.host_online:
            return "offline"
        if self.maintenance_mode:
            return "maintenance"
        if self.active_sessions.get() > 0:
            return "busy"
        return "available"

    def _host_status_view(self):
        status = self._host_status_key()
        if status == "offline":
            return "Offline", "#382132", self.colors["danger"]
        if status == "maintenance":
            return "Maintenance", "#3B3317", self.colors["warn"]
        if status == "busy":
            return "Busy", "#182E45", self.colors["accent2"]
        return "Available", "#163528", self.colors["ok"]

    def _status_detail(self):
        mapping = {
            "offline": "Hosting is paused. No new sessions will be accepted until you resume the host.",
            "maintenance": "Maintenance mode is enabled. Finish your checks, then return the host to service.",
            "busy": "An active ComputeX session is running in Docker isolation and heartbeats continue while it is busy.",
            "available": "Host is connected, linked to your ComputeX account, and ready to accept new tasks.",
        }
        return mapping[self._host_status_key()]

    def _toggle_hosting(self):
        self.host_online = not self.host_online
        self.host_toggle_btn.config(text="Resume Hosting" if not self.host_online else "Pause Hosting", bg=self.colors["ok"] if not self.host_online else self.colors["danger"], fg="#072013" if not self.host_online else "#FFFFFF")
        self._log_activity("Host resumed hosting" if self.host_online else "Host paused hosting")
        self._refresh_dashboard()

    def _toggle_maintenance(self):
        self.maintenance_mode = not self.maintenance_mode
        self.maintenance_btn.config(text="Disable Maintenance" if self.maintenance_mode else "Enable Maintenance")
        self._log_activity("Maintenance mode enabled" if self.maintenance_mode else "Maintenance mode disabled")
        self._refresh_dashboard()

    def _on_bridge_state_change(self, state):
        self.bridge_state = state
        self.after(0, self._refresh_dashboard)

    def _meter(self, parent, title, variable, color):
        box = tk.Frame(parent, bg=self.colors["card"])
        head = tk.Frame(box, bg=self.colors["card"])
        head.pack(fill="x")
        tk.Label(head, text=title, bg=self.colors["card"], fg=self.colors["muted"], font=("Segoe UI", 10)).pack(side="left")
        value = tk.Label(head, text="0%", bg=self.colors["card"], fg=color, font=("Segoe UI Semibold", 10))
        value.pack(side="right")
        canvas = tk.Canvas(box, height=14, bg=self.colors["soft"], highlightthickness=0, bd=0)
        canvas.pack(fill="x", pady=(6, 0))
        fill = canvas.create_rectangle(0, 0, 0, 14, fill=color, outline="")

        def redraw(*_):
            pct = max(0, min(100, variable.get()))
            value.config(text=f"{pct}%")
            width = max(1, canvas.winfo_width())
            canvas.coords(fill, 0, 0, width * (pct / 100), 14)

        variable.trace_add("write", redraw)
        canvas.bind("<Configure>", lambda _e: redraw())
        redraw()
        return box

    def _log_activity(self, message):
        if threading.current_thread() is not threading.main_thread():
            self.after(0, lambda: self._log_activity(message))
            return
        self.docker.record_activity(message)
        if hasattr(self, "activity_list"):
            ts = datetime.now(timezone.utc).strftime("%H:%M")
            self.activity_list.insert(0, f"{ts}  {message}")
            if self.activity_list.size() > 20:
                self.activity_list.delete(20, "end")

    def _start_startup_image_prepare(self):
        if self.startup_image_prepare_thread and self.startup_image_prepare_thread.is_alive():
            return

        def worker():
            self.after(0, lambda: self._log_activity("Preparing coding images during startup..."))
            ok, msg = self.docker.prepare_coding_images(force=False)
            self.after(0, lambda: self._log_activity(msg if ok else f"Coding image prepare warning: {msg}"))
            self.after(0, lambda: self._log_activity("Preparing coding runtime assets during startup..."))
            assets_ok, assets_msg = self.docker.prepare_coding_runtime_assets(force=False)
            self.after(
                0,
                lambda: self._log_activity(
                    assets_msg if assets_ok else f"Coding runtime asset prepare warning: {assets_msg}"
                ),
            )

        self.startup_image_prepare_thread = threading.Thread(target=worker, daemon=True)
        self.startup_image_prepare_thread.start()

    def _persist_machine_profile(self):
        state = self.docker.get_state()
        state["host_profile"] = self.machine
        self.docker.state_store.save(state)

    def _load_device_id(self):
        path = os.path.join(os.path.expanduser("~"), ".computex_host_id")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    value = fh.read().strip()
                if value:
                    return value
            except Exception:
                pass
        host_id = f"HST-{uuid.uuid4().hex[:12].upper()}"
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(host_id)
        except Exception:
            pass
        return host_id

    def _load_account_token(self):
        path = os.path.join(os.path.expanduser("~"), ".computex_host_token")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    token = fh.read().strip()
                return token or None
            except Exception:
                return None
        return None

    def _save_account_token(self, token):
        path = os.path.join(os.path.expanduser("~"), ".computex_host_token")
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(token or "")
        except Exception:
            pass


if __name__ == "__main__":
    app = ComputeXHostDashboard()
    app.mainloop()
