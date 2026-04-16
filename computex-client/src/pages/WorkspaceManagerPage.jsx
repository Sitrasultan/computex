import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestWithFallback } from "../utils/api";
import { createAppSocket, emitSessionStart } from "../utils/socket";

const WORKSPACE_LOAD_TIMEOUT_MS = 10000;
const SESSION_LAUNCH_TIMEOUT_MS = 3 * 60 * 1000;
const SESSION_POLL_REQUEST_TIMEOUT_MS = 1500;
const LAUNCH_STATUS_MESSAGES = [
  "Starting your code-server session...",
  "Preparing containers...",
  "Warming up code-server...",
  "Almost ready...",
];

export default function WorkspaceManagerPage() {
  const navigate = useNavigate();
  const openedLaunchSessionRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState(null);
  const [launchStatus, setLaunchStatus] = useState("");
  const [launchDebug, setLaunchDebug] = useState("");
  const [launchSignal, setLaunchSignal] = useState("");
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [launchResult, setLaunchResult] = useState(null);

  const openCodeServer = (destination) => {
    if (!destination) return;
    const popup = window.open(destination, "_blank", "noopener,noreferrer");
    if (!popup) {
      setLaunchSignal("Popup blocked by browser. Allow popups and click Open again.");
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

  const fetchWorkspaces = async () => {
    setLoading(true);
    try {
      const res = await requestWithFallback({ method: "get", url: "/api/workspaces", timeout: WORKSPACE_LOAD_TIMEOUT_MS });
      setWorkspaces(res.data?.workspaces || []);
    } catch (error) {
      console.error(error);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return undefined;
    const socket = createAppSocket(token);
    socket.on("client:launch-progress", (payload) => {
      if (!payload) return;
      if (busyWorkspaceId) {
        setLaunchStatus(payload.message || payload.stage || "Working...");
      }
      if (payload.stage) {
        setLaunchDebug(`progress:${payload.stage}`);
      }
      if (payload.sessionId && payload.access_url && pendingSessionId === payload.sessionId) {
        setLaunchStatus("Code-server is ready.");
        setLaunchSignal(`Launch ready at ${new Date().toLocaleTimeString()}`);
        setPendingSessionId(null);
        setBusyWorkspaceId(null);
        setLaunchResult({
          accessUrl: payload.access_url,
          password: payload.password || null,
        });
        openCodeServerForSession(payload.sessionId, payload.access_url);
      }
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [busyWorkspaceId, pendingSessionId]);

  useEffect(() => {
    if (!pendingSessionId || !busyWorkspaceId) return undefined;

    let cancelled = false;
    let timerId = null;

    const pollSession = async () => {
      try {
        const res = await requestWithFallback({
          method: "get",
          url: `/api/sessions/${pendingSessionId}`,
          timeout: SESSION_POLL_REQUEST_TIMEOUT_MS,
        });
        if (cancelled) return;
        const session = res?.data?.session;
        if (!session) {
          timerId = setTimeout(pollSession, 1000);
          return;
        }
        const destination = session.access_url || null;
        const password = session.access_password || null;

        if (session.status === "failed" || session.status === "stopped") {
          setLaunchDebug(`launch:error session=${session.id} status=${session.status}`);
          setLaunchSignal(`Launch failed at ${new Date().toLocaleTimeString()}`);
          setLaunchStatus("");
          setPendingSessionId(null);
          setBusyWorkspaceId(null);
          return;
        }

        if (destination) {
          setLaunchDebug(`launch:ready session=${session.id}`);
          setLaunchStatus("Code-server is ready.");
          setLaunchSignal(`Launch ready at ${new Date().toLocaleTimeString()}`);
          setPendingSessionId(null);
          setBusyWorkspaceId(null);
          setLaunchResult({ accessUrl: destination, password });
          openCodeServerForSession(session.id || pendingSessionId, destination);
          return;
        }

        timerId = setTimeout(pollSession, 1000);
      } catch {
        if (cancelled) return;
        timerId = setTimeout(pollSession, 1500);
      }
    };

    pollSession();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [pendingSessionId, busyWorkspaceId]);

  const resumeWorkspace = async (workspaceId) => {
    let keepPendingState = false;
    try {
      setBusyWorkspaceId(workspaceId);
      setLaunchStatus(LAUNCH_STATUS_MESSAGES[0]);
      setLaunchDebug(`launch:start workspace=${workspaceId}`);
      setLaunchSignal(`Launch fired at ${new Date().toLocaleTimeString()}`);
      setLaunchResult(null);
      let statusIndex = 0;
      const statusTimer = setInterval(() => {
        statusIndex = (statusIndex + 1) % LAUNCH_STATUS_MESSAGES.length;
        setLaunchStatus(LAUNCH_STATUS_MESSAGES[statusIndex]);
      }, 4500);
      console.info("launch:http start", { workspaceId });
      const res = await emitSessionStart(
        {
          environment: "coding",
          workspace_name: "Code Server Session",
          preset_key: "python",
          tools: ["python", "git"],
          image: "computex-python",
          skip_workspace: true,
          defer_workspace_save: true,
          async_launch: true,
        },
        SESSION_LAUNCH_TIMEOUT_MS
      );
      setLaunchDebug(`launch:ok session=${res?.session?.id || "unknown"}`);
      clearInterval(statusTimer);
      const session = res?.session;
      const launch = res?.launch || {};
      const destination = launch.access_url || session?.access_url;
      const password = launch.access_password || session?.access_password;

      if (destination) {
        setBusyWorkspaceId(null);
        setLaunchStatus("Code-server is ready.");
        setLaunchResult({ accessUrl: destination, password });
        openCodeServerForSession(session?.id || null, destination);
      } else if (session?.id) {
        keepPendingState = true;
        setPendingSessionId(session.id);
        setLaunchStatus("Launch accepted. Waiting for code-server...");
      }
    } catch (error) {
      setLaunchDebug(`launch:error ${error?.message || error}`);
      setLaunchSignal(`Launch failed at ${new Date().toLocaleTimeString()}`);
      alert(error?.response?.data?.message || error?.message || "Failed to resume workspace");
    } finally {
      if (!keepPendingState) {
        setLaunchStatus("");
        setBusyWorkspaceId(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#020921] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-sky-300/80">ComputeX</div>
            <h1 className="mt-2 text-3xl font-bold">Workspaces</h1>
            <p className="mt-1 text-sm text-slate-400">Create, configure, and resume persistent coding workspaces.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => navigate("/workspaces/new")}
              className="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Create Workspace
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {launchSignal && (
            <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3 text-xs text-sky-100">
              {launchSignal}
            </div>
          )}
          {launchResult?.accessUrl && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              <div className="font-semibold">Code-server ready</div>
              <div className="mt-1 break-all">Open: {launchResult.accessUrl}</div>
              {launchResult.password && <div className="mt-1">Password: {launchResult.password}</div>}
            </div>
          )}
          {loading && <div className="text-sm text-slate-400">Loading workspaces...</div>}
          {!loading && workspaces.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-300">
              No workspaces yet. Create one to pick tools and launch code-server.
            </div>
          )}

          {!loading && workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="rounded-2xl border border-white/10 bg-slate-900/40 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-base font-semibold text-slate-100">{workspace.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Last used: {workspace.last_used ? new Date(workspace.last_used).toLocaleString() : "Never"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Tools: {(workspace.selected_tools || []).join(", ") || "default"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/workspaces/${workspace.id}/tools`)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/20"
                  >
                    Configure
                  </button>
                  <button
                    type="button"
                    onClick={() => resumeWorkspace(workspace.id)}
                    disabled={busyWorkspaceId === workspace.id}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold text-white ${
                      busyWorkspaceId === workspace.id ? "bg-sky-400 cursor-wait" : "bg-sky-500 hover:bg-sky-400"
                    }`}
                  >
                    {busyWorkspaceId === workspace.id ? launchStatus || "Opening..." : "Open"}
                  </button>
                </div>
              </div>
              {busyWorkspaceId === workspace.id && launchDebug && (
                <div className="mt-2 text-[11px] text-slate-400">{launchDebug}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
