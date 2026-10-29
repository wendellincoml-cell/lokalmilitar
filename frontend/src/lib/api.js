import axios from "axios";

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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("lokal_token") || sessionStorage.getItem("lokal_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401) {
    localStorage.removeItem("lokal_token");
    sessionStorage.removeItem("lokal_token");
    localStorage.removeItem("lokal_user");
    sessionStorage.removeItem("lokal_user");
    sessionStorage.removeItem("lokal_public_access");
    if (window.location.pathname !== "/login") window.location.href = "/login";
  }
  return Promise.reject(error);
});

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
