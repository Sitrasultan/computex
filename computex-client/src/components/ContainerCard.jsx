import React, { useState } from "react";
import { api } from "../utils/api";

const statusColor = (status) => {
  switch (status?.toLowerCase()) {
    case "running":
      return "bg-emerald-400 text-white";
    case "starting":
      return "bg-yellow-400 text-white";
    case "stopped":
      return "bg-gray-400 text-white";
    case "failed":
      return "bg-rose-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

export default function ContainerCard({ container, theme = "light", refreshContainers }) {
  const isDark = theme === "dark";
  const [loading, setLoading] = useState(false);

  const handleStop = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await api.get(`/api/sessions/${container.session_id || container.id}/stop`);
      if (refreshContainers) refreshContainers();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to stop container");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-2xl p-3 shadow-[0_12px_30px_rgba(0,0,0,0.25)] ${
        isDark
          ? "bg-slate-800/40 backdrop-blur-md border border-white/10"
          : "bg-gradient-to-b from-purple-100/60 to-indigo-100/60 backdrop-blur-md border border-purple-200/50"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`p-2 rounded-xl ${isDark ? "bg-slate-700/50" : "bg-purple-200/60 backdrop-blur-sm"}`}
          >
            Docker
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`font-semibold text-sm ${
                isDark ? "text-slate-100" : "text-slate-900"
              } truncate`}
            >
              {container.name}
            </div>
            <div
              className={`text-xs ${
                isDark ? "text-slate-400" : "text-slate-500"
              } mt-1`}
            >
              Session: {container.session?.name || container.session_id} <br />
              User: {container.session?.user?.name || "Unknown"} <br />
              Host: {container.host?.name || "Unknown"}
              {container.access_url ? (
                <>
                  <br />
                  Access: {container.access_url}
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`text-xs px-3 py-1 rounded-full ${statusColor(container.status)}`}>
          {container.status}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>CPU</div>
        <div className="w-full bg-slate-100/80 dark:bg-slate-700/40 rounded-full h-1.5 overflow-hidden">
          <div
            style={{ width: `${container.cpu_usage || 0}%` }}
            className="h-1.5 rounded-full bg-gradient-to-r from-sky-400 to-purple-500"
          />
        </div>

        <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"} mt-2`}>Memory</div>
        <div className="w-full bg-slate-100/80 dark:bg-slate-700/40 rounded-full h-1.5 overflow-hidden">
          <div
            style={{ width: `${container.memory_usage || 0}%` }}
            className="h-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-sky-500"
          />
        </div>

        <div className="flex items-center justify-end mt-3 gap-2">
          {(container.status === "running" || container.status === "starting") && (
            <button
              onClick={handleStop}
              disabled={loading}
              className={`text-xs px-3 py-1 rounded ${
                loading
                  ? "bg-yellow-500 text-white cursor-wait"
                  : "bg-red-500 text-white hover:bg-red-600"
              }`}
            >
              {loading ? "Stopping..." : "Stop"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
