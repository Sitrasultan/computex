import axios from "axios";

const LAST_WORKING_API_BASE_KEY = "computex:lastWorkingApiBase";

const resolveBaseCandidates = () => {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (value) => {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  if (typeof window !== "undefined") {
    pushCandidate(window.localStorage?.getItem(LAST_WORKING_API_BASE_KEY));
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && String(envUrl).trim()) {
    pushCandidate(envUrl);
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      pushCandidate("http://localhost:8080");
      pushCandidate("http://127.0.0.1:8080");
    }
    pushCandidate(`${window.location.protocol}//${window.location.hostname}:8080`);
    if (window.location?.origin) {
      pushCandidate(window.location.origin);
    }
  }

  pushCandidate("http://localhost:8080");
  return candidates;
};

const baseCandidates = resolveBaseCandidates();
const resolvedBaseUrl = baseCandidates[0];

export const api = axios.create({
  baseURL: resolvedBaseUrl,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const shouldRetryBase = (error) => {
  if (!error) return false;
  if (error.code === "ECONNABORTED") return true;
  if (!error.response) return true;
  const status = error.response?.status;
  const url = String(error.config?.url || "");
  if (status === 404 && url.startsWith("/api")) return true;
  return false;
};

const isLikelyJson = (response) => {
  const contentType = response?.headers?.["content-type"] || "";
  return String(contentType).toLowerCase().includes("application/json");
};

const buildUrlForBase = (base, url) => {
  const cleanBase = String(base || "").replace(/\/+$/, "");
  const cleanUrl = String(url || "");
  if (cleanBase.endsWith("/api") && cleanUrl.startsWith("/api/")) {
    return cleanUrl.replace(/^\/api/, "");
  }
  return cleanUrl;
};

export const requestWithFallback = async (config) => {
  const prioritizedBases = [
    api.defaults.baseURL,
    ...baseCandidates,
  ].filter(Boolean).filter((base, index, list) => list.indexOf(base) === index);
  let lastError = null;
  for (const base of prioritizedBases) {
    try {
      if (String(config?.url || "").startsWith("/api") && String(base || "").includes(":5173")) {
        continue;
      }
      const token = localStorage.getItem("token");
      const res = await axios({
        ...config,
        baseURL: base,
        url: buildUrlForBase(base, config?.url),
        headers: {
          ...(config.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (String(config?.url || "").startsWith("/api") && !isLikelyJson(res)) {
        throw new Error(`Non-JSON response from ${base}`);
      }
      if (api.defaults.baseURL !== base) {
        api.defaults.baseURL = base;
      }
      if (typeof window !== "undefined") {
        window.localStorage?.setItem(LAST_WORKING_API_BASE_KEY, base);
      }
      return res;
    } catch (error) {
      lastError = error;
      if (!shouldRetryBase(error)) {
        break;
      }
    }
  }

  throw lastError;
};

export const signup = async (form) => {
  const res = await requestWithFallback({
    method: "post",
    url: "/api/auth/register",
    data: {
      name: form.name,
      email: form.email,
      password: form.password,
    },
  });

  if (res.data?.token) {
    localStorage.setItem("token", res.data.token);
  }
  return res.data;
};

export const login = async (form) => {
  const res = await requestWithFallback({
    method: "post",
    url: "/api/auth/login",
    data: form,
  });
  if (res.data?.token) {
    localStorage.setItem("token", res.data.token);
  }
  return res.data;
};

export const requestHostEmailCode = async (email) => {
  const res = await api.post("/api/hosts/email/request", { email });
  return res.data;
};

export const verifyHostEmailCode = async (email, code) => {
  const res = await api.post("/api/hosts/email/verify", { email, code });
  return res.data;
};

export const registerHost = async (payload) => {
  const res = await api.post("/api/hosts/register", payload);
  if (res.data?.token) {
    localStorage.setItem("token", res.data.token);
  }
  return res.data;
};

export const getHostPairStatus = async (code) => {
  const res = await api.post("/api/hosts/pair/status", { code });
  return res.data;
};

export const verifyHostPairCode = async (payload) => {
  const res = await api.post("/api/hosts/pair/verify", payload);
  return res.data;
};

export const adminApi = {
  getOverview: async () => (await api.get("/api/admin/overview")).data,
  getHosts: async () => (await api.get("/api/admin/hosts")).data,
  getSessions: async () => (await api.get("/api/admin/sessions")).data,
  getUsers: async () => (await api.get("/api/admin/users")).data,
  getUsage: async () => (await api.get("/api/admin/usage")).data,
  getLogs: async (limit = 100) => (await api.get(`/api/admin/logs?limit=${limit}`)).data,
  updateSettings: async (payload) => (await api.post("/api/admin/settings", payload)).data,
};
