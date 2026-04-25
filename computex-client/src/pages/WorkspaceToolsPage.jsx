import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { requestWithFallback } from "../utils/api";
import { createAppSocket, emitSessionStart } from "../utils/socket";
import BrandLogo from "../components/BrandLogo";

const WORKSPACE_REQUEST_TIMEOUT_MS = 15000;
const SESSION_LAUNCH_TIMEOUT_MS = 3 * 60 * 1000;
const SESSION_POLL_REQUEST_TIMEOUT_MS = 1500;
const PYTHON_IMAGE_KEY = "computex-python-interpreter";
const PYTHON_ONLY_TOOLS = new Set(["python", "git"]);
const LOCAL_PRESETS = [
  { key: "python", name: "Python Workspace", tools: ["python", "git"] },
  { key: "node", name: "Web Dev Workspace", tools: ["node", "git"] },
  { key: "flutter", name: "Mobile Dev Workspace", tools: ["flutter", "git"] },
  { key: "fullstack", name: "Fullstack Workspace", tools: ["python", "node", "git", "postgres", "redis"] },
  { key: "data", name: "Data Science Workspace", tools: ["python", "jupyter", "git"] },
  { key: "go", name: "Go Backend Workspace", tools: ["go", "git", "docker"] },
  { key: "rust", name: "Rust Systems Workspace", tools: ["rust", "git", "docker"] },
  { key: "java", name: "Java Workspace", tools: ["java", "git", "docker"] },
  { key: "cpp", name: "C/C++ Workspace", tools: ["cpp", "git", "docker"] },
  { key: "php", name: "PHP Workspace", tools: ["php", "git", "node"] },
  { key: "dotnet", name: ".NET Workspace", tools: ["dotnet", "git", "docker"] },
  { key: "devops", name: "DevOps Workspace", tools: ["docker", "k8s", "git", "node"] },
];
const LOCAL_TOOLS = [
  { id: "python", label: "Python", logo: "PY" },
  { id: "node", label: "Node.js", logo: "ND" },
  { id: "flutter", label: "Flutter", logo: "FL" },
  { id: "git", label: "Git", logo: "GT" },
  { id: "docker", label: "Docker", logo: "DK" },
  { id: "go", label: "Go", logo: "GO" },
  { id: "rust", label: "Rust", logo: "RS" },
  { id: "java", label: "Java", logo: "JV" },
  { id: "cpp", label: "C/C++", logo: "C+" },
  { id: "php", label: "PHP", logo: "PH" },
  { id: "dotnet", label: ".NET", logo: "DN" },
  { id: "jupyter", label: "Jupyter", logo: "JP" },
  { id: "postgres", label: "Postgres", logo: "PG" },
  { id: "redis", label: "Redis", logo: "RD" },
  { id: "k8s", label: "Kubernetes", logo: "K8" },
];
const TOOL_LIMIT = 5;

export default function WorkspaceToolsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isExisting = Boolean(id);
  const openedLaunchSessionRef = useRef(new Set());

  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [name, setName] = useState("Coding Workspace");
  const [presets, setPresets] = useState(LOCAL_PRESETS);
  const [tools] = useState(LOCAL_TOOLS);
  const [selectedPreset, setSelectedPreset] = useState("python");
  const [selectedTools, setSelectedTools] = useState(LOCAL_PRESETS[0]?.tools || []);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastLaunch, setLastLaunch] = useState(null);

  const openCodeServer = (destination) => {
    if (!destination) return;
    const popup = window.open(destination, "_blank", "noopener,noreferrer");
    if (!popup) {
      setErrorMessage("Popup blocked by browser. Allow popups and click Launch again.");
    }
  };

  const presetMap = useMemo(() => {
    return Object.fromEntries(presets.map((preset) => [preset.key, preset]));
  }, [presets]);

  const launchOverSocket = async (payload) =>
    emitSessionStart(
      {
        ...payload,
        async_launch: true,
      },
      SESSION_LAUNCH_TIMEOUT_MS
    );

  useEffect(() => {
    if (!lastLaunch?.pending || !lastLaunch?.sessionId) {
      return undefined;
    }

    let cancelled = false;
    let timerId = null;

    const pollLaunch = async () => {
      try {
        const res = await requestWithFallback({
          method: "get",
          url: `/api/sessions/${lastLaunch.sessionId}`,
          timeout: SESSION_POLL_REQUEST_TIMEOUT_MS,
        });
        if (cancelled) {
          return;
        }
        const session = res?.data?.session;
        if (!session) {
          return;
        }

        const destination = session.access_url || null;
        const password = session.access_password || null;

        if (session.status === "failed" || session.status === "stopped") {
          setErrorMessage("Launch failed before code-server became available.");
          setStatusMessage("");
          setLastLaunch((current) =>
            current?.sessionId === lastLaunch.sessionId ? { ...current, pending: false } : current
          );
          return;
        }

        if (destination) {
          setLastLaunch({
            sessionId: session.id,
            accessUrl: destination,
            password,
            pending: false,
          });
          setStatusMessage("Code-server is ready.");
          if (!openedLaunchSessionRef.current.has(session.id)) {
            openedLaunchSessionRef.current.add(session.id);
            openCodeServer(destination);
          }
          return;
        }

        timerId = setTimeout(pollLaunch, 1000);
      } catch (_error) {
        if (cancelled) {
          return;
        }
        timerId = setTimeout(pollLaunch, 1500);
      }
    };

    setStatusMessage("Launch request accepted. Waiting for the host to start code-server session...");
    pollLaunch();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [lastLaunch?.pending, lastLaunch?.sessionId]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !lastLaunch?.pending || !lastLaunch?.sessionId) {
      return undefined;
    }
    const socket = createAppSocket(token);
    socket.on("client:launch-progress", (payload) => {
      if (!payload?.sessionId || payload.sessionId !== lastLaunch.sessionId || !payload?.access_url) {
        return;
      }
      setLastLaunch({
        sessionId: payload.sessionId,
        accessUrl: payload.access_url,
        password: payload.password || null,
        pending: false,
      });
      setStatusMessage("Code-server is ready.");
      if (!openedLaunchSessionRef.current.has(payload.sessionId)) {
        openedLaunchSessionRef.current.add(payload.sessionId);
        openCodeServer(payload.access_url);
      }
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [lastLaunch?.pending, lastLaunch?.sessionId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage("");
      setStatusMessage("");
      try {
        setPresets(LOCAL_PRESETS);
        setSelectedPreset(LOCAL_PRESETS[0]?.key || "python");
        setSelectedTools(LOCAL_PRESETS[0]?.tools || []);

        if (isExisting) {
          const workspacesRes = await requestWithFallback({
            method: "get",
            url: "/api/workspaces",
            timeout: WORKSPACE_REQUEST_TIMEOUT_MS,
          });
          const list = workspacesRes?.data?.workspaces || [];
          const current = list.find((item) => item.id === id);
          if (!current) {
            throw new Error("Workspace not found");
          }
          setName(current.name || "Coding Workspace");
          setSelectedPreset(current.preset_key || LOCAL_PRESETS[0]?.key || "python");
          if (current.selected_tools && current.selected_tools.length) {
            setSelectedTools(current.selected_tools);
          } else {
            setSelectedTools(LOCAL_PRESETS[0]?.tools || []);
          }
        }
      } catch (error) {
        setErrorMessage(error?.response?.data?.message || error?.message || "Failed to load presets");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isExisting]);

  const saveAndLaunch = async () => {
    const pythonPresetTools = presetMap["python"]?.tools || ["python", "git"];
    const usingCustom = selectedPreset === "custom";
    const customHasPython = selectedTools.includes("python");

    if (selectedPreset !== "python" && !usingCustom) {
      setErrorMessage("Only the Python preset can be launched right now. Pick Python or Custom with Python selected.");
      return;
    }
    if (usingCustom && !customHasPython) {
      setErrorMessage("Select Python in your custom tools to launch for now.");
      return;
    }

    const toolsForSave = usingCustom ? selectedTools : pythonPresetTools;
    const hasExtraTools = usingCustom && toolsForSave.some((tool) => !PYTHON_ONLY_TOOLS.has(tool));

    setErrorMessage("");
    setStatusMessage(hasExtraTools ? "Launching code-server (extra tools saved for later)..." : "Launching code-server...");
    setLaunching(true);
    try {
      setStatusMessage("Launching code-server...");
      const workspacePayload = {
        name,
        type: "coding",
        preset_key: usingCustom ? "custom" : "python",
        tools: toolsForSave,
        image_key: PYTHON_IMAGE_KEY,
      };

      let launchWorkspaceId = id || null;
      if (isExisting) {
        await requestWithFallback({
          method: "patch",
          url: `/api/workspaces/${id}/profile`,
          data: workspacePayload,
          timeout: WORKSPACE_REQUEST_TIMEOUT_MS,
        });
      } else {
        const workspaceRes = await requestWithFallback({
          method: "post",
          url: "/api/workspaces",
          data: workspacePayload,
          timeout: WORKSPACE_REQUEST_TIMEOUT_MS,
        });
        launchWorkspaceId = workspaceRes?.data?.workspace?.id || null;
        if (!launchWorkspaceId) {
          throw new Error("Workspace creation failed");
        }
      }

      const launchPayload = {
        environment: "coding",
        workspace_name: name,
        workspace_id: launchWorkspaceId,
        preset_key: usingCustom ? "custom" : "python",
        tools: toolsForSave,
        image: PYTHON_IMAGE_KEY,
      };
      const launchRes = await launchOverSocket(launchPayload);

      const session = launchRes?.session;
      const launch = launchRes?.launch || {};
      const destination = launch.access_url || session?.access_url;
      const password = launch.access_password || session?.access_password;
      const accepted = Boolean(launchRes?.accepted);

      setLastLaunch({
        sessionId: session?.id || null,
        accessUrl: destination || null,
        password: password || null,
        pending: accepted && !destination,
      });
      if (destination) {
        if (session?.id) {
          openedLaunchSessionRef.current.add(session.id);
        }
        openCodeServer(destination);
        setStatusMessage("Code-server is ready.");
      } else if (accepted) {
        setStatusMessage("Launch request accepted. Waiting for the host to start code-server session...");
      } else {
        setStatusMessage("Waiting for host to return the code-server URL...");
      }
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error?.message || "Launch failed");
      setStatusMessage("");
    } finally {
      setLaunching(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020921] px-4 py-10 text-slate-100 sm:px-6">
        <div className="mx-auto max-w-4xl text-sm text-slate-400">Loading presets...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020921] px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandLogo
              size={34}
              subtitle="Workspace Tools"
              textClassName="text-base text-sky-200 dark:text-sky-200"
              className="w-fit"
            />
            <h1 className="mt-2 text-3xl font-bold">{isExisting ? "Update Workspace" : "Create Workspace"}</h1>
            <p className="mt-1 text-sm text-slate-400">Choose a preset and launch code-server.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/workspaces")}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Back to workspaces
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
            {errorMessage}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <label className="text-xs text-slate-400">Workspace Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400/60"
            placeholder="My Workspace"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <div className="text-sm font-semibold text-slate-100">Presets</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setSelectedPreset(preset.key);
                  setSelectedTools(preset.tools || []);
                }}
                className={`rounded-xl border p-3 text-left transition ${
                  selectedPreset === preset.key
                    ? "border-sky-400 bg-sky-500/20"
                    : "border-white/10 bg-slate-950/40 hover:border-sky-400/40"
                }`}
              >
                <div className="text-sm font-semibold text-slate-100">{preset.name}</div>
                <div className="mt-1 text-xs text-slate-400">{(preset.tools || []).join(", ")}</div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedPreset("custom")}
              className={`rounded-xl border p-3 text-left transition ${
                selectedPreset === "custom"
                  ? "border-emerald-400 bg-emerald-500/20"
                  : "border-white/10 bg-slate-950/40 hover:border-emerald-400/40"
              }`}
            >
              <div className="text-sm font-semibold text-slate-100">Custom (pick up to 5)</div>
              <div className="mt-1 text-xs text-slate-400">Choose your own tools</div>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-100">Custom Tools</div>
            <div className="text-xs text-slate-400">{selectedTools.length} / {TOOL_LIMIT}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {tools.map((tool) => {
              const active = selectedTools.includes(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  disabled={selectedPreset !== "custom"}
                  onClick={() => {
                    if (selectedPreset !== "custom") {
                      return;
                    }
                    setSelectedTools((prev) => {
                      if (prev.includes(tool.id)) {
                        return prev.filter((item) => item !== tool.id);
                      }
                      if (prev.length >= TOOL_LIMIT) return prev;
                      return [...prev, tool.id];
                    });
                  }}
                  className={`rounded-xl border p-3 text-left transition ${
                    selectedPreset !== "custom"
                      ? "cursor-not-allowed border-white/5 bg-slate-900/20 text-slate-500"
                      : active
                      ? "border-emerald-400 bg-emerald-500/20"
                      : "border-white/10 bg-slate-950/40 hover:border-emerald-400/40"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-100">{tool.logo || "TL"}</div>
                  <div className="mt-1 text-xs text-slate-300">{tool.label}</div>
                </button>
              );
            })}
          </div>
          {selectedPreset !== "custom" && (
            <div className="mt-2 text-xs text-slate-500">Pick "Custom" to select up to 5 tools.</div>
          )}
          {selectedPreset === "custom" && (
            <div className="mt-2 text-xs text-slate-500">
              Only Python can launch right now. Other tools are saved for later.
            </div>
          )}
        </div>

        {statusMessage && (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3 text-xs text-sky-100">
            {statusMessage}
          </div>
        )}
        {lastLaunch && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
            <div className="font-semibold">{lastLaunch.pending ? "Code-server session starting" : "Code-server ready"}</div>
            {lastLaunch.accessUrl ? (
              <div className="mt-1 break-all">Open: {lastLaunch.accessUrl}</div>
            ) : (
              <div className="mt-1">Waiting for host to return the code-server URL...</div>
            )}
            {lastLaunch.password && <div className="mt-1">Password: {lastLaunch.password}</div>}
          </div>
        )}

        <button
          type="button"
          onClick={saveAndLaunch}
          disabled={launching || !name.trim()}
          className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${
            launching ? "bg-sky-400 cursor-wait" : "bg-sky-500 hover:bg-sky-400"
          }`}
        >
          {launching ? "Launching..." : "Launch Python Workspace"}
        </button>
      </div>
    </div>
  );
}
