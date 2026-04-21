import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import sqlite3 from "sqlite3";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const JWT_SECRET = process.env.JWT_SECRET || "computex_dev_secret";
const HOST_AGENT_SECRET = process.env.HOST_AGENT_SECRET || "computex_host_secret";
const PAIRING_SECRET = process.env.PAIRING_SECRET || "computex_pairing_secret";
const EMAIL_CODE_TTL_MIN = 15;
const PAIR_CODE_TTL_MIN = 30;

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "";
const GLOBAL_DASHBOARD = true;
const DASHBOARD_FAST_MODE = true;
const SERVER_STARTED_AT = Date.now();
const HOST_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_CODE_SERVER_IMAGE = process.env.COMPUTEX_CODE_IMAGE || "computex-code";
const DEFAULT_PYTHON_INTERPRETER_IMAGE =
  process.env.COMPUTEX_IMAGE_PYTHON_INTERPRETER || process.env.COMPUTEX_IMAGE_PYTHON || "computex-python-interpreter";
const IMAGE_ALIAS_MAP = new Map([
  [DEFAULT_CODE_SERVER_IMAGE, DEFAULT_PYTHON_INTERPRETER_IMAGE],
  ["computex-python", DEFAULT_PYTHON_INTERPRETER_IMAGE],
]);
const DEFAULT_SESSION_ROOT = process.env.COMPUTEX_SESSION_ROOT || "C:/computex/projects";
const DEFAULT_WORKSPACE_ROOT = process.env.COMPUTEX_WORKSPACE_ROOT || "C:/computex/workspaces";
const CODING_SESSION_HOST_TIMEOUT_MS = process.env.COMPUTEX_CODING_HOST_TIMEOUT_MS
  ? Number(process.env.COMPUTEX_CODING_HOST_TIMEOUT_MS)
  : 3 * 60 * 1000;
const GLOBAL_HOST_POOL_ENABLED = !["0", "false", "off", "no"].includes(
  String(process.env.COMPUTEX_GLOBAL_HOST_POOL ?? "true").toLowerCase()
);
const NO_PAIRED_HOST_MESSAGE =
  "No paired online host is available for this account. Make sure the host app is signed in with the same user account.";
const NO_AVAILABLE_HOST_MESSAGE =
  "No online host is currently available. Keep at least one host app connected.";
const NO_HEALTHY_HOST_MESSAGE =
  "All available hosts are currently above safe load limits. Please retry in a moment.";
const WORKSPACE_TOOL_LIMIT = 5;
const WORKSPACE_TOOL_CATALOG = [
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

function normalizeCodingImageKey(imageKey) {
  const raw = String(imageKey || "").trim();
  if (!raw) return raw;
  return IMAGE_ALIAS_MAP.get(raw) || raw;
}

const WORKSPACE_PRESETS = [
  {
    key: "python",
    name: "Python Workspace",
    tools: ["python", "git"],
    image_key: DEFAULT_PYTHON_INTERPRETER_IMAGE,
  },
  {
    key: "node",
    name: "Web Dev Workspace",
    tools: ["node", "git"],
    image_key: process.env.COMPUTEX_IMAGE_NODE || "computex-node",
  },
  {
    key: "flutter",
    name: "Mobile Dev Workspace",
    tools: ["flutter", "git"],
    image_key: process.env.COMPUTEX_IMAGE_FLUTTER || "computex-flutter",
  },
  {
    key: "fullstack",
    name: "Fullstack Workspace",
    tools: ["python", "node", "git", "postgres", "redis"],
    image_key: process.env.COMPUTEX_IMAGE_FULLSTACK || "computex-fullstack",
  },
  {
    key: "data",
    name: "Data Science Workspace",
    tools: ["python", "jupyter", "git"],
    image_key: process.env.COMPUTEX_IMAGE_DATA || "computex-data",
  },
  {
    key: "go",
    name: "Go Backend Workspace",
    tools: ["go", "git", "docker"],
    image_key: process.env.COMPUTEX_IMAGE_GO || "computex-go",
  },
  {
    key: "rust",
    name: "Rust Systems Workspace",
    tools: ["rust", "git", "docker"],
    image_key: process.env.COMPUTEX_IMAGE_RUST || "computex-rust",
  },
  {
    key: "java",
    name: "Java Workspace",
    tools: ["java", "git", "docker"],
    image_key: process.env.COMPUTEX_IMAGE_JAVA || "computex-java",
  },
  {
    key: "cpp",
    name: "C/C++ Workspace",
    tools: ["cpp", "git", "docker"],
    image_key: process.env.COMPUTEX_IMAGE_CPP || "computex-cpp",
  },
  {
    key: "php",
    name: "PHP Workspace",
    tools: ["php", "git", "node"],
    image_key: process.env.COMPUTEX_IMAGE_PHP || "computex-php",
  },
  {
    key: "dotnet",
    name: ".NET Workspace",
    tools: ["dotnet", "git", "docker"],
    image_key: process.env.COMPUTEX_IMAGE_DOTNET || "computex-dotnet",
  },
  {
    key: "devops",
    name: "DevOps Workspace",
    tools: ["docker", "k8s", "git", "node"],
    image_key: process.env.COMPUTEX_IMAGE_DEVOPS || "computex-devops",
  },
];

const WORKSPACE_PRESET_MAP = Object.fromEntries(WORKSPACE_PRESETS.map((preset) => [preset.key, preset]));

const ENVIRONMENT_CATALOG = {
  coding: {
    id: "coding",
    title: "Coding Workspace",
    status: "available",
    image: DEFAULT_PYTHON_INTERPRETER_IMAGE,
    category: "Development",
    description: "VS Code in the browser with Python, Node.js, Git, and a persistent project folder.",
  },
  browser: {
    id: "browser",
    title: "Web Browser",
    status: "coming_soon",
    category: "Productivity",
    description: "Chromium or Firefox inside a lightweight desktop for low-end devices.",
  },
  office: {
    id: "office",
    title: "Office Tools",
    status: "coming_soon",
    category: "Productivity",
    description: "LibreOffice Writer, Calc, and Impress in a ready-to-use workspace.",
  },
  data: {
    id: "data",
    title: "Data Science Lab",
    status: "coming_soon",
    category: "Analytics",
    description: "Jupyter notebooks with Python, NumPy, and pandas preinstalled.",
  },
  desktop: {
    id: "desktop",
    title: "Full Desktop",
    status: "coming_soon",
    category: "General",
    description: "A general-purpose XFCE desktop with files, terminal, and workspace tools.",
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.join(__dirname, "computex.db");

const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbFile);

db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA busy_timeout = 5000");
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      const suffix = label ? " (" + label + ")" : "";
      const error = new Error("Timeout after " + ms + "ms" + suffix);
      error.code = "DB_TIMEOUT";
      reject(error);
    }, ms);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeout,
  ]);
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      host_id TEXT,
      user_id TEXT,
      environment_type TEXT,
      image TEXT,
      container_name TEXT,
      access_url TEXT,
      access_password TEXT,
      workspace_id TEXT,
      workspace_path TEXT,
      preset_key TEXT,
      selected_tools TEXT
    )
  `);


  await run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      image_key TEXT,
      selected_tools TEXT,
      preset_key TEXT,
      created_at TEXT NOT NULL,
      last_used TEXT
    )
  `);  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS credits (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL,
      used INTEGER NOT NULL,
      monthly_limit INTEGER NOT NULL,
      remaining INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      attempts INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS host_devices (
      id TEXT PRIMARY KEY,
      label TEXT,
      os TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      live_status TEXT,
      pair_code TEXT,
      pair_code_slot INTEGER,
      pair_code_random TEXT,
      pair_code_expires_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS hosts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      location TEXT,
      payout_handle TEXT,
      gpu TEXT,
      status TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS pairing_sessions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS host_telemetry (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      cpu INTEGER,
      ram INTEGER,
      disk INTEGER,
      status TEXT,
      active_sessions INTEGER,
      net_up TEXT,
      net_down TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor_user_id TEXT,
      target_type TEXT,
      target_id TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS host_admin_state (
      host_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_admin_state (
      user_id TEXT PRIMARY KEY,
      blocked INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

await initDb();

async function migrateDb() {
  const migrations = [
    "ALTER TABLE host_devices ADD COLUMN live_status TEXT",
    "ALTER TABLE host_telemetry ADD COLUMN status TEXT",
    "ALTER TABLE host_telemetry ADD COLUMN active_sessions INTEGER",
    "ALTER TABLE sessions ADD COLUMN environment_type TEXT",
    "ALTER TABLE sessions ADD COLUMN image TEXT",
    "ALTER TABLE sessions ADD COLUMN container_name TEXT",
    "ALTER TABLE sessions ADD COLUMN access_url TEXT",
    "ALTER TABLE sessions ADD COLUMN access_password TEXT",
    "ALTER TABLE sessions ADD COLUMN workspace_id TEXT",
    "ALTER TABLE sessions ADD COLUMN workspace_path TEXT",
    "ALTER TABLE sessions ADD COLUMN preset_key TEXT",
    "ALTER TABLE sessions ADD COLUMN selected_tools TEXT",
    "ALTER TABLE workspaces ADD COLUMN image_key TEXT",
    "ALTER TABLE workspaces ADD COLUMN selected_tools TEXT",
    "ALTER TABLE workspaces ADD COLUMN preset_key TEXT",
  ];

  for (const sql of migrations) {
    try {
      await run(sql);
    } catch (err) {
      if (!String(err?.message || "").includes("duplicate column name")) {
        throw err;
      }
    }
  }
}

await migrateDb();

async function migrateLegacyCodingImageDefaults() {
  // Keep older records from pinning new launches to the legacy non-Python base image.
  await run(
    "UPDATE workspaces SET image_key = ? WHERE type = 'coding' AND (image_key IS NULL OR TRIM(image_key) = '' OR image_key = ?)",
    [DEFAULT_PYTHON_INTERPRETER_IMAGE, DEFAULT_CODE_SERVER_IMAGE]
  );

  await run(
    "UPDATE sessions SET image = ? WHERE environment_type = 'coding' AND status = 'starting' AND (image IS NULL OR TRIM(image) = '' OR image = ?)",
    [DEFAULT_PYTHON_INTERPRETER_IMAGE, DEFAULT_CODE_SERVER_IMAGE]
  );
}

await migrateLegacyCodingImageDefaults();

async function seedSystemSettings() {
  const now = new Date().toISOString();
  const defaults = [
    ["allow_new_sessions", "true"],
    ["max_session_minutes", "120"],
    ["live_poll_seconds", "10"],
    ["enforce_host_overuse_protection", "true"],
    ["host_max_cpu_percent", "90"],
    ["host_max_ram_percent", "90"],
    ["host_max_disk_percent", "95"],
    ["host_telemetry_stale_seconds", "30"],
  ];

  for (const [key, value] of defaults) {
    await run(
      "INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)",
      [key, value, now]
    );
  }
}

await seedSystemSettings();

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: true, credentials: true });

fastify.addHook("onRequest", (request, _reply, done) => {
  if (request.url === "/api/hosts/agent/link") {
    fastify.log.info({ reqId: request.id }, "agent link onRequest");
  }
  done();
});

fastify.addHook("onResponse", (request, reply, done) => {
  if (request.url === "/api/hosts/pair/verify") {
    fastify.log.info({ reqId: request.id, statusCode: reply.statusCode }, "pair verify response");
  }
  done();
});

const httpServer = fastify.server;
const io = new Server(httpServer, {
  cors: { origin: true, methods: ["GET", "POST"] },
});

const hostSockets = new Map();
const clientSockets = new Map();
const launchSessionUser = new Map();
let mailer = null;

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function verifySocketToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function parseBooleanSetting(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function parseNumberSetting(value, fallback, min = null, max = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  let next = parsed;
  if (min !== null) {
    next = Math.max(min, next);
  }
  if (max !== null) {
    next = Math.min(max, next);
  }
  return next;
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hostPresenceFromLastSeen(lastSeenAt) {
  if (!lastSeenAt) return "offline";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  return diff <= HOST_ONLINE_WINDOW_MS ? "online" : "offline";
}

function normalizeHostAvailability(value) {
  const normalized = String(value || "").toLowerCase();
  if (!normalized || normalized === "online") return "available";
  if (["available", "busy", "offline", "maintenance"].includes(normalized)) {
    return normalized;
  }
  return "available";
}

function hostAvailabilityFromState(device, telemetry) {
  if (hostPresenceFromLastSeen(device?.last_seen_at) === "offline") {
    return "offline";
  }
  return normalizeHostAvailability(telemetry?.status || device?.live_status);
}

function evaluateHostOveruseState(host, telemetry, settings) {
  if (!settings?.enforce_host_overuse_protection) {
    return { blocked: false, reason: null };
  }

  if (!telemetry) {
    return { blocked: true, reason: "missing_telemetry" };
  }

  const telemetryCreatedAt = new Date(telemetry.created_at || 0).getTime();
  const telemetryAgeMs = Number.isFinite(telemetryCreatedAt) ? Date.now() - telemetryCreatedAt : Number.POSITIVE_INFINITY;
  if (telemetryAgeMs > settings.host_telemetry_stale_seconds * 1000) {
    return { blocked: true, reason: "stale_telemetry", telemetryAgeMs };
  }

  const cpu = Number(telemetry.cpu ?? 0);
  const ram = Number(telemetry.ram ?? 0);
  const disk = Number(telemetry.disk ?? 0);

  if (Number.isFinite(cpu) && cpu >= settings.host_max_cpu_percent) {
    return { blocked: true, reason: "cpu", metric: "cpu", value: cpu, threshold: settings.host_max_cpu_percent };
  }
  if (Number.isFinite(ram) && ram >= settings.host_max_ram_percent) {
    return { blocked: true, reason: "ram", metric: "ram", value: ram, threshold: settings.host_max_ram_percent };
  }
  if (Number.isFinite(disk) && disk >= settings.host_max_disk_percent) {
    return { blocked: true, reason: "disk", metric: "disk", value: disk, threshold: settings.host_max_disk_percent };
  }

  return { blocked: false, reason: null };
}

function formatDurationMinutes(startedAt, endedAt = null) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 60000);
}

async function insertAuditLog({ eventType, actorUserId = null, targetType = null, targetId = null, message, metadata = null }) {
  await run(
    "INSERT INTO audit_logs (id, event_type, actor_user_id, target_type, target_id, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      uuidv4(),
      eventType,
      actorUserId,
      targetType,
      targetId,
      message,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString(),
    ]
  );
}

async function getSystemSettings() {
  const rows = await all("SELECT key, value FROM system_settings");
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    allow_new_sessions: parseBooleanSetting(map.allow_new_sessions, true),
    max_session_minutes: parseNumberSetting(map.max_session_minutes, 120, 15, null),
    live_poll_seconds: parseNumberSetting(map.live_poll_seconds, 10, 5, null),
    enforce_host_overuse_protection: parseBooleanSetting(map.enforce_host_overuse_protection, true),
    host_max_cpu_percent: parseNumberSetting(map.host_max_cpu_percent, 90, 1, 100),
    host_max_ram_percent: parseNumberSetting(map.host_max_ram_percent, 90, 1, 100),
    host_max_disk_percent: parseNumberSetting(map.host_max_disk_percent, 95, 1, 100),
    host_telemetry_stale_seconds: parseNumberSetting(map.host_telemetry_stale_seconds, 30, 5, 600),
  };
}

function getEnvironmentCatalog() {
  return Object.values(ENVIRONMENT_CATALOG);
}

async function findLaunchHostForUser(userId, requestedHostId = null, options = {}) {
  const includeGlobalPool = Boolean(options.includeGlobalPool);
  const ignoreOveruseProtection = Boolean(options.ignoreOveruseProtection);
  const settings = options.settings || (await getSystemSettings());
  const params = [];
  let sql = `
    SELECT
      h.*,
      d.id AS device_ref,
      d.last_seen_at,
      d.live_status
    FROM hosts h
    LEFT JOIN host_devices d ON d.id = h.device_id
  `;

  if (requestedHostId) {
    sql += " WHERE (h.id = ? OR h.device_id = ?)";
    params.push(requestedHostId, requestedHostId);
    if (!includeGlobalPool) {
      sql += " AND h.user_id = ?";
      params.push(userId);
    }
  } else if (includeGlobalPool) {
    sql += " WHERE 1 = 1";
  } else {
    sql += " WHERE h.user_id = ?";
    params.push(userId);
  }

  sql += " ORDER BY h.created_at DESC";

  const hosts = await all(sql, params);
  if (!hosts.length) {
    return { host: null, reason: null };
  }

  const orderedHosts =
    includeGlobalPool && !requestedHostId
      ? [
          ...hosts.filter((host) => host.user_id === userId),
          ...hosts.filter((host) => host.user_id !== userId),
        ]
      : hosts;

  const telemetryDeviceIds = [...new Set(orderedHosts.map((host) => host.device_id).filter(Boolean))];
  const latestTelemetryMap = telemetryDeviceIds.length ? await getLatestTelemetryMap(telemetryDeviceIds) : {};

  let fallbackHost = null;
  let blockedByOveruse = false;
  for (const host of orderedHosts) {
    if (!host.device_id) continue;
    const adminState = await get("SELECT enabled FROM host_admin_state WHERE host_id = ?", [host.id]);
    if (adminState && !adminState.enabled) continue;

    const telemetry = latestTelemetryMap[host.device_id] || null;
    const overuseState = ignoreOveruseProtection
      ? { blocked: false, reason: null }
      : evaluateHostOveruseState(host, telemetry, settings);
    if (overuseState.blocked) {
      blockedByOveruse = true;
      fastify.log.warn(
        {
          hostId: host.id,
          deviceId: host.device_id,
          reason: overuseState.reason,
          metric: overuseState.metric || null,
          value: overuseState.value ?? null,
          threshold: overuseState.threshold ?? null,
          telemetryAgeMs: overuseState.telemetryAgeMs ?? null,
        },
        "host.overuse.blocked"
      );
      continue;
    }

    if (hostSockets.has(host.device_id) && normalizeHostAvailability(host.live_status) !== "maintenance") {
      return { host, reason: null };
    }
    const availability = hostAvailabilityFromState(
      { last_seen_at: host.last_seen_at, live_status: host.live_status },
      { status: host.live_status }
    );
    if (availability === "offline" || availability === "maintenance") continue;
    if (!fallbackHost) fallbackHost = host;
  }

  if (fallbackHost) {
    return { host: fallbackHost, reason: null };
  }
  if (blockedByOveruse) {
    return { host: null, reason: "overloaded" };
  }
  return { host: null, reason: null };
}

async function emitHostCommand(deviceId, command, payload = {}, timeoutMs = 20000) {
  const socket = hostSockets.get(deviceId);
  if (!socket) {
    throw new Error("Selected host is not currently connected");
  }

  fastify.log.info({ deviceId, command, timeoutMs }, "emitHostCommand");
  return await new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit("host:command", { command, payload }, (err, response) => {
      if (err) {
        reject(new Error("Host command timed out"));
        return;
      }

      if (response && response.ok === false) {
        reject(new Error(response.message || "Host command failed"));
        return;
      }

      resolve(response || { ok: true });
    });
  });
}

async function getSessionDispatchTarget(session) {
  if (!session?.host_id) return null;
  const host = await get("SELECT * FROM hosts WHERE id = ?", [session.host_id]);
  if (host?.device_id) {
    return { host, deviceId: host.device_id };
  }
  return { host: null, deviceId: session.host_id };
}
function mapSessionToContainer(session) {
  return {
    id: session.id,
    session_id: session.id,
    name: session.container_name || session.title,
    status: session.status,
    cpu_usage: 0,
    memory_usage: 0,
    access_url: session.access_url || null,
    access_password: session.access_password || null,
    environment_type: session.environment_type || "general",
    workspace_id: session.workspace_id || null,
    host: session.host_id ? { name: session.host_id } : null,
    session: {
      name: session.title,
      user: null,
    },
  };
}


function sanitizePathSegment(input) {
  return String(input || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function buildWorkspacePath(userId, workspaceId) {
  const userDir = `user_${sanitizePathSegment(userId)}`;
  return path.join(DEFAULT_WORKSPACE_ROOT, userDir, workspaceId).replace(/\\/g, "/");
}

async function getUserWorkspaces(userId, type = null) {
  if (type) {
    const rows = await all(
      "SELECT * FROM workspaces WHERE user_id = ? AND type = ? ORDER BY COALESCE(last_used, created_at) DESC",
      [userId, type]
    );
    return rows.map(normalizeWorkspaceRow);
  }
  const rows = await all("SELECT * FROM workspaces WHERE user_id = ? ORDER BY COALESCE(last_used, created_at) DESC", [userId]);
  return rows.map(normalizeWorkspaceRow);
}

function sanitizeWorkspaceTools(inputTools = []) {
  const requestedTools = Array.isArray(inputTools) ? inputTools.map((tool) => String(tool || "").trim().toLowerCase()) : [];
  const catalogIds = new Set(WORKSPACE_TOOL_CATALOG.map((tool) => tool.id));
  const deduped = [];
  for (const tool of requestedTools) {
    if (!catalogIds.has(tool) || deduped.includes(tool)) continue;
    deduped.push(tool);
    if (deduped.length >= WORKSPACE_TOOL_LIMIT) break;
  }
  return deduped;
}

function inferImageForTools(selectedTools = []) {
  const tools = new Set(selectedTools);
  if (tools.has("flutter")) return process.env.COMPUTEX_IMAGE_FLUTTER || "computex-flutter";
  if (tools.has("dotnet")) return process.env.COMPUTEX_IMAGE_DOTNET || "computex-dotnet";
  if (tools.has("rust")) return process.env.COMPUTEX_IMAGE_RUST || "computex-rust";
  if (tools.has("java")) return process.env.COMPUTEX_IMAGE_JAVA || "computex-java";
  if (tools.has("cpp")) return process.env.COMPUTEX_IMAGE_CPP || "computex-cpp";
  if (tools.has("php")) return process.env.COMPUTEX_IMAGE_PHP || "computex-php";
  if (tools.has("go")) return process.env.COMPUTEX_IMAGE_GO || "computex-go";
  if (tools.has("jupyter")) return process.env.COMPUTEX_IMAGE_DATA || "computex-data";
  if (tools.has("python") && tools.has("node")) return process.env.COMPUTEX_IMAGE_FULLSTACK || "computex-fullstack";
  if (tools.has("node")) return process.env.COMPUTEX_IMAGE_NODE || "computex-node";
  if (tools.has("python")) return DEFAULT_PYTHON_INTERPRETER_IMAGE;
  return DEFAULT_CODE_SERVER_IMAGE;
}

function resolveWorkspaceProfile(payload = {}, fallbackPresetKey = "python") {
  const requestedPresetKey = payload.preset_key || payload.presetKey || fallbackPresetKey;
  const normalizedPresetKey = String(requestedPresetKey || "").trim().toLowerCase();
  const isCustom = normalizedPresetKey === "custom";
  const preset = !isCustom && normalizedPresetKey ? WORKSPACE_PRESET_MAP[normalizedPresetKey] : null;
  const selectedTools = sanitizeWorkspaceTools(payload.tools || payload.selected_tools || preset?.tools || []);
  const overrideImageKey = payload.image_key || payload.imageKey || null;
  const resolvedImageKey = overrideImageKey || preset?.image_key || inferImageForTools(selectedTools);
  return {
    preset_key: isCustom ? "custom" : preset?.key || null,
    selected_tools: selectedTools,
    image_key: resolvedImageKey,
  };
}

function normalizeWorkspaceRow(row) {
  if (!row) return null;
  let parsedTools = [];
  if (Array.isArray(row.selected_tools)) {
    parsedTools = sanitizeWorkspaceTools(row.selected_tools);
  } else if (typeof row.selected_tools === "string" && row.selected_tools.trim()) {
    try {
      parsedTools = sanitizeWorkspaceTools(JSON.parse(row.selected_tools));
    } catch {
      parsedTools = [];
    }
  }

  return {
    ...row,
    image_key: row.image_key || DEFAULT_PYTHON_INTERPRETER_IMAGE,
    preset_key: row.preset_key || null,
    selected_tools: parsedTools,
  };
}

async function createWorkspaceForUser(userId, payload = {}) {
  const type = payload.type || "coding";
  const id = `ws_${uuidv4().slice(0, 10)}`;
  const createdAt = new Date().toISOString();
  const name = payload.name || (type === "coding" ? "Coding Workspace" : `${type} Workspace`);
  const workspacePath = payload.path || buildWorkspacePath(userId, id);
  const profile = resolveWorkspaceProfile(payload);

  await run(
    "INSERT INTO workspaces (id, user_id, name, type, path, image_key, selected_tools, preset_key, created_at, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, name, type, workspacePath, profile.image_key, JSON.stringify(profile.selected_tools), profile.preset_key, createdAt, createdAt]
  );

  return normalizeWorkspaceRow({
    id,
    user_id: userId,
    name,
    type,
    path: workspacePath,
    image_key: profile.image_key,
    selected_tools: profile.selected_tools,
    preset_key: profile.preset_key,
    created_at: createdAt,
    last_used: createdAt,
  });
}

async function updateWorkspaceProfileForUser(userId, workspaceId, payload = {}) {
  const existing = await get("SELECT * FROM workspaces WHERE id = ? AND user_id = ?", [workspaceId, userId]);
  if (!existing) {
    throw createStatusError(404, "Workspace not found");
  }

  const current = normalizeWorkspaceRow(existing);
  const profile = resolveWorkspaceProfile(
    payload,
    payload.preset_key || payload.presetKey || current.preset_key || "python"
  );
  const name = String(payload.name || current.name || "Coding Workspace").trim() || "Coding Workspace";

  await run(
    "UPDATE workspaces SET name = ?, image_key = ?, selected_tools = ?, preset_key = ?, last_used = ? WHERE id = ? AND user_id = ?",
    [name, profile.image_key, JSON.stringify(profile.selected_tools), profile.preset_key, new Date().toISOString(), workspaceId, userId]
  );

  return normalizeWorkspaceRow({
    ...existing,
    name,
    image_key: profile.image_key,
    selected_tools: profile.selected_tools,
    preset_key: profile.preset_key,
    last_used: new Date().toISOString(),
  });
}

async function resolveWorkspaceForLaunch(userId, environment, launchBody = {}) {
  if (environment !== "coding") {
    return null;
  }

  const skipWorkspace = Boolean(launchBody.skip_workspace || launchBody.skipWorkspace);
  if (skipWorkspace) {
    return null;
  }

  const workspaceId = launchBody.workspace_id || launchBody.workspaceId || null;
  if (workspaceId) {
    const existing = await get("SELECT * FROM workspaces WHERE id = ? AND user_id = ?", [workspaceId, userId]);
    if (!existing) {
      throw createStatusError(404, "Workspace not found");
    }
    if (existing.type !== environment) {
      throw createStatusError(409, "Workspace type does not match selected environment");
    }
    return normalizeWorkspaceRow(existing);
  }

  const deferSave = Boolean(launchBody.defer_workspace_save || launchBody.deferWorkspaceSave);
  if (deferSave) {
    return null;
  }

  const latest = await get(
    "SELECT * FROM workspaces WHERE user_id = ? AND type = ? ORDER BY COALESCE(last_used, created_at) DESC LIMIT 1",
    [userId, environment]
  );

  if (latest) {
    return normalizeWorkspaceRow(latest);
  }

  return createWorkspaceForUser(userId, {
    type: environment,
    name: launchBody.workspace_name || launchBody.workspaceName || "Coding Workspace",
    preset_key: launchBody.preset_key || launchBody.presetKey || "python",
    tools: launchBody.tools || [],
  });
}
function createStatusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function serializeSessionRow(session) {
  return [
    session.id,
    session.title,
    session.status,
    session.started_at,
    session.ended_at,
    session.host_id,
    session.user_id,
    session.environment_type,
    session.image,
    session.container_name,
    session.access_url,
    session.access_password,
    session.workspace_id,
    session.workspace_path,
    session.preset_key,
    session.selected_tools,
  ];
}

async function insertSessionRow(session) {
  await run(
    "INSERT INTO sessions (id, title, status, started_at, ended_at, host_id, user_id, environment_type, image, container_name, access_url, access_password, workspace_id, workspace_path, preset_key, selected_tools) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    serializeSessionRow(session)
  );
}

async function updateSessionLaunchRow(session) {
  await run(
    "UPDATE sessions SET title = ?, status = ?, ended_at = ?, host_id = ?, environment_type = ?, image = ?, container_name = ?, access_url = ?, access_password = ?, workspace_id = ?, workspace_path = ?, preset_key = ?, selected_tools = ? WHERE id = ?",
    [
      session.title,
      session.status,
      session.ended_at,
      session.host_id,
      session.environment_type,
      session.image,
      session.container_name,
      session.access_url,
      session.access_password,
      session.workspace_id,
      session.workspace_path,
      session.preset_key,
      session.selected_tools,
      session.id,
    ]
  );
}

async function updateSessionLaunchProgress(sessionId, updates = {}) {
  const current = await get("SELECT * FROM sessions WHERE id = ?", [sessionId]);
  if (!current) return null;

  const nextSession = {
    ...current,
    title: updates.title ?? current.title,
    status: updates.status ?? current.status,
    ended_at: updates.ended_at ?? current.ended_at,
    host_id: updates.host_id ?? current.host_id,
    environment_type: updates.environment_type ?? current.environment_type,
    image: updates.image ?? current.image,
    container_name: updates.container_name ?? current.container_name,
    access_url: updates.access_url ?? current.access_url,
    access_password: updates.access_password ?? current.access_password,
    workspace_id: updates.workspace_id ?? current.workspace_id,
    workspace_path: updates.workspace_path ?? current.workspace_path,
    preset_key: updates.preset_key ?? current.preset_key,
    selected_tools: updates.selected_tools ?? current.selected_tools,
  };

  await updateSessionLaunchRow(nextSession);
  return nextSession;
}

async function prepareSessionLaunchForUser(userId, launchBody = {}, seed = {}) {
  const { environment = "coding", hostId = null } = launchBody || {};
  const skipWorkspace = Boolean(launchBody.skip_workspace || launchBody.skipWorkspace);
  const environmentConfig = ENVIRONMENT_CATALOG[environment];
  const sessionId = seed.sessionId || `sess_${uuidv4().slice(0, 8)}`;
  const settings = await getSystemSettings();
  const launchStartedAt = seed.launchStartedAt || Date.now();
  launchSessionUser.set(sessionId, userId);
  setTimeout(() => launchSessionUser.delete(sessionId), 10 * 60 * 1000);
  fastify.log.info(
    {
      sessionId,
      userId,
      environment,
      requestedHostId: hostId,
      asyncSeeded: Boolean(seed.sessionId),
    },
    "session.prepare.begin"
  );

  if (!environmentConfig) {
    throw createStatusError(400, "Unknown environment");
  }

  if (environmentConfig.status !== "available") {
    throw createStatusError(409, `${environmentConfig.title} is still under production`);
  }

  if (!settings.allow_new_sessions) {
    throw createStatusError(403, "New sessions are currently disabled by admin policy");
  }

  const userState = await get("SELECT blocked FROM user_admin_state WHERE user_id = ?", [userId]);
  if (userState && userState.blocked) {
    throw createStatusError(403, "Your account is blocked from starting sessions");
  }

  const hostSelection = await findLaunchHostForUser(userId, hostId, {
    includeGlobalPool: GLOBAL_HOST_POOL_ENABLED,
    settings,
  });
  const selectedHost = hostSelection?.host || null;
  if (!selectedHost) {
    if (hostSelection?.reason === "overloaded") {
      throw createStatusError(429, NO_HEALTHY_HOST_MESSAGE);
    }
    throw createStatusError(
      409,
      GLOBAL_HOST_POOL_ENABLED ? NO_AVAILABLE_HOST_MESSAGE : NO_PAIRED_HOST_MESSAGE
    );
  }
  fastify.log.info(
    {
      sessionId,
      hostId: selectedHost.id,
      deviceId: selectedHost.device_id,
    },
    "session.prepare.host_selected"
  );
  if (!hostSockets.has(selectedHost.device_id)) {
    fastify.log.warn(
      {
        sessionHostId: selectedHost.id,
        deviceId: selectedHost.device_id,
        connectedHosts: Array.from(hostSockets.keys()),
      },
      "session.launch.no_host_socket"
    );
    throw createStatusError(
      409,
      GLOBAL_HOST_POOL_ENABLED
        ? NO_AVAILABLE_HOST_MESSAGE
        : "Host app is not connected. Open the host app and keep it connected."
    );
  }

  const workspace = await resolveWorkspaceForLaunch(userId, environment, launchBody);
  fastify.log.info(
    {
      sessionId,
      workspaceId: workspace?.id || null,
      workspacePath: workspace?.path || null,
    },
    "session.prepare.workspace_resolved"
  );
  const resolvedPresetFallback =
    launchBody.preset_key ||
    launchBody.presetKey ||
    workspace?.preset_key ||
    "python";
  const launchProfile = resolveWorkspaceProfile(
    launchBody,
    resolvedPresetFallback
  );
  const explicitImageOverrideRaw =
    launchBody.image ||
    launchBody.image_key ||
    launchBody.imageKey ||
    null;
  const explicitImageOverride =
    explicitImageOverrideRaw && explicitImageOverrideRaw !== DEFAULT_CODE_SERVER_IMAGE
      ? explicitImageOverrideRaw
      : null;
  const workspaceImage =
    workspace?.image_key && workspace.image_key !== DEFAULT_CODE_SERVER_IMAGE
      ? workspace.image_key
      : null;
  const runtimeImage = normalizeCodingImageKey(
    explicitImageOverride ||
      workspaceImage ||
      launchProfile.image_key ||
      environmentConfig.image ||
      DEFAULT_CODE_SERVER_IMAGE
  );
  const generatedPassword = `sess_${sessionId.slice(-6)}`;
  let launchResult = { ok: true };
  fastify.log.info(
    {
      sessionId,
      environment,
      hostId: selectedHost.id,
      deviceId: selectedHost.device_id,
      workspaceId: workspace?.id || null,
      runtimeImage,
    },
    "session.launch.begin"
  );
  const defaultSessionTitle = skipWorkspace
    ? "Code Server Session"
    : environmentConfig.title;
  const baseSession = {
    id: sessionId,
    title: workspace?.name || launchBody.workspace_name || launchBody.workspaceName || defaultSessionTitle,
    status: "starting",
    started_at: new Date().toISOString(),
    ended_at: null,
    host_id: selectedHost.id,
    user_id: userId,
    environment_type: environmentConfig.id,
    image: runtimeImage || null,
    container_name: `computex_session_${sessionId}`,
    access_url: null,
    access_password: null,
    workspace_id: skipWorkspace ? null : workspace?.id || null,
    workspace_path: skipWorkspace ? null : workspace?.path || null,
    preset_key: launchProfile.preset_key || null,
    selected_tools: JSON.stringify(launchProfile.selected_tools || []),
  };

  return {
    userId,
    environment,
    environmentConfig,
    sessionId,
    launchStartedAt,
    workspace,
    selectedHost,
    runtimeImage,
    generatedPassword,
    baseSession,
    skipWorkspace,
  };
}

async function finalizePreparedSessionLaunch(prepared, { persistExisting = false, tolerateHostTimeout = false } = {}) {
  const {
    userId,
    environment,
    environmentConfig,
    sessionId,
    launchStartedAt,
    workspace,
    selectedHost,
    runtimeImage,
    generatedPassword,
    baseSession,
    skipWorkspace,
  } = prepared;
  let launchResult = { ok: true };
  try {
    if (environment === "coding") {
      fastify.log.info(
        {
          sessionId,
          deviceId: selectedHost.device_id,
          workspacePath: workspace?.path || null,
          runtimeImage,
        },
        "session.launch.emit"
      );
      launchResult = await emitHostCommand(
        selectedHost.device_id,
        "start_coding_session",
        {
          sessionId,
          image: runtimeImage,
          password: generatedPassword,
          sessionRoot: DEFAULT_SESSION_ROOT,
          workspacePath: workspace?.path || null,
        },
        CODING_SESSION_HOST_TIMEOUT_MS
      );
      baseSession.container_name = launchResult.container_name || baseSession.container_name;
      baseSession.image = launchResult.image || baseSession.image;
      baseSession.access_url = launchResult.access_url || null;
      baseSession.access_password = launchResult.password || generatedPassword;
      if (!skipWorkspace) {
        baseSession.workspace_path = launchResult.workspace_path || baseSession.workspace_path;
      }
    }
  } catch (err) {
    if (tolerateHostTimeout && String(err?.message || "").includes("Host command timed out")) {
      fastify.log.warn(
        { sessionId, err: err?.message || err, ms: Date.now() - launchStartedAt },
        "session.launch.deferred_after_host_timeout"
      );
      if (persistExisting) {
        await updateSessionLaunchRow(baseSession);
      }
      return {
        session: baseSession,
        launch: {
          environment: environmentConfig,
          access_url: baseSession.access_url,
          access_password: baseSession.access_password,
          host_id: selectedHost.id,
          device_id: selectedHost.device_id,
          workspace,
          workspace_hint: workspace?.path || null,
          pending: true,
        },
      };
    }
    fastify.log.error(
      { sessionId, err: err?.message || err, ms: Date.now() - launchStartedAt },
      "session.launch.failed"
    );
    baseSession.status = "failed";
    baseSession.ended_at = new Date().toISOString();
    if (persistExisting) {
      await updateSessionLaunchRow(baseSession);
    }
    launchSessionUser.delete(sessionId);
    throw createStatusError(502, err?.message || "Failed to launch environment");
  }
  baseSession.status = "running";
  fastify.log.info({ sessionId, ms: Date.now() - launchStartedAt }, "session.launch.success");

  if (persistExisting) {
    await updateSessionLaunchRow(baseSession);
  } else {
    await insertSessionRow(baseSession);
  }
  launchSessionUser.delete(sessionId);

  if (workspace?.id) {
    await run("UPDATE workspaces SET last_used = ? WHERE id = ?", [new Date().toISOString(), workspace.id]);
  }

  await insertAuditLog({
    eventType: "session.start",
    actorUserId: userId,
    targetType: "session",
    targetId: baseSession.id,
    message: `Session ${baseSession.id} started`,
    metadata: {
      sessionId: baseSession.id,
      hostId: baseSession.host_id,
      environment,
      image: baseSession.image,
      accessUrl: baseSession.access_url,
      workspaceId: baseSession.workspace_id,
    },
  });

  return {
    session: baseSession,
    launch: {
      environment: environmentConfig,
      access_url: baseSession.access_url,
      access_password: baseSession.access_password,
      host_id: selectedHost.id,
      device_id: selectedHost.device_id,
      workspace,
      workspace_hint: workspace?.path || null,
    },
  };
}

async function createSessionLaunchForUser(userId, launchBody = {}) {
  const prepared = await prepareSessionLaunchForUser(userId, launchBody);
  const result = await finalizePreparedSessionLaunch(prepared);
  // For sync launches, wait for the host to report the access URL
  const startWait = Date.now();
  const timeoutMs = 60000; // 1 minute
  while (!result.session.access_url && Date.now() - startWait < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const updatedSession = await get("SELECT access_url, access_password FROM sessions WHERE id = ?", [result.session.id]);
    if (updatedSession) {
      result.session.access_url = updatedSession.access_url;
      result.session.access_password = updatedSession.access_password;
      result.launch.access_url = updatedSession.access_url;
      result.launch.access_password = updatedSession.access_password;
    }
  }
  if (!result.session.access_url) {
    throw createStatusError(500, "Timed out waiting for session to start");
  }
  return result;
}

async function createAsyncSessionLaunchForUser(userId, launchBody = {}) {
  const environment = launchBody?.environment || "coding";
  const requestedHostId = launchBody?.host_id || launchBody?.hostId || null;
  const settings = await getSystemSettings();
  const preflightSelection = await findLaunchHostForUser(userId, requestedHostId, {
    includeGlobalPool: GLOBAL_HOST_POOL_ENABLED,
    settings,
  });
  const preflightHost = preflightSelection?.host || null;
  if (!preflightHost) {
    if (preflightSelection?.reason === "overloaded") {
      throw createStatusError(429, NO_HEALTHY_HOST_MESSAGE);
    }
    throw createStatusError(
      409,
      GLOBAL_HOST_POOL_ENABLED ? NO_AVAILABLE_HOST_MESSAGE : NO_PAIRED_HOST_MESSAGE
    );
  }
  if (!hostSockets.has(preflightHost.device_id)) {
    throw createStatusError(
      409,
      GLOBAL_HOST_POOL_ENABLED
        ? NO_AVAILABLE_HOST_MESSAGE
        : "Host app is not connected. Open the host app and keep it connected."
    );
  }

  const skipWorkspace = Boolean(launchBody?.skip_workspace || launchBody?.skipWorkspace);
  const environmentConfig = ENVIRONMENT_CATALOG[environment] || null;
  const sessionId = `sess_${uuidv4().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const pendingTitle = skipWorkspace
    ? "Code Server Session"
    : (launchBody.workspace_name || launchBody.workspaceName || environmentConfig?.title || "Coding Workspace");
  const requestedImage = launchBody.image || launchBody.image_key || launchBody.imageKey || null;
  const pendingSession = {
    id: sessionId,
    title: pendingTitle,
    status: "starting",
    started_at: startedAt,
    ended_at: null,
    host_id: null,
    user_id: userId,
    environment_type: environment,
    image: normalizeCodingImageKey(requestedImage),
    container_name: `computex_session_${sessionId}`,
    access_url: null,
    access_password: null,
    workspace_id: skipWorkspace ? null : launchBody.workspace_id || launchBody.workspaceId || null,
    workspace_path: null,
    preset_key: launchBody.preset_key || launchBody.presetKey || null,
    selected_tools: JSON.stringify(launchBody.tools || launchBody.selected_tools || []),
  };
  fastify.log.info(
    {
      sessionId,
      userId,
      environment,
      workspaceId: pendingSession.workspace_id,
    },
    "session.launch.async.pending_insert.begin"
  );
  await withTimeout(insertSessionRow(pendingSession), 5000, "async pending session insert");
  fastify.log.info(
    {
      sessionId,
      userId,
    },
    "session.launch.async.pending_insert.done"
  );
  fastify.log.info(
    {
      sessionId,
      userId,
      environment,
      workspaceId: pendingSession.workspace_id,
    },
    "session.launch.accepted"
  );

  launchSessionUser.set(sessionId, userId);
  setTimeout(() => launchSessionUser.delete(sessionId), 10 * 60 * 1000);

  Promise.resolve()
    .then(() => {
      fastify.log.info({ sessionId, userId, environment }, "session.launch.background.begin");
    })
    .then(() => prepareSessionLaunchForUser(userId, launchBody, { sessionId, launchStartedAt: Date.now() }))
    .then((prepared) => finalizePreparedSessionLaunch(prepared, { persistExisting: true, tolerateHostTimeout: true }))
    .catch(async (err) => {
      fastify.log.error({ sessionId, err: err?.message || err }, "session.launch.background.failed");
      pendingSession.status = "failed";
      pendingSession.ended_at = new Date().toISOString();
      try {
        await updateSessionLaunchRow(pendingSession);
      } catch (updateErr) {
        fastify.log.error(
          { sessionId, err: updateErr?.message || updateErr },
          "session.launch.background.failed_update"
        );
      }
      launchSessionUser.delete(sessionId);
    });

  return {
    accepted: true,
    session: pendingSession,
    launch: {
      environment: environmentConfig,
      access_url: null,
      access_password: null,
      host_id: null,
      device_id: null,
      workspace: null,
      workspace_hint: null,
    },
  };
}

async function createSessionLaunch(request, reply, launchBody = {}) {
  try {
    const useAsyncLaunch = Boolean(launchBody?.async_launch || launchBody?.asyncLaunch);
    fastify.log.info(
      {
        reqId: request.id,
        userId: request.user?.sub,
        environment: launchBody?.environment || "coding",
        async: useAsyncLaunch,
        workspaceId: launchBody?.workspace_id || launchBody?.workspaceId || null,
      },
      "session.launch.request"
    );
    const result = useAsyncLaunch
      ? await createAsyncSessionLaunchForUser(request.user?.sub, launchBody)
      : await createSessionLaunchForUser(request.user?.sub, launchBody);
    if (useAsyncLaunch) {
      fastify.log.info({ reqId: request.id, sessionId: result?.session?.id }, "session.launch.response.accepted");
      return reply.code(202).send(result);
    }
    fastify.log.info({ reqId: request.id, sessionId: result?.session?.id }, "session.launch.response.ready");
    return reply.send(result);
  } catch (err) {
    return reply.code(err?.statusCode || 500).send({ message: err?.message || "Failed to launch environment" });
  }
}

async function updateSystemSettings(nextSettings) {
  const now = new Date().toISOString();
  const entries = Object.entries(nextSettings);
  for (const [key, value] of entries) {
    await run(
      "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, String(value), now]
    );
  }
  return getSystemSettings();
}

async function getLatestTelemetryMap(deviceIds) {
  if (!deviceIds.length) return {};
  const placeholders = deviceIds.map(() => "?").join(",");
  const rows = await all(
    "SELECT t1.* FROM host_telemetry t1 INNER JOIN (SELECT device_id, MAX(created_at) AS max_created FROM host_telemetry WHERE device_id IN (" +
      placeholders +
      ") GROUP BY device_id) t2 ON t1.device_id = t2.device_id AND t1.created_at = t2.max_created",
    deviceIds
  );
  return Object.fromEntries(rows.map((row) => [row.device_id, row]));
}

async function getAdminHosts() {
  const hosts = await all("SELECT * FROM hosts ORDER BY created_at DESC");
  if (!hosts.length) return [];

  const hostIds = hosts.map((host) => host.id);
  const deviceIds = hosts.map((host) => host.device_id).filter(Boolean);
  const hostIdPlaceholders = hostIds.map(() => "?").join(",");

  const devices = deviceIds.length
    ? await all("SELECT * FROM host_devices WHERE id IN (" + deviceIds.map(() => "?").join(",") + ")", deviceIds)
    : [];
  const latestTelemetryMap = await getLatestTelemetryMap(deviceIds);
  const sessionCounts = await all(
    "SELECT host_id, COUNT(*) AS total_sessions, SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS active_sessions FROM sessions WHERE host_id IN (" +
      hostIdPlaceholders +
      ") GROUP BY host_id",
    hostIds
  );
  const adminStates = await all("SELECT * FROM host_admin_state WHERE host_id IN (" + hostIdPlaceholders + ")", hostIds);

  const deviceMap = Object.fromEntries(devices.map((device) => [device.id, device]));
  const sessionCountMap = Object.fromEntries(sessionCounts.map((row) => [row.host_id, row]));
  const adminStateMap = Object.fromEntries(adminStates.map((row) => [row.host_id, row]));

  return hosts.map((host) => {
    const device = host.device_id ? deviceMap[host.device_id] || null : null;
    const telemetry = host.device_id ? latestTelemetryMap[host.device_id] || null : null;
    const countInfo = sessionCountMap[host.id] || {};
    const adminState = adminStateMap[host.id];
    const enabled = adminState ? Boolean(adminState.enabled) : true;
    return {
      ...host,
      enabled,
      presence: hostPresenceFromLastSeen(device?.last_seen_at),
      availability: hostAvailabilityFromState(device, telemetry),
      device,
      telemetry,
      total_sessions: Number(countInfo.total_sessions || 0),
      active_sessions: Number(countInfo.active_sessions || 0),
    };
  });
}

async function getAdminUsers() {
  const users = await all("SELECT id, name, email, created_at FROM users ORDER BY created_at DESC");
  if (!users.length) return [];
  const userIds = users.map((user) => user.id);
  const placeholders = userIds.map(() => "?").join(",");

  const sessionStats = await all(
    "SELECT user_id, COUNT(*) AS session_count, SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS active_sessions, SUM(CASE WHEN ended_at IS NOT NULL THEN CAST((julianday(ended_at) - julianday(started_at)) * 24 * 60 AS INTEGER) ELSE 0 END) AS total_minutes FROM sessions WHERE user_id IN (" +
      placeholders +
      ") GROUP BY user_id",
    userIds
  );
  const hostCounts = await all("SELECT user_id, COUNT(*) AS host_count FROM hosts WHERE user_id IN (" + placeholders + ") GROUP BY user_id", userIds);
  const adminStates = await all("SELECT * FROM user_admin_state WHERE user_id IN (" + placeholders + ")", userIds);

  const sessionMap = Object.fromEntries(sessionStats.map((row) => [row.user_id, row]));
  const hostCountMap = Object.fromEntries(hostCounts.map((row) => [row.user_id, row.host_count]));
  const adminStateMap = Object.fromEntries(adminStates.map((row) => [row.user_id, row]));

  return users.map((user) => {
    const stats = sessionMap[user.id] || {};
    const adminState = adminStateMap[user.id];
    return {
      ...user,
      blocked: adminState ? Boolean(adminState.blocked) : false,
      session_count: Number(stats.session_count || 0),
      active_sessions: Number(stats.active_sessions || 0),
      total_minutes: Number(stats.total_minutes || 0),
      host_count: Number(hostCountMap[user.id] || 0),
    };
  });
}

async function getAdminSessions() {
  const sessions = await all(
    `SELECT
      s.*,
      u.name AS user_name,
      u.email AS user_email,
      h.name AS host_name,
      h.email AS host_email,
      h.device_id AS host_device_id
    FROM sessions s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN hosts h ON h.id = s.host_id
    ORDER BY s.started_at DESC`
  );

  return sessions.map((session) => ({
    ...session,
    duration_minutes: formatDurationMinutes(session.started_at, session.ended_at),
  }));
}

async function getUsageSummary() {
  const byHost = await all(
    `SELECT
      h.id AS host_id,
      COALESCE(h.name, h.email, h.id) AS host_name,
      COUNT(s.id) AS session_count,
      SUM(CASE WHEN s.ended_at IS NOT NULL THEN CAST((julianday(s.ended_at) - julianday(s.started_at)) * 24 * 60 AS INTEGER) ELSE 0 END) AS total_minutes
    FROM hosts h
    LEFT JOIN sessions s ON s.host_id = h.id
    GROUP BY h.id
    ORDER BY total_minutes DESC, session_count DESC`
  );
  const byUser = await all(
    `SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      COUNT(s.id) AS session_count,
      SUM(CASE WHEN s.ended_at IS NOT NULL THEN CAST((julianday(s.ended_at) - julianday(s.started_at)) * 24 * 60 AS INTEGER) ELSE 0 END) AS total_minutes
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY total_minutes DESC, session_count DESC`
  );

  return {
    hosts: byHost.map((row) => ({
      host_id: row.host_id,
      host_name: row.host_name,
      session_count: Number(row.session_count || 0),
      total_minutes: Number(row.total_minutes || 0),
    })),
    users: byUser.map((row) => ({
      user_id: row.user_id,
      user_name: row.user_name,
      user_email: row.user_email,
      session_count: Number(row.session_count || 0),
      total_minutes: Number(row.total_minutes || 0),
    })),
  };
}

async function getAdminOverview() {
  const hosts = await getAdminHosts();
  const sessions = await getAdminSessions();
  const users = await getAdminUsers();
  const settings = await getSystemSettings();

  const activeHosts = hosts.filter((host) => host.presence === "online").length;
  const offlineHosts = hosts.length - activeHosts;
  const activeSessions = sessions.filter((session) => session.status === "running").length;
  const alerts = [];

  for (const host of hosts) {
    if (host.presence === "offline" && host.device_id) {
      alerts.push({
        level: "warning",
        type: "host_offline",
        message: `${host.name || host.email || host.id} is offline`,
      });
    }
    if ((host.telemetry?.cpu ?? 0) >= 90) {
      alerts.push({
        level: "warning",
        type: "high_cpu",
        message: `${host.name || host.email || host.id} is under high CPU load`,
      });
    }
  }

  return {
    stats: {
      total_hosts: hosts.length,
      active_hosts: activeHosts,
      offline_hosts: offlineHosts,
      active_sessions: activeSessions,
      total_users: users.length,
      system_uptime_seconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
    },
    settings,
    alerts: alerts.slice(0, 10),
  };
}

async function authGuard(request, reply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    fastify.log.info({ reqId: request.id }, "authGuard missing bearer token");
    reply.code(401).send({ message: "Unauthorized" });
    return reply;
  }
  try {
    const token = header.slice("Bearer ".length);
    const decoded = jwt.verify(token, JWT_SECRET);
    request.user = decoded;
    fastify.log.info({ reqId: request.id, userId: decoded?.sub }, "authGuard success");
    return;
  } catch (err) {

    fastify.log.info({ reqId: request.id, error: err?.message }, "authGuard invalid token");
    reply.code(401).send({ message: "Invalid token" });
    return reply;
  }
}

async function ensureCredits(userId) {
  const existing = await get("SELECT * FROM credits WHERE user_id = ?", [userId]);
  if (existing) return existing;

  const credits = { user_id: userId, balance: 20, used: 4, monthly_limit: 50, remaining: 46 };
  await run(
    "INSERT INTO credits (user_id, balance, used, monthly_limit, remaining) VALUES (?, ?, ?, ?, ?)",
    [credits.user_id, credits.balance, credits.used, credits.monthly_limit, credits.remaining]
  );

  return credits;
}

function generateEmailCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generatePairCode(deviceId) {
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  const slot = Math.floor(Date.now() / 60000);
  const checksum = crypto
    .createHmac("sha256", PAIRING_SECRET)
    .update(`${deviceId}.${randomPart}.${slot}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  const code = `CXH-${randomPart}-${checksum}`;
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MIN * 60 * 1000).toISOString();
  return { code, randomPart, slot, expiresAt };
}

function validatePairChecksum(deviceId, randomPart, slot, checksum) {
  const expected = crypto
    .createHmac("sha256", PAIRING_SECRET)
    .update(`${deviceId}.${randomPart}.${slot}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return expected === checksum;
}

function parsePairCode(code) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  const match = /^CXH-([A-F0-9]{8})-([A-F0-9]{6})$/.exec(normalized);
  if (!match) return null;
  return { randomPart: match[1], checksum: match[2] };
}

async function linkHostForUser({ user, deviceId, label, os }) {
  const device = await upsertHostDevice({ deviceId, label, os });

  let host = await get("SELECT * FROM hosts WHERE user_id = ? AND device_id = ?", [user.id, device.id]);
  if (!host) {
    host = await get(
      "SELECT * FROM hosts WHERE user_id = ? AND device_id IS NULL ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
  }

  if (host) {
    await run(
      "UPDATE hosts SET device_id = ?, status = ?, name = ?, email = ? WHERE id = ?",
      [device.id, "paired", user.name, user.email, host.id]
    );
  } else {
    host = {
      id: "hst_" + uuidv4().slice(0, 10),
      user_id: user.id,
      device_id: device.id,
      name: user.name,
      email: user.email,
      phone: null,
      location: null,
      payout_handle: null,
      gpu: null,
      status: "paired",
      created_at: new Date().toISOString(),
    };

    await run(
      "INSERT INTO hosts (id, user_id, device_id, name, email, phone, location, payout_handle, gpu, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        host.id,
        host.user_id,
        host.device_id,
        host.name,
        host.email,
        host.phone,
        host.location,
        host.payout_handle,
        host.gpu,
        host.status,
        host.created_at,
      ]
    );
  }

  return { host, device };
}

async function upsertHostDevice({ deviceId, label, os }) {
  const now = new Date().toISOString();
  const existing = await get("SELECT * FROM host_devices WHERE id = ?", [deviceId]);
  if (existing) {
    await run("UPDATE host_devices SET label = ?, os = ?, last_seen_at = ?, live_status = COALESCE(live_status, ?) WHERE id = ?", [
      label || existing.label,
      os || existing.os,
      now,
      "available",
      deviceId,
    ]);
    return { ...existing, label: label || existing.label, os: os || existing.os, last_seen_at: now, live_status: existing.live_status || "available" };
  }

  const record = {
    id: deviceId,
    label: label || "ComputeX Host",
    os: os || "unknown",
    created_at: now,
    last_seen_at: now,
    live_status: "available",
  };
  await run(
    "INSERT INTO host_devices (id, label, os, created_at, last_seen_at, live_status) VALUES (?, ?, ?, ?, ?, ?)",
    [record.id, record.label, record.os, record.created_at, record.last_seen_at, record.live_status]
  );
  return record;
}

async function sendVerificationEmail(email, code) {
  if (!SMTP_HOST || !SMTP_FROM) {
    return { ok: false, reason: "smtp_not_configured" };
  }

  if (!mailer) {
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }

  await mailer.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "ComputeX verification code",
    text: `Your ComputeX verification code is ${code}. It expires in ${EMAIL_CODE_TTL_MIN} minutes.`,
  });

  return { ok: true };
}

fastify.get("/health", async () => ({ ok: true }));

fastify.post("/api/auth/register", async (request, reply) => {
  const { name, email, password } = request.body || {};
  if (!name || !email || !password) {
    return reply.code(400).send({ message: "Missing fields" });
  }

  const existing = await get("SELECT * FROM users WHERE email = ?", [email]);
  if (existing) {
    return reply.code(400).send({ message: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    name,
    email,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
  };

  await run(
    "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    [user.id, user.name, user.email, user.password_hash, user.created_at]
  );

  await ensureCredits(user.id);
  await insertAuditLog({
    eventType: "user.register",
    actorUserId: user.id,
    targetType: "user",
    targetId: user.id,
    message: `User ${user.email} registered`,
    metadata: { email: user.email },
  });

  const token = signToken(user);
  return reply.send({
    message: "Account created successfully",
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

fastify.post("/api/auth/login", async (request, reply) => {
  const { email, password, deviceId, label, os } = request.body || {};
  if (!email || !password) {
    return reply.code(400).send({ message: "Missing fields" });
  }

  const user = await get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) {
    return reply.code(401).send({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return reply.code(401).send({ message: "Invalid credentials" });
  }

  const token = signToken(user);
  await insertAuditLog({
    eventType: "user.login",
    actorUserId: user.id,
    targetType: "user",
    targetId: user.id,
    message: `User ${user.email} logged in`,
    metadata: { email: user.email },
  });

  if (deviceId) {
    try {
      const { host, device } = await withTimeout(
      linkHostForUser({ user, deviceId, label, os }),
      5000,
      "login auto-link"
    );
      return reply.send({
        token,
        user: { id: user.id, name: user.name, email: user.email },
        host_linked: true,
        host_id: host.id,
        device_id: device.id,
      });
    } catch (err) {
      fastify.log.error({ reqId: request.id, err: err?.message }, "login auto-link failed");
      return reply.code(500).send({ message: "Login succeeded but linking failed" });
    }
  }

  return reply.send({ token, user: { id: user.id, name: user.name, email: user.email } });
});

fastify.post("/api/hosts/email/request", async (request, reply) => {
  const { email } = request.body || {};
  if (!email) {
    return reply.code(400).send({ message: "Email is required" });
  }

  const code = generateEmailCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMAIL_CODE_TTL_MIN * 60 * 1000).toISOString();
  const record = {
    id: uuidv4(),
    email,
    code,
    expires_at: expiresAt,
    verified_at: null,
    attempts: 0,
    created_at: now.toISOString(),
  };

  await run(
    "INSERT INTO email_verifications (id, email, code, expires_at, verified_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      record.id,
      record.email,
      record.code,
      record.expires_at,
      record.verified_at,
      record.attempts,
      record.created_at,
    ]
  );

  let delivery = "sent";
  try {
    const result = await sendVerificationEmail(email, code);
    if (!result.ok) {
      delivery = result.reason || "skipped";
    }
  } catch (err) {
    fastify.log.error(err, "Email delivery failed");
    delivery = "failed";
  }

  const shouldExposeCode = delivery !== "sent" || process.env.NODE_ENV !== "production";

  return reply.send({
    message: "Verification code sent",
    delivery,
    dev_code: shouldExposeCode ? code : undefined,
    expires_at: expiresAt,
  });
});

fastify.post("/api/hosts/email/verify", async (request, reply) => {
  const { email, code } = request.body || {};
  if (!email || !code) {
    return reply.code(400).send({ message: "Missing email or code" });
  }

  const record = await get(
    "SELECT * FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    [email]
  );

  if (!record) {
    return reply.code(404).send({ message: "No verification request found" });
  }

  if (record.verified_at) {
    return reply.send({ message: "Email already verified", verified: true });
  }

  const now = Date.now();
  if (new Date(record.expires_at).getTime() < now) {
    return reply.code(400).send({ message: "Verification code expired" });
  }

  const attempts = (record.attempts || 0) + 1;
  if (record.code !== code) {
    await run("UPDATE email_verifications SET attempts = ? WHERE id = ?", [attempts, record.id]);
    return reply.code(400).send({ message: "Invalid verification code" });
  }

  const verifiedAt = new Date().toISOString();
  await run("UPDATE email_verifications SET verified_at = ?, attempts = ? WHERE id = ?", [
    verifiedAt,
    attempts,
    record.id,
  ]);

  return reply.send({ message: "Email verified", verified: true, verified_at: verifiedAt });
});

fastify.post("/api/hosts/register", async (request, reply) => {
  const authHeader = request.headers.authorization || "";
  let authUser = null;
  if (authHeader.startsWith("Bearer ")) {
    try {
      authUser = jwt.verify(authHeader.slice("Bearer ".length), JWT_SECRET);
    } catch {
      authUser = null;
    }
  }

  const { name, email, password, phone, location, payoutHandle, gpu } = request.body || {};
  const submittedEmail = typeof email === "string" ? email.trim() : "";
  const authEmail = typeof authUser?.email === "string" ? authUser.email.trim() : "";
  const targetEmail = submittedEmail || authEmail;
  const emailsMatch =
    !!submittedEmail && !!authEmail && submittedEmail.toLowerCase() === authEmail.toLowerCase();
  const useAuthContext = !!authUser && (!submittedEmail || emailsMatch);

  if (!name || !targetEmail || (!useAuthContext && !password)) {
    return reply.code(400).send({ message: "Missing required fields" });
  }

  const verification = await get(
    "SELECT * FROM email_verifications WHERE LOWER(email) = LOWER(?) ORDER BY created_at DESC LIMIT 1",
    [targetEmail]
  );
  if (!verification || !verification.verified_at) {
    return reply.code(400).send({ message: "Email not verified" });
  }

  let user = null;
  if (useAuthContext && authUser?.sub) {
    user = await get("SELECT * FROM users WHERE id = ?", [authUser.sub]);
  } else {
    user = await get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [targetEmail]);
  }

  if (user && !useAuthContext) {
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return reply.code(401).send({ message: "Invalid credentials for existing account" });
    }
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = {
      id: uuidv4(),
      name,
      email: targetEmail,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };

    await run(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
      [user.id, user.name, user.email, user.password_hash, user.created_at]
    );

    await ensureCredits(user.id);
  }

  const host = {
    id: `hst_${uuidv4().slice(0, 10)}`,
    user_id: user.id,
    device_id: null,
    name,
    email: targetEmail,
    phone: phone || null,
    location: location || null,
    payout_handle: payoutHandle || null,
    gpu: gpu || null,
    status: "pending_pair",
    created_at: new Date().toISOString(),
  };

  await run(
    "INSERT INTO hosts (id, user_id, device_id, name, email, phone, location, payout_handle, gpu, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      host.id,
      host.user_id,
      host.device_id,
      host.name,
      host.email,
      host.phone,
      host.location,
      host.payout_handle,
      host.gpu,
      host.status,
      host.created_at,
    ]
  );

  await insertAuditLog({
    eventType: "host.register",
    actorUserId: user.id,
    targetType: "host",
    targetId: host.id,
    message: `Host ${host.name || host.email || host.id} registered`,
    metadata: { hostId: host.id },
  });

  const token = signToken(user);
  return reply.send({
    message: "Host account created",
    token,
    host,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

fastify.get("/api/hosts/agent/link/status", { preHandler: authGuard }, async (request, reply) => {
  const userId = request.user?.sub;
  const deviceId = request.query?.deviceId || null;

  let host = null;
  if (deviceId) {
    host = await get(
      "SELECT * FROM hosts WHERE user_id = ? AND device_id = ? ORDER BY created_at DESC LIMIT 1",
      [userId, deviceId]
    );
  } else {
    host = await get(
      "SELECT * FROM hosts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
  }

  if (!host) {
    return reply.code(404).send({ message: "Host not found" });
  }

  const device = host.device_id
    ? await get("SELECT * FROM host_devices WHERE id = ?", [host.device_id])
    : null;

  return reply.send({
    host: {
      id: host.id,
      status: host.status,
      device_id: host.device_id,
      created_at: host.created_at,
    },
    device: device
      ? { id: device.id, label: device.label, os: device.os, last_seen_at: device.last_seen_at, live_status: device.live_status || "available" }
      : null,
  });
});

fastify.get("/api/hosts/agent/device-status", async (request, reply) => {
  const authHeader = request.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({ message: "Unauthorized" });
  }
  const token = authHeader.slice("Bearer ".length);
  if (token !== HOST_AGENT_SECRET) {
    return reply.code(403).send({ message: "Invalid host secret" });
  }

  const deviceId = request.query?.deviceId || null;
  if (!deviceId) {
    return reply.code(400).send({ message: "Device id is required" });
  }

  const host = await get(
    "SELECT id, user_id, device_id, status, created_at FROM hosts WHERE device_id = ? ORDER BY created_at DESC LIMIT 1",
    [deviceId]
  );
  const device = await get(
    "SELECT id, label, os, created_at, last_seen_at, live_status FROM host_devices WHERE id = ?",
    [deviceId]
  );

  return reply.send({
    device_id: deviceId,
    registered: Boolean(host),
    host: host || null,
    device: device || null,
  });
});

fastify.post("/api/hosts/agent/link", { preHandler: authGuard }, async (request, reply) => {
  fastify.log.info({ reqId: request.id }, "agent link start");
  const startedAt = Date.now();
  try {
    const { deviceId, label, os } = request.body || {};
    if (!deviceId) {
      return reply.code(400).send({ message: "Device id is required" });
    }

    const userId = request.user?.sub;
    fastify.log.info({ reqId: request.id, userId }, "agent link step: user lookup");
    const user = await withTimeout(
      get("SELECT * FROM users WHERE id = ?", [userId]),
      5000,
      "agent link user lookup"
    );
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }

    fastify.log.info({ reqId: request.id, deviceId }, "agent link step: link host");
    const { host, device } = await withTimeout(
      linkHostForUser({ user, deviceId, label, os }),
      5000,
      "agent link host"
    );
    await insertAuditLog({
      eventType: "host.link",
      actorUserId: user.id,
      targetType: "host",
      targetId: host.id,
      message: `Linked host ${host.id} to device ${device.id}`,
      metadata: { hostId: host.id, deviceId: device.id },
    });

    return reply.send({ message: "Host linked", host_id: host.id, device_id: device.id });
  } catch (err) {
    fastify.log.error({ reqId: request.id, err: err?.message }, "agent link failed");
    const code = err?.code === "DB_TIMEOUT" ? 503 : 500;
    return reply.code(code).send({ message: "Host link failed", error: err?.message });
  } finally {
    fastify.log.info({ reqId: request.id, ms: Date.now() - startedAt }, "agent link completed");
  }
});

fastify.post("/api/hosts/pair/request", async (request, reply) => {
  const authHeader = request.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({ message: "Unauthorized" });
  }
  const token = authHeader.slice("Bearer ".length);
  if (token !== HOST_AGENT_SECRET) {
    return reply.code(403).send({ message: "Invalid host secret" });
  }

  const { deviceId, label, os } = request.body || {};
  if (!deviceId) {
    return reply.code(400).send({ message: "Device id is required" });
  }

  await upsertHostDevice({ deviceId, label, os });

  const { code, randomPart, slot, expiresAt } = generatePairCode(deviceId);

  // Invalidate any previous sessions for this device
  await run("DELETE FROM pairing_sessions WHERE device_id = ?", [deviceId]);

  await run(
    "INSERT INTO pairing_sessions (id, device_id, code, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?)",
    [uuidv4(), deviceId, code, new Date().toISOString(), expiresAt, null]
  );

  await run(
    "UPDATE host_devices SET pair_code = ?, pair_code_random = ?, pair_code_slot = ?, pair_code_expires_at = ? WHERE id = ?",
    [code, randomPart, slot, expiresAt, deviceId]
  );

  return reply.send({
    code,
    expires_at: expiresAt,
    pattern: "CXH-XXXXXXXX-XXXXXX",
  });
});

fastify.post("/api/hosts/pair/status", { preHandler: authGuard }, async (request, reply) => {
  const startedAt = Date.now();
  try {
    const { code } = request.body || {};
    if (!code) {
      return reply.code(400).send({ message: "Pairing code required" });
    }

    const session = await withTimeout(
      get("SELECT * FROM pairing_sessions WHERE code = ?", [code]),
      5000,
      "pair status session lookup"
    );
    if (!session) {
      return reply.code(404).send({ message: "Pairing code not found" });
    }
    if (session.used_at) {
      return reply.code(400).send({ message: "Pairing code already used" });
    }

    const device = await withTimeout(
      get("SELECT * FROM host_devices WHERE id = ?", [session.device_id]),
      5000,
      "pair status device lookup"
    );
    if (!device) {
      return reply.code(404).send({ message: "Device not found" });
    }

    const expiresAt = session.expires_at;
    const expiresInSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

    return reply.send({
      device_label: device.label,
      device_os: device.os,
      expires_at: expiresAt,
      expires_in_seconds: expiresInSeconds,
    });
  } catch (err) {
    fastify.log.error({ reqId: request.id, err: err?.message }, "pair status failed");
    const code = err?.code === "DB_TIMEOUT" ? 503 : 500;
    return reply.code(code).send({ message: "Pairing status failed", error: err?.message });
  } finally {
    fastify.log.info({ reqId: request.id, ms: Date.now() - startedAt }, "pair status completed");
  }
});

fastify.post("/api/hosts/pair/verify", { preHandler: authGuard }, async (request, reply) => {
  const startedAt = Date.now();
  try {
    const { hostId, code } = request.body || {};
    fastify.log.info({ reqId: request.id, hostId, codePreview: code ? code.slice(0, 8) : null }, "pair verify request");

    if (!hostId || !code) {
      fastify.log.info({ reqId: request.id }, "pair verify missing hostId or code");
      return reply.code(400).send({ message: "Missing host id or code" });
    }

    const userId = request.user?.sub;
    const host = await withTimeout(
      get("SELECT * FROM hosts WHERE id = ? AND user_id = ?", [hostId, userId]),
      5000,
      "pair verify host lookup"
    );
    if (!host) {
      fastify.log.info({ reqId: request.id, userId, hostId }, "pair verify host not found");
      return reply.code(404).send({ message: "Host not found" });
    }

    const parsed = parsePairCode(code);
    if (!parsed) {
      fastify.log.info({ reqId: request.id, code }, "pair verify invalid format");
      return reply.code(400).send({ message: "Invalid pairing code format" });
    }

    const session = await withTimeout(
      get("SELECT * FROM pairing_sessions WHERE code = ?", [code]),
      5000,
      "pair verify session lookup"
    );
    if (!session) {
      fastify.log.info({ reqId: request.id, code }, "pair verify code not found");
      return reply.code(404).send({ message: "Pairing code not found" });
    }
    if (session.used_at) {
      fastify.log.info({ reqId: request.id, code }, "pair verify code already used");
      return reply.code(400).send({ message: "Pairing code already used" });
    }

    const device = await withTimeout(
      get("SELECT * FROM host_devices WHERE id = ?", [session.device_id]),
      5000,
      "pair verify device lookup"
    );
    if (!device) {
      fastify.log.info({ reqId: request.id, code }, "pair verify device not found");
      return reply.code(404).send({ message: "Device not found" });
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      fastify.log.info({ reqId: request.id, deviceId: device.id }, "pair verify code expired");
      return reply.code(400).send({ message: "Pairing code expired" });
    }

    const checksumOk = validatePairChecksum(
      device.id,
      device.pair_code_random,
      device.pair_code_slot,
      parsed.checksum
    );
    if (!checksumOk) {
      fastify.log.info({ reqId: request.id, deviceId: device.id }, "pair verify checksum failed");
      return reply.code(400).send({ message: "Pairing code checksum failed" });
    }

    await withTimeout(
      run("UPDATE hosts SET device_id = ?, status = ? WHERE id = ?", [
        device.id,
        "paired",
        hostId,
      ]),
      5000,
      "pair verify host update"
    );
    await insertAuditLog({
      eventType: "host.paired",
      actorUserId: userId,
      targetType: "host",
      targetId: hostId,
      message: `Host ${hostId} paired with device ${device.id}`,
      metadata: { hostId, deviceId: device.id },
    });

    fastify.log.info({ reqId: request.id, hostId, deviceId: device.id }, "pair verify success");
    return reply.send({ message: "Host paired", device_id: device.id, host_id: hostId });
  } catch (err) {
    fastify.log.error({ reqId: request.id, err: err?.message }, "pair verify failed");
    const code = err?.code === "DB_TIMEOUT" ? 503 : 500;
    return reply.code(code).send({ message: "Pairing failed", error: err?.message });
  } finally {
    fastify.log.info({ reqId: request.id, ms: Date.now() - startedAt }, "pair verify completed");
  }
});

fastify.get("/api/dashboard", { preHandler: authGuard }, async (request, reply) => {
  const startedAt = Date.now();
  try {
    const userId = request.user?.sub;
    const credits = await withTimeout(ensureCredits(userId), 5000, "dashboard credits");
    const sessions = await withTimeout(
      all("SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC", [userId]),
      5000,
      "dashboard sessions"
    );
    const notifications = await withTimeout(
      all("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20"),
      5000,
      "dashboard notifications"
    );
    const workspaces = await withTimeout(getUserWorkspaces(userId), 5000, "dashboard workspaces");

    const hosts = GLOBAL_DASHBOARD
      ? await withTimeout(all("SELECT * FROM hosts ORDER BY created_at DESC"), 5000, "dashboard hosts all")
      : await withTimeout(all("SELECT * FROM hosts WHERE user_id = ? ORDER BY created_at DESC", [userId]), 5000, "dashboard hosts user");

    if (DASHBOARD_FAST_MODE) {
      return {
        credits,
        sessions,
        containers: [],
        notifications,
        hosts,
        workspaces,
      };
    }

    const deviceIds = hosts.map((host) => host.device_id).filter(Boolean);

    let devices = [];
    let telemetryRows = [];
    if (deviceIds.length > 0) {
      const placeholders = deviceIds.map(() => "?").join(",");
      devices = await withTimeout(
        all("SELECT * FROM host_devices WHERE id IN (" + placeholders + ")", deviceIds),
        5000,
        "dashboard devices"
      );

      telemetryRows = await withTimeout(
        all(
          "SELECT t1.* FROM host_telemetry t1\n       INNER JOIN (\n         SELECT device_id, MAX(created_at) AS max_created\n         FROM host_telemetry\n         WHERE device_id IN (" + placeholders + ")\n         GROUP BY device_id\n       ) t2 ON t1.device_id = t2.device_id AND t1.created_at = t2.max_created",
          deviceIds
        ),
        5000,
        "dashboard telemetry"
      );
    }

    const deviceMap = Object.fromEntries(devices.map((device) => [device.id, device]));
    const telemetryMap = Object.fromEntries(
      telemetryRows.map((row) => [row.device_id, row])
    );

    const hostPayload = hosts.map((host) => ({
      ...host,
      device: host.device_id ? deviceMap[host.device_id] || null : null,
      telemetry: host.device_id ? telemetryMap[host.device_id] || null : null,
    }));

    return {
      credits,
      sessions,
      containers: [],
      notifications,
      hosts: hostPayload,
      workspaces,
    };
  } catch (err) {
    fastify.log.error({ reqId: request.id, err: err?.message }, "dashboard failed");
    const code = err?.code === "DB_TIMEOUT" ? 503 : 500;
    return reply.code(code).send({ message: "Dashboard failed", error: err?.message });
  } finally {
    fastify.log.info({ reqId: request.id, ms: Date.now() - startedAt }, "dashboard completed");
  }
});

fastify.get("/api/containers/active", { preHandler: authGuard }, async (request) => {
  const userId = request.user?.sub;
  const sessions = await all(
    "SELECT * FROM sessions WHERE user_id = ? AND status IN ('starting', 'running', 'open') ORDER BY started_at DESC",
    [userId]
  );
  return { containers: sessions.map(mapSessionToContainer) };
});

fastify.post("/api/containers/start", { preHandler: authGuard }, async (request, reply) => {
  return createSessionLaunch(request, reply, {
    ...(request.body || {}),
    environment: request.body?.environment || "coding",
  });
});

fastify.get("/api/session-environments", { preHandler: authGuard }, async (_request, reply) => {
  return reply.send({ environments: getEnvironmentCatalog() });
});

fastify.post("/api/sessions/start", { preHandler: authGuard }, async (request, reply) => {
  fastify.log.info(
    {
      reqId: request.id,
      userId: request.user?.sub,
      hasBody: request.body != null,
      bodyType: Array.isArray(request.body) ? "array" : typeof request.body,
    },
    "route.sessions.start.enter"
  );
  return createSessionLaunch(request, reply, request.body || {});
});

fastify.get("/api/sessions/:id", { preHandler: authGuard }, async (request, reply) => {
  const { id } = request.params;
  const userId = request.user?.sub;
  const session = await get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [id, userId]);
  if (!session) {
    return reply.code(404).send({ message: "Session not found" });
  }
  fastify.log.info(
    {
      reqId: request.id,
      sessionId: id,
      status: session.status,
      hasAccessUrl: Boolean(session.access_url),
    },
    "session.fetch"
  );
  return reply.send({
    session: {
      ...session,
      selected_tools: safeJsonParse(session.selected_tools, []),
    },
  });
});

fastify.get("/api/workspaces", { preHandler: authGuard }, async (request, reply) => {
  const userId = request.user?.sub;
  return reply.send({ workspaces: await getUserWorkspaces(userId) });
});

fastify.get("/api/workspace-profiles", { preHandler: authGuard }, async (_request, reply) => {
  return reply.send({
    max_tools: WORKSPACE_TOOL_LIMIT,
    tools: WORKSPACE_TOOL_CATALOG,
    presets: WORKSPACE_PRESETS.map((preset) => ({
      key: preset.key,
      name: preset.name,
      tools: preset.tools,
      image_key: preset.image_key,
    })),
  });
});

fastify.post("/api/workspaces", { preHandler: authGuard }, async (request, reply) => {
  const userId = request.user?.sub;
  const payload = request.body || {};
  const startedAt = Date.now();
  try {
    const workspace = await withTimeout(
      createWorkspaceForUser(userId, {
        name: payload.name || "Coding Workspace",
        type: payload.type || "coding",
        preset_key: payload.preset_key || payload.presetKey || "python",
        tools: payload.tools || payload.selected_tools || [],
        image_key: payload.image_key || payload.imageKey || null,
      }),
      15000,
      "workspace create"
    );
    fastify.log.info({ reqId: request.id, workspaceId: workspace?.id, ms: Date.now() - startedAt }, "workspace.created");
    return reply.send({ workspace });
  } catch (err) {
    fastify.log.error({ reqId: request.id, err: err?.message || err }, "workspace.create.failed");
    return reply.code(500).send({ message: err?.message || "Failed to create workspace" });
  }
});

fastify.patch("/api/workspaces/:id/profile", { preHandler: authGuard }, async (request, reply) => {
  const userId = request.user?.sub;
  const { id } = request.params;
  const payload = request.body || {};
  const startedAt = Date.now();
  try {
    const workspace = await withTimeout(updateWorkspaceProfileForUser(userId, id, payload), 15000, "workspace update");
    fastify.log.info({ reqId: request.id, workspaceId: workspace?.id, ms: Date.now() - startedAt }, "workspace.updated");
    return reply.send({ workspace });
  } catch (err) {
    fastify.log.error({ reqId: request.id, err: err?.message || err }, "workspace.update.failed");
    return reply.code(500).send({ message: err?.message || "Failed to update workspace" });
  }
});

fastify.post("/api/workspaces/launch", { preHandler: authGuard }, async (request, reply) => {
  const userId = request.user?.sub;
  const payload = request.body || {};
  const startedAt = Date.now();
  try {
    fastify.log.info({ reqId: request.id, userId, payload }, "workspace.launch.begin");
    const workspace = await withTimeout(
      createWorkspaceForUser(userId, {
        name: payload.name || "Coding Workspace",
        type: payload.type || "coding",
        preset_key: payload.preset_key || payload.presetKey || "python",
        tools: payload.tools || payload.selected_tools || [],
        image_key: payload.image_key || payload.imageKey || null,
      }),
      15000,
      "workspace create"
    );
    fastify.log.info({ reqId: request.id, workspaceId: workspace.id }, "workspace.launch.workspace_created");
    const launch = await withTimeout(
      createSessionLaunchForUser(userId, {
        environment: "coding",
        workspace_id: workspace.id,
        preset_key: payload.preset_key || payload.presetKey || "python",
        tools: payload.tools || payload.selected_tools || [],
        image: payload.image || payload.image_key || payload.imageKey || null,
      }),
      CODING_SESSION_HOST_TIMEOUT_MS,
      "workspace launch"
    );
    fastify.log.info(
      { reqId: request.id, workspaceId: workspace.id, sessionId: launch?.session?.id, ms: Date.now() - startedAt },
      "workspace.launch"
    );
    return reply.send({ workspace, ...launch });
  } catch (err) {
    fastify.log.error({ reqId: request.id, err: err?.message || err }, "workspace.launch.failed");
    const isTimeout = String(err?.message || "").includes("Timeout");
    return reply
      .code(isTimeout ? 504 : 500)
      .send({ message: err?.message || "Failed to launch workspace" });
  }
});

fastify.post("/api/workspaces/:id/resume", { preHandler: authGuard }, async (request, reply) => {
  const { id } = request.params;
  return createSessionLaunch(request, reply, {
    ...(request.body || {}),
    environment: request.body?.environment || "coding",
    workspace_id: id,
  });
});

fastify.delete("/api/workspaces/:id", { preHandler: authGuard }, async (request, reply) => {
  const userId = request.user?.sub;
  const { id } = request.params;

  const workspace = await get("SELECT * FROM workspaces WHERE id = ? AND user_id = ?", [id, userId]);
  if (!workspace) {
    return reply.code(404).send({ message: "Workspace not found" });
  }

  const activeSessions = await all(
    "SELECT * FROM sessions WHERE workspace_id = ? AND user_id = ? AND status IN ('running', 'open', 'starting')",
    [id, userId]
  );

  for (const session of activeSessions) {
    const dispatchTarget = await getSessionDispatchTarget(session);
    if (dispatchTarget?.deviceId && hostSockets.has(dispatchTarget.deviceId)) {
      try {
        await emitHostCommand(dispatchTarget.deviceId, "stop_container", {
          name: session.container_name || `computex_session_${session.id}`,
        });
      } catch {}
    }
    await run("UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?", ["stopped", new Date().toISOString(), session.id]);
  }

  const launchSelection = await findLaunchHostForUser(userId, request.body?.hostId || null, {
    includeGlobalPool: GLOBAL_HOST_POOL_ENABLED,
    ignoreOveruseProtection: true,
  });
  const launchHost = launchSelection?.host || null;
  if (launchHost?.device_id && hostSockets.has(launchHost.device_id)) {
    try {
      await emitHostCommand(launchHost.device_id, "delete_workspace_data", { workspacePath: workspace.path });
    } catch {}
  }

  await run("DELETE FROM workspaces WHERE id = ? AND user_id = ?", [id, userId]);

  await insertAuditLog({
    eventType: "workspace.delete",
    actorUserId: userId,
    targetType: "workspace",
    targetId: id,
    message: `Workspace ${id} deleted`,
    metadata: { workspaceId: id, path: workspace.path },
  });

  return reply.send({ message: "Workspace deleted", id });
});

fastify.get("/api/sessions/:id/stop", { preHandler: authGuard }, async (request, reply) => {
  const { id } = request.params;
  const userId = request.user?.sub;

  const session = await get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [id, userId]);
  if (!session) {
    return reply.code(404).send({ message: "Session not found" });
  }

  const endedAt = new Date().toISOString();
  await run("UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?", [
    "stopped",
    endedAt,
    id,
  ]);

  let createdWorkspace = null;
  if (session.workspace_id) {
    await run("UPDATE workspaces SET last_used = ? WHERE id = ?", [endedAt, session.workspace_id]);
  } else if (session.environment_type === "coding" && session.workspace_path) {
    const tools = sanitizeWorkspaceTools(safeJsonParse(session.selected_tools, []));
    const presetKey = session.preset_key || "python";
    try {
      createdWorkspace = await createWorkspaceForUser(userId, {
        name: session.title || "Coding Workspace",
        type: "coding",
        path: session.workspace_path,
        preset_key: presetKey,
        tools,
        image_key: session.image || null,
      });
      await run("UPDATE sessions SET workspace_id = ? WHERE id = ?", [createdWorkspace.id, id]);
    } catch (err) {
      fastify.log.error({ sessionId: id, err: err?.message || err }, "workspace.save.on_stop.failed");
    }
  }

  const dispatchTarget = await getSessionDispatchTarget(session);
  if (dispatchTarget?.deviceId && hostSockets.has(dispatchTarget.deviceId)) {
    hostSockets.get(dispatchTarget.deviceId).emit("host:command", {
      command: "stop_container",
      payload: { name: session.container_name || `computex_session_${session.id}` },
    });
  }

  const credits = await ensureCredits(userId);
  const updatedCredits = {
    ...credits,
    used: credits.used + 1,
    balance: credits.balance + 1,
    remaining: Math.max(0, credits.monthly_limit - (credits.used + 1)),
  };

  await run(
    "UPDATE credits SET balance = ?, used = ?, remaining = ? WHERE user_id = ?",
    [updatedCredits.balance, updatedCredits.used, updatedCredits.remaining, userId]
  );

  await insertAuditLog({
    eventType: "session.stop",
    actorUserId: userId,
    targetType: "session",
    targetId: session.id,
    message: `Session ${session.id} stopped`,
    metadata: { sessionId: session.id, hostId: session.host_id, environment: session.environment_type },
  });

  return reply.send({
    message: "Session stopped",
    session: { ...session, status: "stopped", ended_at: endedAt },
    credits: updatedCredits,
    workspace: createdWorkspace,
  });
});

fastify.get("/api/admin/overview", async (_request, reply) => {
  const overview = await getAdminOverview();
  return reply.send(overview);
});

async function buildAdminBootstrapPayload() {
  const overview = await getAdminOverview();
  const hosts = await getAdminHosts();
  const sessions = await getAdminSessions();
  const users = await getAdminUsers();
  const usage = await getUsageSummary();
  const logs = await all(
    `SELECT
      l.*,
      u.email AS actor_email,
      u.name AS actor_name
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.created_at DESC
    LIMIT ?`,
    [80]
  );

  return {
    overview,
    hosts,
    sessions,
    users,
    usage,
    logs: logs.map((log) => ({
      ...log,
      metadata: safeJsonParse(log.metadata, {}),
    })),
  };
}

fastify.get("/api/admin/bootstrap", async (_request, reply) => {
  fastify.log.info("admin bootstrap: start");
  return reply.send(await buildAdminBootstrapPayload());
});

fastify.get("/api/admin/hosts", async (_request, reply) => {
  const hosts = await getAdminHosts();
  return reply.send({ hosts });
});

fastify.post("/api/admin/hosts/:id/toggle", async (request, reply) => {
  const { id } = request.params;
  const enabled = request.body?.enabled !== false;
  const host = await get("SELECT * FROM hosts WHERE id = ?", [id]);
  if (!host) {
    return reply.code(404).send({ message: "Host not found" });
  }

  await run(
    "INSERT INTO host_admin_state (host_id, enabled, updated_at) VALUES (?, ?, ?) ON CONFLICT(host_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at",
    [id, enabled ? 1 : 0, new Date().toISOString()]
  );

  await insertAuditLog({
    eventType: enabled ? "host.enabled" : "host.disabled",
    actorUserId: request.user?.sub,
    targetType: "host",
    targetId: id,
    message: `Host ${id} was ${enabled ? "enabled" : "disabled"}`,
    metadata: { hostId: id, enabled },
  });

  const refreshedHost = (await getAdminHosts()).find((item) => item.id === id) || null;
  return reply.send({ message: `Host ${enabled ? "enabled" : "disabled"}`, host: refreshedHost });
});

fastify.delete("/api/admin/hosts/:id", async (request, reply) => {
  const { id } = request.params;
  const host = await get("SELECT * FROM hosts WHERE id = ?", [id]);
  if (!host) {
    return reply.code(404).send({ message: "Host not found" });
  }

  await run("DELETE FROM host_admin_state WHERE host_id = ?", [id]);
  await run("DELETE FROM hosts WHERE id = ?", [id]);
  if (host.device_id) {
    const linkedCount = await get("SELECT COUNT(*) AS count FROM hosts WHERE device_id = ?", [host.device_id]);
    if (!linkedCount?.count) {
      await run("DELETE FROM host_telemetry WHERE device_id = ?", [host.device_id]);
      await run("DELETE FROM pairing_sessions WHERE device_id = ?", [host.device_id]);
      await run("DELETE FROM host_devices WHERE id = ?", [host.device_id]);
    }
  }

  await insertAuditLog({
    eventType: "host.removed",
    actorUserId: request.user?.sub,
    targetType: "host",
    targetId: id,
    message: `Host ${id} was removed`,
    metadata: { hostId: id, deviceId: host.device_id },
  });

  return reply.send({ message: "Host removed" });
});

fastify.get("/api/admin/sessions", async (_request, reply) => {
  const sessions = await getAdminSessions();
  return reply.send({ sessions });
});

fastify.post("/api/admin/sessions/:id/terminate", async (request, reply) => {
  const { id } = request.params;
  const session = await get("SELECT * FROM sessions WHERE id = ?", [id]);
  if (!session) {
    return reply.code(404).send({ message: "Session not found" });
  }

  if (session.status !== "running") {
    return reply.send({
      message: "Session already inactive",
      session: { ...session, duration_minutes: formatDurationMinutes(session.started_at, session.ended_at) },
    });
  }

  const endedAt = new Date().toISOString();
  await run("UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?", ["stopped", endedAt, id]);

  const dispatchTarget = await getSessionDispatchTarget(session);
  if (dispatchTarget?.deviceId && hostSockets.has(dispatchTarget.deviceId)) {
    hostSockets.get(dispatchTarget.deviceId).emit("host:command", {
      command: "stop_container",
      payload: { name: session.container_name || `computex_session_${session.id}` },
    });
  }

  await insertAuditLog({
    eventType: "session.terminated",
    actorUserId: request.user?.sub,
    targetType: "session",
    targetId: id,
    message: `Session ${id} was force-terminated by admin`,
    metadata: { sessionId: id, hostId: session.host_id, userId: session.user_id, environment: session.environment_type },
  });

  return reply.send({
    message: "Session terminated",
    session: {
      ...session,
      status: "stopped",
      ended_at: endedAt,
      duration_minutes: formatDurationMinutes(session.started_at, endedAt),
    },
  });
});

fastify.get("/api/admin/users", async (_request, reply) => {
  const users = await getAdminUsers();
  return reply.send({ users });
});

fastify.post("/api/admin/users/:id/block", async (request, reply) => {
  const { id } = request.params;
  const blocked = request.body?.blocked !== false;
  const user = await get("SELECT id, email FROM users WHERE id = ?", [id]);
  if (!user) {
    return reply.code(404).send({ message: "User not found" });
  }

  await run(
    "INSERT INTO user_admin_state (user_id, blocked, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET blocked = excluded.blocked, updated_at = excluded.updated_at",
    [id, blocked ? 1 : 0, new Date().toISOString()]
  );

  await insertAuditLog({
    eventType: blocked ? "user.blocked" : "user.unblocked",
    actorUserId: request.user?.sub,
    targetType: "user",
    targetId: id,
    message: `User ${user.email} was ${blocked ? "blocked" : "unblocked"}`,
    metadata: { userId: id, blocked },
  });

  return reply.send({ message: `User ${blocked ? "blocked" : "unblocked"}` });
});

fastify.get("/api/admin/usage", async (_request, reply) => {
  const usage = await getUsageSummary();
  return reply.send(usage);
});

fastify.get("/api/admin/logs", async (request, reply) => {
  const requestedLimit = Number(request.query?.limit || 100);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 100;
  const logs = await all(
    `SELECT
      l.*,
      u.email AS actor_email,
      u.name AS actor_name
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_user_id
    ORDER BY l.created_at DESC
    LIMIT ?`,
    [limit]
  );

  return reply.send({
    logs: logs.map((log) => ({
      ...log,
      metadata: safeJsonParse(log.metadata, {}),
    })),
  });
});

fastify.get("/api/admin/settings", async (_request, reply) => {
  const settings = await getSystemSettings();
  return reply.send({ settings });
});

fastify.post("/api/admin/settings", async (request, reply) => {
  const current = await getSystemSettings();
  const body = request.body || {};
  const settings = await updateSystemSettings({
    allow_new_sessions:
      body.allow_new_sessions === undefined
        ? current.allow_new_sessions
        : parseBooleanSetting(body.allow_new_sessions, current.allow_new_sessions),
    max_session_minutes: parseNumberSetting(
      body.max_session_minutes ?? current.max_session_minutes,
      120,
      15,
      null
    ),
    live_poll_seconds: parseNumberSetting(
      body.live_poll_seconds ?? current.live_poll_seconds,
      10,
      5,
      null
    ),
    enforce_host_overuse_protection:
      body.enforce_host_overuse_protection === undefined
        ? current.enforce_host_overuse_protection
        : parseBooleanSetting(
            body.enforce_host_overuse_protection,
            current.enforce_host_overuse_protection
          ),
    host_max_cpu_percent: parseNumberSetting(
      body.host_max_cpu_percent ?? current.host_max_cpu_percent,
      90,
      1,
      100
    ),
    host_max_ram_percent: parseNumberSetting(
      body.host_max_ram_percent ?? current.host_max_ram_percent,
      90,
      1,
      100
    ),
    host_max_disk_percent: parseNumberSetting(
      body.host_max_disk_percent ?? current.host_max_disk_percent,
      95,
      1,
      100
    ),
    host_telemetry_stale_seconds: parseNumberSetting(
      body.host_telemetry_stale_seconds ?? current.host_telemetry_stale_seconds,
      30,
      5,
      600
    ),
  });

  await insertAuditLog({
    eventType: "system.settings.updated",
    actorUserId: request.user?.sub,
    targetType: "system",
    targetId: "settings",
    message: "System settings updated",
    metadata: settings,
  });

  return reply.send({ message: "Settings updated", settings });
});

io.on("connection", (socket) => {
  fastify.log.info({ socketId: socket.id }, "socket.connected");
  const authToken = socket.handshake?.auth?.token || null;
  const verifiedUser = authToken ? verifySocketToken(authToken) : null;
  if (verifiedUser) {
    socket.data.user = verifiedUser;
    const current = clientSockets.get(verifiedUser.sub) || new Set();
    current.add(socket);
    clientSockets.set(verifiedUser.sub, current);
    fastify.log.info({ socketId: socket.id, userId: verifiedUser.sub }, "socket.authenticated");
  }

  const requireSocketUser = (cb) => {
    const user = socket.data.user;
    if (!user?.sub) {
      cb?.({ ok: false, message: "unauthorized" });
      return null;
    }
    return user;
  };

  socket.on("client:start-session", async (payload, cb) => {
    const user = requireSocketUser(cb);
    if (!user) {
      fastify.log.warn({ socketId: socket.id }, "socket.start-session.unauthorized");
      return;
    }

    try {
      const launchBody = payload || {};
      const useAsyncLaunch = Boolean(launchBody?.async_launch || launchBody?.asyncLaunch);
      fastify.log.info({ userId: user.sub, payload: launchBody, async: useAsyncLaunch }, "socket.start-session");
      const result = useAsyncLaunch
        ? await createAsyncSessionLaunchForUser(user.sub, launchBody)
        : await createSessionLaunchForUser(user.sub, launchBody);
      cb?.({ ok: true, ...result });
    } catch (err) {
      fastify.log.error({ userId: user.sub, err: err?.message || err }, "socket.start-session.failed");
      cb?.({ ok: false, message: err?.message || "Failed to launch environment", statusCode: err?.statusCode || 500 });
    }
  });

  socket.on("host:hello", async (payload, cb) => {
    if (!payload || payload.secret !== HOST_AGENT_SECRET) {
      cb?.({ ok: false, error: "unauthorized" });
      return;
    }

    const hostId = payload.hostId || `host_${uuidv4().slice(0, 6)}`;
    hostSockets.set(hostId, socket);

    await upsertHostDevice({
      deviceId: hostId,
      label: payload.label,
      os: payload.os,
    });

    await run("UPDATE host_devices SET live_status = ?, last_seen_at = ? WHERE id = ?", [
      normalizeHostAvailability(payload.status),
      new Date().toISOString(),
      hostId,
    ]);

    cb?.({ ok: true, hostId });
  });

  socket.on("host:telemetry", async (payload) => {
    if (!payload || !payload.hostId) return;
    const record = {
      id: uuidv4(),
      device_id: payload.hostId,
      cpu: payload.cpu ?? null,
      ram: payload.ram ?? null,
      disk: payload.disk ?? null,
      status: normalizeHostAvailability(payload.status),
      active_sessions: Number(payload.activeSessions ?? 0),
      net_up: payload.net_up ?? null,
      net_down: payload.net_down ?? null,
      created_at: new Date().toISOString(),
    };

    await run(
      "INSERT INTO host_telemetry (id, device_id, cpu, ram, disk, status, active_sessions, net_up, net_down, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        record.id,
        record.device_id,
        record.cpu,
        record.ram,
        record.disk,
        record.status,
        record.active_sessions,
        record.net_up,
        record.net_down,
        record.created_at,
      ]
    );

    await run("UPDATE host_devices SET last_seen_at = ?, live_status = ? WHERE id = ?", [
      record.created_at,
      record.status,
      record.device_id,
    ]);
  });

  socket.on("host:progress", (payload) => {
    if (!payload || !payload.sessionId) return;
    fastify.log.info(
      {
        sessionId: payload.sessionId,
        stage: payload.stage || null,
        hasAccessUrl: Boolean(payload.access_url),
        hasPassword: Boolean(payload.password),
      },
      "host.progress"
    );
    const sessionUpdates = {};
    if (payload.access_url) {
      sessionUpdates.access_url = payload.access_url;
      sessionUpdates.status = "running";
      sessionUpdates.ended_at = null;
    }
    if (payload.password) {
      sessionUpdates.access_password = payload.password;
    }
    if (payload.container_name) {
      sessionUpdates.container_name = payload.container_name;
    }
    if (payload.workspace_path) {
      sessionUpdates.workspace_path = payload.workspace_path;
    }
    if (payload.ok === false) {
      sessionUpdates.status = "failed";
      sessionUpdates.ended_at = new Date().toISOString();
    }
    if (Object.keys(sessionUpdates).length) {
      updateSessionLaunchProgress(payload.sessionId, sessionUpdates).catch((err) => {
        fastify.log.error(
          { sessionId: payload.sessionId, err: err?.message || err },
          "session.progress.persist.failed"
        );
      });
    }
    const userId = launchSessionUser.get(payload.sessionId);
    if (!userId) return;
    const sockets = clientSockets.get(userId);
    if (!sockets) return;
    for (const s of sockets) {
      s.emit("client:launch-progress", payload);
    }
  });

  socket.on("disconnect", () => {
    for (const [hostId, s] of hostSockets.entries()) {
      if (s.id === socket.id) {
        hostSockets.delete(hostId);
      }
    }
    for (const [userId, sockets] of clientSockets.entries()) {
      if (sockets.has(socket)) {
        sockets.delete(socket);
        if (sockets.size === 0) {
          clientSockets.delete(userId);
        }
      }
    }
  });
});

fastify.log.info(`ComputeX backend build ${new Date().toISOString()} | agent-link-logging`);
fastify.log.info("Agent link logging enabled");
await fastify.listen({ port: PORT, host: "0.0.0.0" });
fastify.log.info(`ComputeX backend listening on ${PORT}`);

















