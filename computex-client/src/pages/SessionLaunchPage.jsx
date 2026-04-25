import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { requestWithFallback } from "../utils/api";
import { emitSessionStart, createAppSocket } from "../utils/socket";
import BrandLogo from "../components/BrandLogo";

const FALLBACK_ENVIRONMENTS = [
  {
    id: "coding",
    icon: "DEV",
    title: "Coding Workspace",
    status: "available",
    description: "VS Code in the browser with Python, Node.js, Git, and a persistent project folder.",
  },
  {
    id: "browser",
    icon: "WEB",
    title: "Web Browser",
    status: "coming_soon",
    description: "Chromium or Firefox in a lightweight desktop tuned for phones and low-end devices.",
  },
  {
    id: "office",
    icon: "DOC",
    title: "Office Tools",
    status: "coming_soon",
    description: "LibreOffice Writer, Calc, and Impress for coursework and general productivity.",
  },
  {
    id: "data",
    icon: "LAB",
    title: "Data Science Lab",
    status: "coming_soon",
    description: "Jupyter notebooks with Python, NumPy, and pandas for analytics workloads.",
  },
  {
    id: "desktop",
    icon: "OS",
    title: "Full Desktop",
    status: "coming_soon",
    description: "A general-purpose XFCE desktop with files, terminal, and extra utilities.",
  },
];

const SESSION_LAUNCH_TIMEOUT_MS = 30 * 60 * 1000;
const CODING_RUNTIME_OPTIONS = [
  {
    key: "clean",
    label: "Clean Code Server",
    description: "Lightweight code-server only for HTML, CSS, JS, and extension-based workflows.",
    payload: {
      preset_key: "clean",
      tools: ["git"],
      image: "computex-clean",
    },
  },
  {
    key: "python",
    label: "Python",
    description: "Python interpreter, venv support, and Python extensions.",
    payload: {
      preset_key: "python",
      tools: ["python", "git"],
      image: "computex-python-interpreter",
    },
  },
  {
    key: "node",
    label: "Node.js",
    description: "Node.js runtime with JavaScript/TypeScript tooling and extensions.",
    payload: {
      preset_key: "node",
      tools: ["node", "git"],
      image: "computex-node-interpreter",
    },
  },
  {
    key: "php",
    label: "PHP",
    description: "PHP runtime with Composer and PHP-focused code-server extensions.",
    payload: {
      preset_key: "php",
      tools: ["php", "git"],
      image: "computex-php-interpreter",
    },
  },
  {
    key: "java",
    label: "Java",
    description: "OpenJDK + Maven + Gradle with Java language tooling extensions.",
    payload: {
      preset_key: "java",
      tools: ["java", "git"],
      image: "computex-java-interpreter",
    },
  },
  {
    key: "cpp",
    label: "C++",
    description: "GCC/Clang toolchains with CMake, GDB, and C/C++ language tooling.",
    payload: {
      preset_key: "cpp",
      tools: ["cpp", "git"],
      image: "computex-cpp-interpreter",
    },
  },
];

const getCodingRuntimeOption = (runtimeKey) =>
  CODING_RUNTIME_OPTIONS.find((option) => option.key === runtimeKey) || CODING_RUNTIME_OPTIONS[0];

function EnvironmentCard({ environment, onLaunch, loading }) {
  const isLive = environment.status === "available";
  const disabled = !isLive || loading;

  return (
    <button
      type="button"
      onClick={() => !disabled && onLaunch(environment)}
      disabled={disabled}
      className={`w-full rounded-3xl border border-white/10 bg-slate-900/50 p-5 text-left transition hover:border-sky-400/40 hover:bg-slate-900/80 ${
        disabled ? "cursor-not-allowed opacity-80" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-lg font-semibold text-sky-300">
            {environment.icon}
          </div>
          <div>
            <div className="text-base font-semibold text-slate-100">{environment.title}</div>
            <div className="mt-1 text-sm leading-6 text-slate-400">{environment.description}</div>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${
            isLive ? "bg-emerald-500 text-white" : "bg-amber-400 text-slate-950"
          }`}
        >
          {isLive ? "Ready" : "Under production"}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {isLive && environment.id === "coding"
            ? "Launches clean VS Code server instantly"
            : isLive
            ? "Launches browser-based app"
            : "Visible on the catalog, not launchable yet"}
        </span>
        <span
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${
            isLive ? "bg-sky-500 text-white" : "bg-slate-300 text-slate-700"
          }`}
        >
          {isLive && loading ? "Starting..." : isLive ? "Open app" : "Soon"}
        </span>
      </div>
    </button>
  );
}

export default function SessionLaunchPage() {
  const navigate = useNavigate();
  const openedLaunchSessionRef = useRef(new Set());
  const [loading, setLoading] = useState(false);
  const [environments, setEnvironments] = useState(FALLBACK_ENVIRONMENTS);
  const [lastLaunch, setLastLaunch] = useState(null);
  const [pendingLaunchSessionId, setPendingLaunchSessionId] = useState(null);
  const [runtimePickerOpen, setRuntimePickerOpen] = useState(false);
  const [selectedRuntime, setSelectedRuntime] = useState("clean");
  const [pendingEnvironment, setPendingEnvironment] = useState(null);

  const openCodeServer = (destination) => {
    if (!destination) return;
    const popup = window.open(destination, "_blank", "noopener,noreferrer");
    if (!popup) {
      alert("Popup blocked by browser. Allow popups and launch again.");
    }
  };

  const openCodeServerForSession = (sessionId, destination) => {
    if (!destination) return;
    if (sessionId && openedLaunchSessionRef.current.has(sessionId)) return;
    if (sessionId) {
      openedLaunchSessionRef.current.add(sessionId);
    }
    openCodeServer(destination);
  };

  useEffect(() => {
    let cancelled = false;

    const loadEnvironments = async () => {
      try {
        const res = await requestWithFallback({
          method: "get",
          url: "/api/session-environments",
        });
        if (cancelled) return;
        const remote = (res.data?.environments || []).map((env) => ({
          ...env,
          icon: FALLBACK_ENVIRONMENTS.find((item) => item.id === env.id)?.icon || "APP",
        }));
        setEnvironments(remote.length ? remote : FALLBACK_ENVIRONMENTS);
      } catch {
        if (!cancelled) {
          setEnvironments(FALLBACK_ENVIRONMENTS);
        }
      }
    };

    loadEnvironments();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return undefined;
    const socket = createAppSocket(token);
    socket.on("client:launch-progress", (payload) => {
      if (!payload?.sessionId || !payload?.access_url) return;
      if (pendingLaunchSessionId !== payload.sessionId) return;
      setPendingLaunchSessionId(null);
      setLastLaunch({
        title: "Coding Workspace",
        accessUrl: payload.access_url,
        password: payload.password || null,
      });
      openCodeServerForSession(payload.sessionId, payload.access_url);
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [pendingLaunchSessionId]);

  const startEnvironment = async (environment, runtimeKey = null) => {
    if (loading || environment.status !== "available") return;

    setLoading(true);
    try {
      const payload = {
        environment: environment.id,
      };
      const runtimeOption =
        environment.id === "coding" ? getCodingRuntimeOption(runtimeKey || selectedRuntime) : null;
      if (environment.id === "coding") {
        payload.preset_key = runtimeOption.payload.preset_key;
        payload.tools = runtimeOption.payload.tools;
        payload.image = runtimeOption.payload.image;
        // Keep launcher sessions runtime-specific and avoid reusing the last saved coding workspace profile.
        payload.skip_workspace = true;
        payload.defer_workspace_save = true;
      }
      const res = await emitSessionStart(payload, SESSION_LAUNCH_TIMEOUT_MS);
      const session = res?.session;
      const launch = res?.launch || {};
      setPendingLaunchSessionId(session?.id || null);

      setLastLaunch({
        title:
          environment.id === "coding" && runtimeOption
            ? `${environment.title} (${runtimeOption.label})`
            : environment.title,
        accessUrl: launch.access_url || session?.access_url || null,
        password: launch.access_password || session?.access_password || null,
      });

      const destination = launch.access_url || session?.access_url;
      if (destination) {
        setPendingLaunchSessionId(null);
        openCodeServerForSession(session?.id || null, destination);
      }
    } catch (error) {
      setPendingLaunchSessionId(null);
      alert(error?.message || "Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchIntent = (environment) => {
    if (loading || environment.status !== "available") return;
    if (environment.id !== "coding") {
      startEnvironment(environment);
      return;
    }
    setPendingEnvironment(environment);
    setRuntimePickerOpen(true);
  };

  const confirmRuntimeAndLaunch = async () => {
    if (!pendingEnvironment) {
      setRuntimePickerOpen(false);
      return;
    }
    const environment = pendingEnvironment;
    const runtime = selectedRuntime;
    setRuntimePickerOpen(false);
    setPendingEnvironment(null);
    await startEnvironment(environment, runtime);
  };

  return (
    <div className="min-h-screen bg-[#020921] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo
              size={34}
              subtitle="Session Launcher"
              textClassName="text-base text-sky-200 dark:text-sky-200"
              className="w-fit"
            />
            <h1 className="mt-2 text-3xl font-bold">Choose Environment</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">Pick an environment to continue into the launch flow.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Back to dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {environments.map((environment) => (
            <EnvironmentCard
              key={environment.id}
              environment={environment}
              onLaunch={handleLaunchIntent}
              loading={loading && environment.id === "coding"}
            />
          ))}
        </div>

        {runtimePickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
            <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
              <div className="text-sm uppercase tracking-[0.2em] text-sky-300/80">Coding Runtime</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-100">Choose Language Runtime</h2>
              <p className="mt-2 text-sm text-slate-400">
                Select which engine should power this new coding session.
              </p>

              <div className="mt-5 max-h-72 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {CODING_RUNTIME_OPTIONS.map((option) => {
                    const active = selectedRuntime === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setSelectedRuntime(option.key)}
                        className={`min-h-[132px] rounded-2xl border px-4 py-4 text-left transition ${
                          active
                            ? "border-sky-400 bg-sky-500/20 text-sky-100"
                            : "border-white/10 bg-white/5 text-slate-200 hover:border-white/30"
                        }`}
                      >
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="mt-1 hidden text-xs text-slate-300 sm:block">{option.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (loading) return;
                    setRuntimePickerOpen(false);
                    setPendingEnvironment(null);
                  }}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRuntimeAndLaunch}
                  disabled={loading}
                  className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? "Starting..." : "Open app"}
                </button>
              </div>
            </div>
          </div>
        )}

        {lastLaunch && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4"
          >
            <div className="text-sm font-semibold">{lastLaunch.title} is starting</div>
            <div className="mt-1 text-xs text-slate-300">
              {lastLaunch.accessUrl ? `Opening ${lastLaunch.accessUrl}` : "Waiting for the host to return the access URL."}
            </div>
            {lastLaunch.password && <div className="mt-1 text-xs text-slate-300">Session password: {lastLaunch.password}</div>}
          </motion.div>
        )}
      </div>
    </div>
  );
}
