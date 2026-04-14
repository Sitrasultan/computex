import { io } from "socket.io-client";
import { requestWithFallback } from "./api";

const normalizeSocketBase = (baseUrl) => {
  const value = String(baseUrl || "").trim();
  if (!value) return value;
  return value.replace(/\/api\/?$/, "");
};

const resolveSocketCandidates = () => {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (value) => {
    const normalized = normalizeSocketBase(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  if (typeof window !== "undefined") {
    pushCandidate(window.localStorage?.getItem("computex:lastWorkingApiBase"));
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  pushCandidate(envUrl);

  if (typeof window !== "undefined" && window.location?.hostname) {
    pushCandidate(`http://${window.location.hostname}:8080`);
    if (window.location.protocol === "https:") {
      pushCandidate(`https://${window.location.hostname}:8080`);
    }
    if (window.location?.origin) {
      pushCandidate(window.location.origin);
    }
  }

  pushCandidate("http://localhost:8080");
  return candidates;
};

const socketCandidates = resolveSocketCandidates();

const buildSocket = (token, url) => {
  return io(url, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    auth: token ? { token } : {},
  });
};

export function createAppSocket(token) {
  return buildSocket(token, socketCandidates[0]);
}

export async function ensureSocketConnected(socket, timeoutMs = 10000) {
  if (!socket) {
    throw new Error("Socket is not available");
  }

  if (socket.connected) {
    return socket;
  }

  await new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleError);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const handleConnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(socket);
    };

    const handleError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(err?.message || "Socket connection failed"));
    };

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Socket connection timed out"));
    }, timeoutMs);

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleError);
    socket.connect();
  });

  return socket;
}

export async function connectAppSocket(token, timeoutMs = 10000) {
  if (!token) {
    throw new Error("Missing auth token");
  }

  let lastError = null;
  for (const candidate of socketCandidates) {
    const socket = buildSocket(token, candidate);
    try {
      await ensureSocketConnected(socket, timeoutMs);
      return socket;
    } catch (error) {
      lastError = error;
      socket.disconnect();
    }
  }

  throw lastError || new Error("Socket connection failed");
}

export async function emitSessionStart(payload, timeoutMs = 180000) {
  const launchPayload = {
    ...(payload || {}),
    async_launch: Boolean(payload?.async_launch || payload?.asyncLaunch),
  };
  try {
    const httpResponse = await requestWithFallback({
      method: "post",
      url: "/api/sessions/start",
      data: launchPayload,
      timeout: timeoutMs,
    });
    return httpResponse?.data;
  } catch (httpError) {
    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error(httpError?.response?.data?.message || httpError?.message || "Missing auth token");
    }

    const socket = await connectAppSocket(token);
    try {
      return await new Promise((resolve, reject) => {
        socket.timeout(timeoutMs).emit("client:start-session", launchPayload, (err, response) => {
          if (err) {
            console.error("socket start-session timeout", err);
            reject(new Error(err?.message || "Socket request timed out"));
            return;
          }
          if (!response?.ok) {
            console.error("socket start-session failed", response);
            reject(new Error(response?.message || "Launch request failed"));
            return;
          }
          resolve(response);
        });
      });
    } catch (socketError) {
      const message =
        socketError?.message ||
        httpError?.response?.data?.message ||
        httpError?.message ||
        "Launch request failed";
      throw new Error(message);
    } finally {
      socket.disconnect();
    }
  }
}
