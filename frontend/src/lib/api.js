import axios from "axios";
import {
  queueOfflineMutation,
  readCachedApiResponse,
  saveApiResponse,
  updateOfflineCacheForMutation,
} from "@/lib/offlineSync";

const configuredUrl = process.env.REACT_APP_BACKEND_URL?.trim().replace(/\/+$/, "") || "";
const productionApiUrl = "https://lokalmilitar-api.onrender.com";
const backendUrl =
  configuredUrl === "https://lokalmilitar.onrender.com" ? productionApiUrl : configuredUrl;
const isRemoteBrowser =
  typeof window !== "undefined" &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname);
const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(backendUrl);
const BACKEND_URL =
  pointsToLocalhost && isRemoteBrowser
    ? productionApiUrl
    : backendUrl || (isRemoteBrowser ? productionApiUrl : "");
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

const requestPath = (config) => {
  const url = config.url || "";
  const baseURL = config.baseURL || API;
  if (/^https?:\/\//i.test(url)) return new URL(url).pathname;
  const base = new URL(baseURL, window.location.origin);
  const [pathname, search = ""] = url.split("?");
  const combinedPath = `${base.pathname.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  return new URL(`${combinedPath}${search ? `?${search}` : ""}`, window.location.origin).pathname;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("lokal_token") || sessionStorage.getItem("lokal_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const method = (config.method || "get").toUpperCase();
  const path = requestPath(config);
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !path.startsWith("/api/auth/")) {
    config.headers["X-Offline-Operation-Id"] ||= window.crypto?.randomUUID?.()
      || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = Math.random() * 16 | 0;
        return (character === "x" ? random : (random & 0x3 | 0x8)).toString(16);
      });
    if (method === "POST" && path.replace(/^\/api\/?/, "").split("/").filter(Boolean).length === 1) {
      let data = config.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { data = null; }
      }
      if (data && typeof data === "object" && !Array.isArray(data) && !data.id) {
        data.id = window.crypto?.randomUUID?.()
          || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
            const random = Math.random() * 16 | 0;
            return (character === "x" ? random : (random & 0x3 | 0x8)).toString(16);
          });
        config.data = data;
      }
    }
  }
  return config;
});

api.interceptors.response.use(
  async (response) => {
    const method = (response.config.method || "get").toUpperCase();
    if (["GET", "HEAD"].includes(method)) {
      try {
        await saveApiResponse(response.config.url, response.data);
      } catch (error) {
        console.error("Não foi possível atualizar o cache offline.", error);
      }
    } else {
      try {
        await updateOfflineCacheForMutation(response.config, response.data);
      } catch (error) {
        console.error("Não foi possível atualizar os dados locais após a alteração.", error);
      }
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("lokal_token");
      sessionStorage.removeItem("lokal_token");
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    const config = error.config;
    const method = (config?.method || "get").toUpperCase();
    if (
      config &&
      !config._skipOfflineQueue &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !error.response &&
      (!navigator.onLine || error.code === "ERR_NETWORK")
    ) {
      try {
        const queued = await queueOfflineMutation(config);
        return {
          data: queued.data,
          status: 202,
          statusText: "Accepted for offline synchronization",
          headers: {},
          config,
          request: error.request,
        };
      } catch (queueError) {
        console.error("Não foi possível guardar a alteração para sincronização.", queueError);
        error.offlineQueueError = queueError;
      }
    }
    if (
      config &&
      ["GET", "HEAD"].includes(method) &&
      !config._forceNetwork &&
      !error.response &&
      (!navigator.onLine || error.code === "ERR_NETWORK")
    ) {
      try {
        const data = await readCachedApiResponse(config.url);
        if (data !== null) {
          return {
            data,
            status: 200,
            statusText: "Loaded from offline cache",
            headers: {},
            config,
            request: error.request,
          };
        }
      } catch (cacheError) {
        console.error("Não foi possível carregar os dados salvos neste dispositivo.", cacheError);
        error.offlineCacheError = cacheError;
      }
    }
    return Promise.reject(error);
  }
);

export const formatBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export const formatDateShort = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
};
