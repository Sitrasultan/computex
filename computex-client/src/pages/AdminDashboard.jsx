import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Cpu,
  LayoutDashboard,
  Logs,
  MonitorSmartphone,
  Power,
  ShieldAlert,
  Users,
} from "lucide-react";
import { api } from "../utils/api";
import "./admin.css";

const sections = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "hosts", label: "Hosts", icon: MonitorSmartphone },
  { key: "sessions", label: "Sessions", icon: Activity },
  { key: "users", label: "Users", icon: Users },
  { key: "usage", label: "Usage", icon: Clock3 },
  { key: "logs", label: "Logs", icon: Logs },
];

function formatDurationMinutes(minutes) {
  const wholeMinutes = Number(minutes || 0);
  if (wholeMinutes < 60) return `${wholeMinutes} min`;
  const hours = Math.floor(wholeMinutes / 60);
  const remainder = wholeMinutes % 60;
  return `${hours}h ${remainder}m`;
}

function formatUptime(seconds) {
  const total = Number(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDateTime(value) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

function Pill({ tone, children }) {
  return <span className={`admin-pill admin-pill-${tone}`}>{children}</span>;
}

function StatCard({ label, value, detail, icon: Icon }) {
  return (
    <section className="admin-stat-card">
      <div className="admin-stat-heading">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <div className="admin-stat-value">{value}</div>
      <p className="admin-muted">{detail}</p>
    </section>
  );
}

function AdminTable({ columns, rows, emptyText }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="admin-empty-cell">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id || row.key || index}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState({
    stats: {
      total_hosts: 0,
      active_hosts: 0,
      offline_hosts: 0,
      active_sessions: 0,
      total_users: 0,
      system_uptime_seconds: 0,
    },
    settings: {
      allow_new_sessions: true,
      max_session_minutes: 120,
      live_poll_seconds: 10,
    },
    alerts: [],
  });
  const [hosts, setHosts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [users, setUsers] = useState([]);
  const [usage, setUsage] = useState({ hosts: [], users: [] });
  const [logs, setLogs] = useState([]);
  const [settingsForm, setSettingsForm] = useState({
    allow_new_sessions: true,
    max_session_minutes: 120,
    live_poll_seconds: 10,
  });

  const loadAdminData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      setError("");
      const bootstrapRes = await api.get("/api/admin/bootstrap");
      const payload = bootstrapRes.data || {};

      setOverview((current) => payload.overview || current);
      setHosts(payload.hosts || []);
      setSessions(payload.sessions || []);
      setUsers(payload.users || []);
      setUsage(payload.usage || { hosts: [], users: [] });
      setLogs(payload.logs || []);
      setSettingsForm((current) => payload.overview?.settings || current);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load admin dashboard");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData(true);
  }, [loadAdminData]);

  useEffect(() => {
    const pollSeconds = Number(overview.settings?.live_poll_seconds || 10);
    const interval = window.setInterval(() => {
      loadAdminData(false);
    }, Math.max(5, pollSeconds) * 1000);
    return () => window.clearInterval(interval);
  }, [overview.settings?.live_poll_seconds, loadAdminData]);

  async function withRefresh(action, successMessage) {
    try {
      setError("");
      setNotice("");
      await action();
      await loadAdminData(false);
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      const details =
        err.response?.data?.message ||
        err.message ||
        "Action failed";
      setError(`Action failed: ${details}`);
    } finally {
      setBusyKey("");
      setSavingSettings(false);
    }
  }

  async function toggleHost(hostId, enabled) {
    setBusyKey(`host-${hostId}`);
    await withRefresh(() => api.post(`/api/admin/hosts/${hostId}/toggle`, { enabled }), `Host ${enabled ? "enabled" : "disabled"}`);
  }

  async function removeHost(hostId) {
    setBusyKey(`remove-${hostId}`);
    await withRefresh(() => api.delete(`/api/admin/hosts/${hostId}`), "Host removed");
  }

  async function terminateSession(sessionId) {
    setBusyKey(`session-${sessionId}`);
    await withRefresh(() => api.post(`/api/admin/sessions/${sessionId}/terminate`), "Session terminated");
  }

  async function toggleUserBlock(userId, blocked) {
    setBusyKey(`user-${userId}`);
    await withRefresh(() => api.post(`/api/admin/users/${userId}/block`, { blocked }), `User ${blocked ? "blocked" : "unblocked"}`);
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    await withRefresh(
      () => api.post("/api/admin/settings", settingsForm),
      "System settings updated"
    );
  }

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === "running"),
    [sessions]
  );
  const pastSessions = useMemo(
    () => sessions.filter((session) => session.status !== "running"),
    [sessions]
  );

  const dashboardView = (
    <div className="admin-panel-stack">
      <section className="admin-grid">
        <StatCard
          label="Total Hosts"
          value={overview.stats.total_hosts}
          detail={`${overview.stats.active_hosts} active now`}
          icon={MonitorSmartphone}
        />
        <StatCard
          label="Offline Hosts"
          value={overview.stats.offline_hosts}
          detail="Need attention or heartbeat recovery"
          icon={ShieldAlert}
        />
        <StatCard
          label="Active Sessions"
          value={overview.stats.active_sessions}
          detail={`${pastSessions.length} archived sessions`}
          icon={Activity}
        />
        <StatCard
          label="Total Users"
          value={overview.stats.total_users}
          detail={`Uptime ${formatUptime(overview.stats.system_uptime_seconds)}`}
          icon={Users}
        />
      </section>

      <div className="admin-split">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>System Alerts</h2>
              <p className="admin-muted">Live warnings generated from host health and activity.</p>
            </div>
            <AlertTriangle size={18} />
          </div>
          <div className="admin-alert-list">
            {overview.alerts.length === 0 ? (
              <p className="admin-muted">No active alerts.</p>
            ) : (
              overview.alerts.map((alert, index) => (
                <div key={`${alert.type}-${index}`} className="admin-alert-card">
                  <Pill tone={alert.level === "warning" ? "warn" : "ok"}>{alert.level}</Pill>
                  <span>{alert.message}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>System Control</h2>
              <p className="admin-muted">Core operating policies for ComputeX.</p>
            </div>
            <Power size={18} />
          </div>
          <form className="admin-settings-form" onSubmit={saveSettings}>
            <label className="admin-toggle-row">
              <span>Allow new sessions</span>
              <input
                type="checkbox"
                checked={settingsForm.allow_new_sessions}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    allow_new_sessions: event.target.checked,
                  }))
                }
              />
            </label>

            <label>
              <span>Max session time (minutes)</span>
              <input
                type="number"
                min="15"
                value={settingsForm.max_session_minutes}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    max_session_minutes: Number(event.target.value || 120),
                  }))
                }
              />
            </label>

            <label>
              <span>Live refresh interval (seconds)</span>
              <input
                type="number"
                min="5"
                value={settingsForm.live_poll_seconds}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    live_poll_seconds: Number(event.target.value || 10),
                  }))
                }
              />
            </label>

            <button className="admin-primary-button" disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save Controls"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );

  const hostsView = (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Host Management</h2>
          <p className="admin-muted">Visibility and control across every registered host.</p>
        </div>
      </div>
      <AdminTable
        emptyText="No hosts found."
        columns={[
          {
            key: "host",
            label: "Host",
            render: (host) => (
              <div>
                <strong>{host.name || host.email || host.id}</strong>
                <div className="admin-muted">{host.device?.label || "No linked device"}</div>
              </div>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (host) => (
              <div className="admin-cell-stack">
                <Pill tone={host.presence === "online" ? "ok" : "neutral"}>
                  {host.presence === "online" ? "connected" : "offline"}
                </Pill>
                <Pill tone={host.availability === "available" ? "ok" : host.availability === "busy" ? "warn" : "neutral"}>
                  {host.availability || "available"}
                </Pill>
                <Pill tone={host.enabled ? "ok" : "warn"}>{host.enabled ? "enabled" : "disabled"}</Pill>
              </div>
            ),
          },
          {
            key: "cpu",
            label: "CPU / RAM",
            render: (host) => `${host.telemetry?.cpu ?? "--"}% / ${host.telemetry?.ram ?? "--"}%`,
          },
          {
            key: "sessions",
            label: "Sessions",
            render: (host) => `${host.active_sessions} active / ${host.total_sessions} total`,
          },
          {
            key: "lastSeen",
            label: "Last Seen",
            render: (host) => formatDateTime(host.device?.last_seen_at),
          },
          {
            key: "actions",
            label: "Action",
            render: (host) => (
              <div className="admin-action-row">
                <button
                  className="admin-secondary-button"
                  disabled={busyKey === `host-${host.id}`}
                  onClick={() => toggleHost(host.id, !host.enabled)}
                >
                  {busyKey === `host-${host.id}`
                    ? "Updating..."
                    : host.enabled
                    ? "Disable"
                    : "Enable"}
                </button>
                <button
                  className="admin-danger-button"
                  disabled={busyKey === `remove-${host.id}`}
                  onClick={() => removeHost(host.id)}
                >
                  {busyKey === `remove-${host.id}` ? "Removing..." : "Remove"}
                </button>
              </div>
            ),
          },
        ]}
        rows={hosts}
      />
    </section>
  );

  const sessionsView = (
    <div className="admin-panel-stack">
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Active Sessions</h2>
            <p className="admin-muted">Current workloads across the platform.</p>
          </div>
        </div>
        <AdminTable
          emptyText="No active sessions."
          columns={[
            { key: "id", label: "Session ID", render: (session) => session.id },
            { key: "user", label: "User", render: (session) => session.user_name || session.user_email || session.user_id },
            { key: "host", label: "Host", render: (session) => session.host_name || session.host_email || session.host_id || "Unassigned" },
            { key: "start", label: "Start Time", render: (session) => formatDateTime(session.started_at) },
            { key: "duration", label: "Duration", render: (session) => formatDurationMinutes(session.duration_minutes) },
            {
              key: "action",
              label: "Action",
              render: (session) => (
                <button
                  className="admin-danger-button"
                  disabled={busyKey === `session-${session.id}`}
                  onClick={() => terminateSession(session.id)}
                >
                  {busyKey === `session-${session.id}` ? "Ending..." : "End"}
                </button>
              ),
            },
          ]}
          rows={activeSessions}
        />
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Past Sessions</h2>
            <p className="admin-muted">Recent history for audits and usage review.</p>
          </div>
        </div>
        <AdminTable
          emptyText="No historical sessions."
          columns={[
            { key: "id", label: "Session ID", render: (session) => session.id },
            { key: "user", label: "User", render: (session) => session.user_name || session.user_email || session.user_id },
            { key: "host", label: "Host", render: (session) => session.host_name || session.host_email || session.host_id || "Unassigned" },
            { key: "start", label: "Start Time", render: (session) => formatDateTime(session.started_at) },
            { key: "duration", label: "Duration", render: (session) => formatDurationMinutes(session.duration_minutes) },
            {
              key: "status",
              label: "Status",
              render: (session) => <Pill tone={session.status === "failed" ? "warn" : "neutral"}>{session.status}</Pill>,
            },
          ]}
          rows={pastSessions.slice(0, 20)}
        />
      </section>
    </div>
  );

  const usersView = (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>User Management</h2>
          <p className="admin-muted">Usage history and account control.</p>
        </div>
      </div>
      <AdminTable
        emptyText="No users found."
        columns={[
          {
            key: "user",
            label: "User",
            render: (user) => (
              <div>
                <strong>{user.name}</strong>
                <div className="admin-muted">{user.email}</div>
              </div>
            ),
          },
          { key: "hosts", label: "Hosts", render: (user) => user.host_count },
          { key: "history", label: "Usage History", render: (user) => `${user.session_count} sessions / ${formatDurationMinutes(user.total_minutes)}` },
          { key: "active", label: "Active", render: (user) => user.active_sessions },
          {
            key: "status",
            label: "Status",
            render: (user) => <Pill tone={user.blocked ? "warn" : "ok"}>{user.blocked ? "blocked" : "active"}</Pill>,
          },
          {
            key: "action",
            label: "Action",
            render: (user) => (
              <button
                className={user.blocked ? "admin-secondary-button" : "admin-danger-button"}
                disabled={busyKey === `user-${user.id}`}
                onClick={() => toggleUserBlock(user.id, !user.blocked)}
              >
                {busyKey === `user-${user.id}`
                  ? "Updating..."
                  : user.blocked
                  ? "Unblock"
                  : "Block"}
              </button>
            ),
          },
        ]}
        rows={users}
      />
    </section>
  );

  const usageView = (
    <div className="admin-split">
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Host Usage Accounting</h2>
            <p className="admin-muted">Supports host compensation and utilization tracking.</p>
          </div>
          <Cpu size={18} />
        </div>
        <AdminTable
          emptyText="No host usage yet."
          columns={[
            { key: "host", label: "Host", render: (row) => row.host_name },
            { key: "minutes", label: "Minutes Used", render: (row) => formatDurationMinutes(row.total_minutes) },
            { key: "sessions", label: "Sessions", render: (row) => row.session_count },
          ]}
          rows={usage.hosts}
        />
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>User Usage Accounting</h2>
            <p className="admin-muted">Per-user demand across the system.</p>
          </div>
          <Users size={18} />
        </div>
        <AdminTable
          emptyText="No user usage yet."
          columns={[
            {
              key: "user",
              label: "User",
              render: (row) => (
                <div>
                  <strong>{row.user_name}</strong>
                  <div className="admin-muted">{row.user_email}</div>
                </div>
              ),
            },
            { key: "minutes", label: "Minutes Used", render: (row) => formatDurationMinutes(row.total_minutes) },
            { key: "sessions", label: "Sessions", render: (row) => row.session_count },
          ]}
          rows={usage.users}
        />
      </section>
    </div>
  );

  const logsView = (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Audit Logs</h2>
          <p className="admin-muted">Login events, session lifecycle changes, host operations, and settings changes.</p>
        </div>
      </div>
      <div className="admin-log-list">
        {logs.length === 0 ? (
          <p className="admin-muted">No audit events yet.</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="admin-log-item">
              <div className="admin-log-top">
                <strong>{log.message}</strong>
                <Pill tone="neutral">{formatDateTime(log.created_at)}</Pill>
              </div>
              <div className="admin-log-meta">
                <span>Type: {log.event_type}</span>
                <span>Actor: {log.actor_name || log.actor_email || "system"}</span>
                <span>Target: {log.target_type || "n/a"} {log.target_id || ""}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );

  const sectionContent = {
    dashboard: dashboardView,
    hosts: hostsView,
    sessions: sessionsView,
    users: usersView,
    usage: usageView,
    logs: logsView,
  };

  if (loading) {
    return <div className="admin-shell"><div className="admin-loading">Loading ComputeX admin...</div></div>;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark">CX</span>
          <div>
            <strong>ComputeX Admin</strong>
            <p>Visibility and control</p>
          </div>
        </div>

        <nav className="admin-nav">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.key;
            return (
              <button
                key={section.key}
                className={`admin-nav-item ${active ? "is-active" : ""}`}
                onClick={() => setActiveSection(section.key)}
              >
                <Icon size={18} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1>ComputeX Control Center</h1>
            <p>Answering host availability, active usage, and audit questions in one place.</p>
          </div>
          <button className="admin-secondary-button" onClick={() => loadAdminData(false)}>
            Refresh
          </button>
        </header>

        {error ? <div className="admin-banner admin-banner-error">{error}</div> : null}
        {notice ? <div className="admin-banner admin-banner-success">{notice}</div> : null}

        {sectionContent[activeSection]}
      </main>
    </div>
  );
}
