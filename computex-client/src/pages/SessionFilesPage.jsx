import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, requestWithFallback } from "../utils/api";

const SESSION_POLL_REQUEST_TIMEOUT_MS = 1500;
const SESSION_REOPEN_TIMEOUT_MS = 3 * 60 * 1000;

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function openCodeServer(accessUrl) {
  if (!accessUrl) return;
  const popup = window.open(accessUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    alert("Popup blocked by browser. Allow popups and try again.");
  }
}

export default function SessionFilesPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [session, setSession] = useState(null);
  const [files, setFiles] = useState([]);
  const [source, setSource] = useState("none");
  const [rootPath, setRootPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedPath, setSelectedPath] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");

  const [launching, setLaunching] = useState(false);
  const [launchInfo, setLaunchInfo] = useState(null);

  const fetchSessionFiles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/api/sessions/${id}/files`);
      setSession(res.data?.session || null);
      setFiles(res.data?.files || []);
      setSource(res.data?.source || "none");
      setRootPath(res.data?.root_path || null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load session files");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSessionFiles();
  }, [fetchSessionFiles]);

  const loadFile = useCallback(
    async (relativePath) => {
      if (!relativePath) return;
      setSelectedPath(relativePath);
      setSelectedFile(null);
      setFileLoading(true);
      setFileError("");
      try {
        const res = await api.get(`/api/sessions/${id}/files/content`, {
          params: { path: relativePath },
        });
        setSelectedFile(res.data?.file || null);
      } catch (err) {
        setFileError(err?.response?.data?.message || err?.message || "Failed to read file");
      } finally {
        setFileLoading(false);
      }
    },
    [id]
  );

  const waitForAccessUrl = useCallback(async (sessionId) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SESSION_REOPEN_TIMEOUT_MS) {
      try {
        const res = await requestWithFallback({
          method: "get",
          url: `/api/sessions/${sessionId}`,
          timeout: SESSION_POLL_REQUEST_TIMEOUT_MS,
        });
        const currentSession = res?.data?.session;
        if (!currentSession) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        if (currentSession.status === "failed" || currentSession.status === "stopped") {
          throw new Error(`Launch stopped with status: ${currentSession.status}`);
        }
        if (currentSession.access_url) {
          return {
            accessUrl: currentSession.access_url,
            password: currentSession.access_password || null,
          };
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Timed out while waiting for code-server to be ready");
  }, []);

  const reopenSession = useCallback(async () => {
    setLaunching(true);
    try {
      const res = await api.post(`/api/sessions/${id}/reopen`, { async_launch: true });
      const nextSession = res.data?.session || null;
      const launch = res.data?.launch || {};
      let accessUrl = launch.access_url || nextSession?.access_url || null;
      let password = launch.access_password || nextSession?.access_password || null;

      if (!accessUrl && nextSession?.id) {
        const ready = await waitForAccessUrl(nextSession.id);
        accessUrl = ready.accessUrl;
        password = ready.password;
      }

      if (!accessUrl) {
        throw new Error("Session launch started but no access URL was returned");
      }

      setLaunchInfo({ accessUrl, password });
      openCodeServer(accessUrl);
      await fetchSessionFiles();
    } catch (err) {
      alert(err?.response?.data?.message || err?.message || "Failed to reopen session");
    } finally {
      setLaunching(false);
    }
  }, [fetchSessionFiles, id, waitForAccessUrl]);

  return (
    <div className="min-h-screen bg-[#020921] text-slate-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-sm"
          >
            Back to dashboard
          </button>
          <button
            type="button"
            onClick={fetchSessionFiles}
            className="px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-sm"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={reopenSession}
            disabled={launching}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              launching
                ? "bg-sky-400 cursor-wait"
                : "bg-sky-500 hover:bg-sky-400"
            }`}
          >
            {launching ? "Opening..." : "Open In New Code-Server Session"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-4">
          <div className="text-lg font-semibold">{session?.title || "Session Files"}</div>
          <div className="mt-1 text-xs text-slate-300 break-all">
            Session: {session?.id || id} | Status: {session?.status || "unknown"} | Source: {source}
          </div>
          {rootPath && <div className="mt-1 text-xs text-slate-400 break-all">Root: {rootPath}</div>}
          {launchInfo?.accessUrl && (
            <div className="mt-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-2 text-xs text-emerald-100 break-all">
              Opened: {launchInfo.accessUrl}
              {launchInfo.password && <div className="mt-1">Password: {launchInfo.password}</div>}
            </div>
          )}
        </div>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-4 text-sm text-slate-300">
            Loading files...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
            <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-3">
              <div className="text-sm font-semibold text-slate-200 mb-2">Files ({files.length})</div>
              <div className="max-h-[65vh] overflow-auto space-y-1 pr-1">
                {files.length === 0 && (
                  <div className="text-sm text-slate-400">
                    No files found for this session.
                  </div>
                )}
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => loadFile(file.path)}
                    className={`w-full text-left rounded-lg px-3 py-2 transition ${
                      selectedPath === file.path
                        ? "bg-sky-500/30 border border-sky-400/50"
                        : "bg-slate-900/40 hover:bg-slate-700/50 border border-transparent"
                    }`}
                  >
                    <div className="text-sm text-slate-100 break-all">{file.path}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatFileSize(file.size)}{file.modified_at ? ` | ${new Date(file.modified_at).toLocaleString()}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-3">
              <div className="text-sm font-semibold text-slate-200 mb-2">
                {selectedPath ? selectedPath : "File preview"}
              </div>
              <div className="max-h-[65vh] overflow-auto rounded-lg bg-slate-950/60 border border-white/10 p-3 text-sm">
                {!selectedPath && <div className="text-slate-400">Select a file to preview its contents.</div>}
                {selectedPath && fileLoading && <div className="text-slate-400">Loading file...</div>}
                {selectedPath && !fileLoading && fileError && (
                  <div className="text-rose-300">{fileError}</div>
                )}
                {selectedPath && !fileLoading && !fileError && selectedFile?.binary && (
                  <div className="text-slate-300">
                    This file appears to be binary and cannot be previewed as text.
                  </div>
                )}
                {selectedPath && !fileLoading && !fileError && !selectedFile?.binary && (
                  <>
                    <pre className="whitespace-pre-wrap break-words text-slate-100">
                      {selectedFile?.content || ""}
                    </pre>
                    {selectedFile?.truncated && (
                      <div className="mt-3 text-xs text-amber-300">
                        Preview truncated to keep the page responsive.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
