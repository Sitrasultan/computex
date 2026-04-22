import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import "./dashboard.css";
import { api, requestWithFallback } from "../utils/api";
import { createAppSocket, emitSessionStart } from "../utils/socket";
import SessionComponent from "../components/SessionComponent"; 

import ContainerCard from "../components/ContainerCard";

const SESSION_POLL_REQUEST_TIMEOUT_MS = 1500;
const MINUTES_PER_CREDIT = 60;
const ETB_PER_CREDIT = 100;
const ETB_PER_MINUTE = ETB_PER_CREDIT / MINUTES_PER_CREDIT;

const formatMinutes = (minutes) => {
  const total = Math.max(0, Number(minutes) || 0);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};


// ---------- Icons ----------
const IconCredit = ({ className = "w-6 h-6" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 10v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" />
    <path d="M7 10V7a5 5 0 0 1 10 0v3" />
    <path d="M12 15v.01" />
  </svg>
);

const IconPlay = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 3v18l15-9L5 3z" />
  </svg>
);

const IconContainer = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
);

const hostPresence = (device, availability) => {
  if (!device?.last_seen_at) return "offline";
  const diff = Date.now() - new Date(device.last_seen_at).getTime();
  if (diff >= 60000) return "offline";
  return availability || "available";
};

const formatLastSeen = (ts) => {
  if (!ts) return "never";
  return new Date(ts).toLocaleTimeString();
};
// ---------- Sidebar ----------
function Sidebar({ open, onClose, theme }) {
  const isDark = theme === "dark";

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 z-[999] transition-opacity sm:hidden ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      />
      <aside
        className={`fixed top-0 left-0 z-[1000] sm:z-50 h-screen w-48 sm:w-64 flex flex-col transform transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        } sm:translate-x-0 ${
          isDark
            ? "bg-[#020921] text-slate-100"
            : "bg-white text-slate-900 border-r border-slate-200 shadow-md"
        }`}
      >
        <div className="flex-1 flex flex-col px-3 py-4">
          <div className="flex items-center justify-between h-12">
            <div className="text-xl font-extrabold tracking-tight">CX</div>
            <button onClick={onClose} className="sm:hidden text-slate-400 text-xl">
              ✕
            </button>
          </div>

          <nav className="flex-1 flex flex-col gap-1.5 mt-4">
            <Link
              to="/dashboard"
              className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition ${
                isDark ? "bg-[#0d1021] border border-white/5" : "bg-slate-100 border border-slate-200"
              }`}
            >
              <div
                className={`p-1.5 rounded-md w-8 h-8 flex items-center justify-center ${
                  isDark ? "bg-white/5 text-sky-400" : "bg-slate-100 text-sky-500"
                }`}
              >
                <IconContainer />
              </div>
              <span className="truncate">Dashboard</span>
            </Link>
            <Link
              to="/docs/getting-started"
              className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition ${
                isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
              }`}
            >
              <div
                className={`p-1.5 rounded-md w-8 h-8 flex items-center justify-center ${
                  isDark ? "bg-white/5 text-sky-400" : "bg-slate-100 text-sky-500"
                }`}
              >
                <IconCredit />
              </div>
              <span className="truncate">Support & Docs</span>
            </Link>
          </nav>
        </div>
      </aside>
    </>
  );
}

// ---------- Topbar ----------
function Topbar({ onMenuClick, theme, toggleTheme }) {
  const isDark = theme === "dark";
  return (
    <header
      className={`sticky top-0 z-20 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-4 px-3 sm:px-4 sm:px-6 py-3 border-b ${
        isDark ? "border-white/5 bg-[#020a1c]" : "border-slate-200 bg-white shadow-sm"
      }`}
    >
      <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
        <button
          onClick={onMenuClick}
          className="sm:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 transition text-xl"
          aria-label="Open menu"
        >
          ☰
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <button className={`text-lg p-1 ${isDark ? "text-slate-200" : "text-slate-500"}`}>🔔</button>
        {toggleTheme && (
          <button
            onClick={toggleTheme}
            className={`p-1.5 sm:p-2 rounded-full border transition ${
              isDark
                ? "bg-[#020921] border-white/10 hover:bg-white/10"
                : "bg-white border-slate-200 hover:bg-slate-50"
            }`}
            aria-label="Toggle theme"
          >
            {isDark ? "☀️" : "🌙"}
          </button>
        )}
        <div className="w-9 h-9 sm:w-9 sm:h-9 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
          S
        </div>
      </div>
    </header>
  );
}

// ---------- Cards ----------
function HostsStatusCard({ hosts, theme }) {
  const isDark = theme === "dark";

  return (
    <div
      className={`rounded-3xl p-4 sm:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
        isDark
          ? "bg-slate-800/50 backdrop-blur-md border border-white/10"
          : "bg-gradient-to-br from-sky-50/90 to-blue-50/90 backdrop-blur-md border border-blue-100/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className={`text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            Host Pairing Status
          </h3>
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"} mt-1`}>
            Live status from connected host agents
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            isDark ? "bg-slate-700/60 text-slate-200" : "bg-blue-100 text-blue-700"
          }`}
        >
          {hosts.length} total
        </span>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        {hosts.length === 0 && (
          <div className={`rounded-xl p-3 ${isDark ? "bg-slate-700/40 text-slate-300" : "bg-white text-slate-600"}`}>
            No hosts registered yet.
          </div>
        )}

        {hosts.map((host) => {
          const presence = hostPresence(host.device, host.availability);
          const isConnected = presence !== "offline";
          return (
            <div
              key={host.id}
              className={`rounded-2xl p-3 border ${
                isDark ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    {host.name || host.email}
                  </div>
                  <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {host.device?.label || "No device linked"}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    isConnected
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-500 text-white"
                  }`}
                >
                  {presence === "offline" ? "Offline" : presence}
                </span>
              </div>

              <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                <div>Pairing: {host.status || "pending"}</div>
                <div>Last seen: {formatLastSeen(host.device?.last_seen_at)}</div>
                <div>CPU: {host.telemetry?.cpu ?? "--"}%</div>
                <div>RAM: {host.telemetry?.ram ?? "--"}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreditsCard({ credits }) {
  const used = Number(credits?.used) || 0;
  const remaining = Math.max(0, Number(credits?.remaining) || 0);
  const trackedTotal = used + remaining;
  const percent = trackedTotal > 0 ? Math.min(100, Math.round((used / trackedTotal) * 100)) : 0;
  const availableCredits = Number((remaining / MINUTES_PER_CREDIT).toFixed(2));
  const spentEtb = Number((used * ETB_PER_MINUTE).toFixed(2));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-sky-900 via-indigo-900 to-blue-950 shadow-2xl overflow-hidden border border-white/10"
    >
      <div className="absolute -right-20 -top-10 opacity-20 w-72 h-72 rounded-full bg-gradient-to-tr from-white/10 to-white/5 blur-3xl"></div>
      <div className="absolute -left-16 -bottom-24 opacity-20 w-72 h-72 rounded-full bg-sky-300/30 blur-3xl"></div>
      <div className="relative flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-white/10">
              <IconCredit className="w-8 h-8 text-yellow-300" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Billing Overview</div>
              <div className="mt-1 text-3xl font-bold text-white">{formatMinutes(remaining)}</div>
              <div className="text-xs text-slate-300">Time left ({availableCredits} credits)</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-300">Rate</div>
            <div className="text-sm font-semibold text-emerald-200">1 credit = 60 min</div>
            <div className="text-sm font-semibold text-emerald-200">100 ETB / credit</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-2xl bg-white/10 p-3 border border-white/10">
            <div className="text-slate-300">Used Runtime</div>
            <div className="mt-1 text-base font-semibold text-white">{formatMinutes(used)}</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3 border border-white/10">
            <div className="text-slate-300">Spent</div>
            <div className="mt-1 text-base font-semibold text-white">{spentEtb} ETB</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3 border border-white/10">
            <div className="text-slate-300">Remaining Time</div>
            <div className="mt-1 text-base font-semibold text-white">{formatMinutes(remaining)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/6">
              <IconCredit className="w-5 h-5 text-sky-200" />
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-300">Usage Progress</div>
            <div className="text-xs text-slate-400">Used: {formatMinutes(used)} | Remaining: {formatMinutes(remaining)}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
            <svg viewBox="0 0 36 36" className="w-20 h-20">
              <defs>
                <linearGradient id="g" x1="0%" x2="100%">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#111827" strokeWidth="6" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="url(#g)"
                strokeWidth="6"
                strokeDasharray={`${percent} ${100 - percent}`}
                strokeDashoffset="25"
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
              <text
                x="50%"
                y="50%"
                dominantBaseline="central"
                textAnchor="middle"
                className="text-sm"
                fill="#fff"
                style={{ fontSize: 9 }}
              >
                {percent}%
              </text>
            </svg>
            <div className="text-xs text-slate-300 mt-2">used vs available</div>
          </div>
            <div>
              <button className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition">Top up</button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function OverviewBanner({ credits, sessions = [], theme }) {
  const isDark = theme === "dark";
  const runningCount = (sessions || []).filter((s) => s.status === "running" || s.status === "open").length;
  const usedMinutes = Number(credits?.used) || 0;
  const remainingMinutes = Math.max(0, Number(credits?.remaining) || 0);
  const spentEtb = Number((usedMinutes * ETB_PER_MINUTE).toFixed(2));

  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 border ${
        isDark
          ? "bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 border-white/10"
          : "bg-gradient-to-r from-sky-100 via-indigo-50 to-cyan-100 border-sky-200/70"
      }`}
    >
      <div className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-3xl ${isDark ? "bg-cyan-400/10" : "bg-cyan-300/30"}`}></div>
      <div className="relative">
        <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>Compute Snapshot</h2>
        <p className={`text-xs sm:text-sm mt-1 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
          Minute-based billing is live: 60 minutes per credit, 100 ETB per credit.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`rounded-2xl p-3 border ${isDark ? "bg-white/5 border-white/10 text-slate-100" : "bg-white/80 border-sky-200 text-slate-900"}`}>
            <div className="text-xs opacity-80">Active Sessions</div>
            <div className="text-lg font-semibold mt-1">{runningCount}</div>
          </div>
          <div className={`rounded-2xl p-3 border ${isDark ? "bg-white/5 border-white/10 text-slate-100" : "bg-white/80 border-sky-200 text-slate-900"}`}>
            <div className="text-xs opacity-80">Remaining Time</div>
            <div className="text-lg font-semibold mt-1">{formatMinutes(remainingMinutes)}</div>
          </div>
          <div className={`rounded-2xl p-3 border ${isDark ? "bg-white/5 border-white/10 text-slate-100" : "bg-white/80 border-sky-200 text-slate-900"}`}>
            <div className="text-xs opacity-80">Spend (ETB)</div>
            <div className="text-lg font-semibold mt-1">{spentEtb}</div>
          </div>
        </div>
      </div>
    </div>
  );
}



// ---------- SessionsCard ----------
 function SessionsCard({ sessions = [], theme, stopSession, loadingSession, timers }) {
  const isDark = theme === "dark";
  const navigate = useNavigate();
  const [showAllSessions, setShowAllSessions] = useState(false);
  const initialVisibleCount = 5;

  // Include stopped sessions so button and status are visible
  const recentSessions = (sessions || []).filter(
    (s) => ["running", "open", "stopped"].includes(s.status)
  );
  const visibleSessions = showAllSessions
    ? recentSessions
    : recentSessions.slice(0, initialVisibleCount);
  const hiddenSessionsCount = Math.max(0, recentSessions.length - initialVisibleCount);

  // Status color helper including "stopped"
  const statusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "running":
        return "bg-emerald-400 text-white";
      case "completed":
      case "idle":
        return "bg-sky-500 text-white";
      case "failed":
        return "bg-rose-500 text-white";
      case "stopped":
        return "bg-gray-400 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  return (
    <div
      className={`rounded-3xl p-3 sm:p-4 sm:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
        isDark
          ? "bg-slate-800/50 backdrop-blur-md border border-white/10"
          : "bg-gradient-to-br from-purple-50/80 to-indigo-50/80 backdrop-blur-md border border-purple-100/50"
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 sm:mb-4 gap-2 sm:gap-0">
        <div className={`text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-700"}`}>
          Recent Sessions
        </div>
        <div className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>Activity</div>
      </div>

      {/* Sessions List */}
      <div className="flex flex-col gap-2 sm:gap-3">
        {recentSessions.length === 0 && (
          <div className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            No recent sessions
          </div>
        )}

        {visibleSessions.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/sessions/${s.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(`/sessions/${s.id}`);
              }
            }}
            className="flex flex-col sm:flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-white/30 dark:hover:bg-white/10 backdrop-blur-sm transition cursor-pointer"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0 w-full">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${statusColor(
                  s.status
                )}`}
              >
                <IconPlay className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-900"} truncate`}
                >
                  {s.title}
                </div>
               <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"} mt-1`}>
  Duration: {timers[s.id] || "0m 0s"}
</div>

                
           </div>
            </div>

            {/* Status badge + Stop button */}
            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/sessions/${s.id}`);
                }}
                className="text-xs px-3 py-1 rounded bg-sky-500 text-white hover:bg-sky-600"
              >
                View files
              </button>
              <div className={`text-xs px-3 py-1 rounded-full ${statusColor(s.status)}`}>
                {s.status}
              </div>

              {(s.status === "running" || s.status === "open") && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    stopSession(s.id);
                  }}
                  disabled={loadingSession === s.id || s.status === "stopped"}
                  className={`text-xs px-3 py-1 rounded ${
                    s.status === "stopped"
                      ? "bg-gray-400 text-white cursor-not-allowed"
                      : loadingSession === s.id
                      ? "bg-yellow-500 text-white cursor-wait"
                      : "bg-red-500 text-white hover:bg-red-600"
                  }`}
                >
                  {loadingSession === s.id
                    ? "Stopping..."
                    : s.status === "stopped"
                    ? "Stopped"
                    : "Stop"}
                </button>
              )}

              {s.status === "stopped" && loadingSession !== s.id && (
                <div
                  className="text-xs px-3 py-1 rounded bg-gray-400 text-white cursor-not-allowed"
                  onClick={(event) => event.stopPropagation()}
                >
                  Stopped
                </div>
              )}
            </div>
          </div>
        ))}

        {hiddenSessionsCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllSessions((current) => !current)}
            className={`self-start text-xs px-3 py-1 rounded-lg border ${
              isDark
                ? "border-white/10 text-slate-200 hover:bg-white/10"
                : "border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {showAllSessions ? "Show less" : `Show more (${hiddenSessionsCount})`}
          </button>
        )}
      </div>
    </div>
  );
}




// ---------- ActiveContainers ---

// ActiveContainers.jsx

function WorkspacesCard({ workspaces = [], theme, onResume, onDelete, busyWorkspaceId, deletingWorkspaceId }) {
  const isDark = theme === "dark";
  return (
    <div
      className={`rounded-3xl p-3 sm:p-4 sm:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
        isDark
          ? "bg-slate-800/50 backdrop-blur-md border border-white/10"
          : "bg-gradient-to-br from-emerald-50/80 to-teal-50/80 backdrop-blur-md border border-emerald-100/50"
      }`}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className={`text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          Your Workspaces
        </div>
        <div className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>Persistent</div>
      </div>

      <div className="flex flex-col gap-2 sm:gap-3">
        {workspaces.length === 0 && (
          <div className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            No workspaces yet
          </div>
        )}

        {workspaces.map((workspace) => (
          <div
            key={workspace.id}
            className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-2 rounded-xl border ${
              isDark ? "border-white/10 bg-slate-900/40" : "border-emerald-100 bg-white/80"
            }`}
          >
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                {workspace.name}
              </div>
              <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Last used: {workspace.last_used ? new Date(workspace.last_used).toLocaleString() : "Never"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onResume(workspace.id)}
                disabled={busyWorkspaceId === workspace.id || deletingWorkspaceId === workspace.id}
                className={`text-xs px-3 py-1 rounded ${
                  busyWorkspaceId === workspace.id
                    ? "bg-sky-400 text-white cursor-wait"
                    : "bg-sky-500 text-white hover:bg-sky-600"
                }`}
              >
                {busyWorkspaceId === workspace.id ? "Resuming..." : "Resume"}
              </button>
              <button
                type="button"
                onClick={() => onDelete(workspace.id)}
                disabled={deletingWorkspaceId === workspace.id || busyWorkspaceId === workspace.id}
                className={`text-xs px-3 py-1 rounded ${
                  deletingWorkspaceId === workspace.id
                    ? "bg-rose-400 text-white cursor-wait"
                    : "bg-rose-500 text-white hover:bg-rose-600"
                }`}
              >
                {deletingWorkspaceId === workspace.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

 function ActiveContainers({ containers = [], theme = "light", refreshContainers }) {
  const isDark = theme === "dark";
  
  return (
    <div
      className={`rounded-3xl p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
        isDark
          ? "bg-slate-800/50 backdrop-blur-md border border-white/10"
          : "bg-gradient-to-br from-purple-50/80 to-indigo-50/80 backdrop-blur-md border border-purple-100/50"
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <h3 className={`text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-700"}`}>
          Active Containers
        </h3>
        <div className="text-xs text-slate-500">Real-time telemetry</div>
      </div>

      {/* Content */}
      {containers.length === 0 ? (
        <div className={`text-center py-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          No active containers
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {containers.map((container) => (
            <ContainerCard
              key={container.id}
              container={container}
              theme={theme}
              refreshContainers={refreshContainers} // for Stop/Restart buttons
            />
          ))}
        </div>
      )}
    </div>
  );
}





// ---------- NotificationsPanel ----------
function NotificationsPanel({ notifications = [], theme }) {
  const isDark = theme === "dark";
  return (
    <div
      className={`rounded-3xl p-3 sm:p-4 sm:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
        isDark ? "bg-slate-800/50 backdrop-blur-md border border-white/10" : "bg-gradient-to-br from-purple-50/90 to-indigo-50/90 backdrop-blur-md border border-purple-100/60"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
        <h3 className={`text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-700"}`}>Notifications</h3>
        <div className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>Recent activity</div>
      </div>

      <div className="flex flex-col gap-2">
        {(notifications || []).map((n) => (
          <div
            key={n.id}
            className={`p-2 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 transition ${
              isDark
                ? "hover:bg-slate-700/50 bg-slate-700/30 backdrop-blur-sm border border-white/10"
                : "hover:bg-purple-100/70 bg-purple-50/80 backdrop-blur-sm border border-purple-200/50"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold self-start sm:self-center ${
                isDark ? "bg-slate-700 text-purple-400" : "bg-purple-200 text-purple-600"
              }`}
            >
              !
            </div>
            <div className={`text-sm ${isDark ? "text-slate-200" : "text-slate-900"} flex-1 min-w-0`}>{n.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- StartSessionButton ----------
function StartSessionButton() {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-purple-600 text-white font-semibold flex items-center gap-3 justify-center sm:justify-start"
    >
      <div className="bg-white/15 p-2 rounded-md flex items-center justify-center">
        <IconPlay className="w-4 h-4 text-white" />
      </div>
      <div className="flex flex-col text-left">
        <span className="text-sm">Launch</span>
        <span className="text-xs text-white/80">Start a compute session</span>
      </div>
    </motion.button>
  );
}

// ---------- MAIN DASHBOARD ----------
export default function ComputeXDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const openedLaunchSessionRef = useRef(new Set());

  const [credits, setCredits] = useState({
  balance: 0,
  used: 0,
  monthly_limit: 0
});

  const [sessions, setSessions] = useState([]);
  const [containers, setContainers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
 const [loadingSession, setLoadingSession] = useState(null);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState(null);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState(null); 
  // Fetch backend data
 const [timers, setTimers] = useState({});
 const [pendingLaunch, setPendingLaunch] = useState(null);
 const [launchResult, setLaunchResult] = useState(null);

const openCodeServer = (destination) => {
  if (!destination) return;
  const popup = window.open(destination, "_blank", "noopener,noreferrer");
  if (!popup) {
    alert("Popup blocked by browser. Allow popups and click Resume again.");
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

// Fetch active containers
const fetchContainers = async () => {
  try {
    const res = await api.get("/api/containers/active");
    setContainers(res.data.containers || []);
  } catch (err) {
    console.error("Failed to fetch containers:", err);
  }
};

// Fetch dashboard data (sessions, credits, notifications)
const fetchDashboard = async () => {
  try {
    const res = await api.get("/api/dashboard");
    setSessions(res.data.sessions || []);
    setContainers(res.data.containers || []);
    setCredits(res.data.credits || {
      balance: 0,
      used: 0,
      monthly_limit: 0,
      percentage: 0,
      remaining: 0,
    });
    setNotifications(res.data.notifications || []);
    setHosts(res.data.hosts || []);
    setWorkspaces(res.data.workspaces || []);
  } catch (err) {
    console.error(err);
  }
};

// Initial fetch
useEffect(() => {
  fetchDashboard();
  const interval = setInterval(fetchDashboard, 10000);
  return () => clearInterval(interval);
}, []);

useEffect(() => {
  const token = localStorage.getItem("token");
  if (!token) return undefined;
  const socket = createAppSocket(token);
  socket.on("client:launch-progress", (payload) => {
    if (!payload?.sessionId || !payload?.access_url) return;
    if (pendingLaunch?.sessionId !== payload.sessionId) return;
    setPendingLaunch(null);
    setBusyWorkspaceId(null);
    setLaunchResult({
      accessUrl: payload.access_url,
      password: payload.password || null,
    });
    openCodeServerForSession(payload.sessionId, payload.access_url);
  });
  socket.connect();
  return () => {
    socket.disconnect();
  };
}, [pendingLaunch]);

 const stopSession = async (sessionId) => {
    setLoadingSession(sessionId);
    try {
        const res = await api.get(`/api/sessions/${sessionId}/stop`);

        // Update sessions list if needed
        setSessions(prev =>
            prev.map(s => (s.id === sessionId ? res.data.session : s))
        );

        // Update credits immediately
        if (res.data.credits) {
            setCredits(res.data.credits);
        }

        const billedMinutes = Number(res.data?.billed_minutes || 0);
        const billedEtb = Number(res.data?.billed_etb || 0);
        alert(`${res.data.message}. Billed: ${billedMinutes} minute(s) (${billedEtb} ETB).`);

    } catch (error) {
        console.error(error);
        alert(error.response?.data?.message || 'Failed to stop session');
    } finally {
        setLoadingSession(null);
    }
};


 const resumeWorkspace = async (workspaceId) => {
  let keepPendingState = false;
 try {
    setBusyWorkspaceId(workspaceId);
    setLaunchResult(null);
    const res = await emitSessionStart(
      {
        environment: "coding",
        workspace_name: "Code Server Session",
        workspace_id: workspaceId,
        preset_key: "python",
        tools: ["python", "git"],
        image: "computex-python-interpreter",
        async_launch: true,
      },
      3 * 60 * 1000
    );

    const session = res?.session;
    const launch = res?.launch || {};
    const destination = launch.access_url || session?.access_url;
    const accessPassword = launch.access_password || session?.access_password;

    if (destination) {
      setLaunchResult({ accessUrl: destination, password: accessPassword });
      openCodeServerForSession(session?.id || null, destination);
    } else if (session?.id) {
      keepPendingState = true;
      setPendingLaunch({ sessionId: session.id, workspaceId });
    }

    await fetchDashboard();
  } catch (error) {
    alert(error?.response?.data?.message || error?.message || "Failed to resume workspace");
  } finally {
    if (!keepPendingState) {
      setBusyWorkspaceId(null);
    }
  }
};

useEffect(() => {
  if (!pendingLaunch?.sessionId) return undefined;

  let cancelled = false;
  let timerId = null;

  const pollSession = async () => {
    try {
      const res = await requestWithFallback({
        method: "get",
        url: `/api/sessions/${pendingLaunch.sessionId}`,
        timeout: SESSION_POLL_REQUEST_TIMEOUT_MS,
      });
      if (cancelled) return;
      const session = res?.data?.session;
      if (!session) {
        timerId = setTimeout(pollSession, 1000);
        return;
      }

      const destination = session.access_url || null;
      const accessPassword = session.access_password || null;
      if (session.status === "failed" || session.status === "stopped") {
        setPendingLaunch(null);
        setBusyWorkspaceId(null);
        return;
      }
      if (destination) {
        setPendingLaunch(null);
        setBusyWorkspaceId(null);
        setLaunchResult({ accessUrl: destination, password: accessPassword });
        openCodeServerForSession(session.id || pendingLaunch.sessionId, destination);
        await fetchDashboard();
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
}, [pendingLaunch]);

const deleteWorkspace = async (workspaceId) => {
  try {
    setDeletingWorkspaceId(workspaceId);
    await api.delete(`/api/workspaces/${workspaceId}`);
    await fetchDashboard();
  } catch (error) {
    alert(error?.response?.data?.message || error?.message || "Failed to delete workspace");
  } finally {
    setDeletingWorkspaceId(null);
  }
};
 const formatDuration = (start, end) => {
  const endTime = end ? new Date(end) : new Date(); // use current time if still running
  const startTime = new Date(start);
  const diff = Math.floor((endTime - startTime) / 1000); // in seconds
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}m ${secs}s`;
};

useEffect(() => {
  const interval = setInterval(() => {
    const updatedTimers = {};
   sessions.forEach((s) => {
  if (s.status === "running" || s.status === "open") {
    updatedTimers[s.id] = formatDuration(s.started_at, s.ended_at);
  } else if (s.status === "stopped" || s.status === "completed") {
    updatedTimers[s.id] = formatDuration(s.started_at, s.ended_at); // freeze timer
  }
});

    setTimers(updatedTimers); // <-- only update timers
  }, 1000);

  return () => clearInterval(interval);
}, [sessions]);


  // Load saved theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? "bg-[#020921] text-slate-100" : "bg-gradient-to-b from-slate-50 to-purple-50 text-slate-900"}`}>
      <div className="w-full h-screen flex overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} theme={theme} />
        <div className={`fixed top-0 right-0 bottom-0 lg:left-64 w-full lg:w-auto flex flex-col flex-1 z-10 transition-all duration-300`}>
          <Topbar onMenuClick={() => setSidebarOpen(true)} theme={theme} toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} />
          {launchResult?.accessUrl && (
            <div className="mx-auto mt-4 w-full max-w-7xl px-4">
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                <div className="font-semibold">Code-server ready</div>
                <div className="mt-1 break-all">Open: {launchResult.accessUrl}</div>
                {launchResult.password && <div className="mt-1">Password: {launchResult.password}</div>}
              </div>
            </div>
          )}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-purple-400/50 scrollbar-track-transparent">
            <div className="max-w-7xl mx-auto w-full px-4">
              <OverviewBanner credits={credits} sessions={sessions} theme={theme} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 max-w-7xl mx-auto w-full px-4">
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5">
                  <CreditsCard credits={credits} />
                  <div
                    className={`rounded-3xl p-4 sm:p-5 flex flex-col justify-between h-full shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
                      isDark
                        ? "bg-slate-800/50 backdrop-blur-md border border-white/10"
                        : "bg-gradient-to-br from-purple-100/70 to-indigo-100/70 backdrop-blur-md border border-purple-200/50"
                    }`}
                  >
                    <div className="mt-4 grid grid-cols-1 gap-3">
                     <SessionComponent />
                    </div>
                  </div>
                </div>
                <SessionsCard sessions={sessions} theme={theme}  stopSession={stopSession} loadingSession={loadingSession}  timers={timers}  />
              </div>

              <div className="space-y-6">
                <NotificationsPanel notifications={notifications} theme={theme} />
                <div
                  className={`rounded-3xl p-4 sm:p-5 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
                    isDark ? "bg-slate-800/50 backdrop-blur-md border border-white/10" : "bg-gradient-to-br from-purple-50/90 to-indigo-50/90 backdrop-blur-md border border-purple-100/60"
                  }`}
                >
                  <h3 className={`text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Support & Docs</h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"} mt-2`}>Quick links for onboarding and troubleshooting</p>
                  <ul className={`mt-3 text-sm space-y-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <li><Link to="/docs/getting-started" className="hover:underline">Getting started guide</Link></li>
                    <li><Link to="/docs/host-installation" className="hover:underline">Host agent installation</Link></li>
                    <li><Link to="/docs/troubleshooting" className="hover:underline">Troubleshooting connectivity</Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </main>
          
          
          
      
          {/* Fixed Footer */}
          <footer
            className={`p-3 sm:p-4 text-center text-xs border-t shrink-0
              ${
                isDark
                  ? "text-slate-500 border-white/5 bg-slate-900/30 backdrop-blur-md"
                  : "text-slate-500 border-purple-100 bg-purple-50/80 backdrop-blur-md"
              }
            `}
          >
            ComputeX • Prototype dashboard • © {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  );
} 
