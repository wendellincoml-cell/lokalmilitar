import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DEFAULT_DASHBOARD_PREFERENCES, mergeDashboardPreferences } from "@/pages/dashboardPreferences";

const AuthCtx = createContext(null);

export const DEFAULT_THEME = {
  font_head: "Oswald", font_body: "Barlow", title_color: "#111111",
  primary_color: "#4B5320", accent_color: "#B8860B", sidebar_color: "#111111",
  text_color: "#222222", muted_text_color: "#666666", border_color: "#D9D2C3",
  input_bg: "#FFFFFF", input_text: "#111111", sidebar_text: "#E6E6E6",
  button_text: "#FFFFFF", chip_color: "#E8E2D5",
  card_header_bg: "#111111", card_header_text: "#E9DFC6",
  card_header_metallic: false,
  card_header_gradient_start: "#4B5320",
  card_header_gradient_middle: "#FFFFFF",
  card_header_gradient_end: "#B8860B",
};
const readTheme = () => {
  try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem("system_theme") || "{}") }; } catch { return DEFAULT_THEME; }
};
const readDashboardPreferences = () => {
  try {
    return mergeDashboardPreferences(JSON.parse(localStorage.getItem("dashboard_preferences") || "null"));
  } catch {
    return DEFAULT_DASHBOARD_PREFERENCES;
  }
};
const readableTextColor = (hex) => {
  const channels = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!channels) return "#111111";
  const luminance = channels.slice(1).reduce((sum, value, index) => {
    const channel = parseInt(value, 16) / 255;
    return sum + channel * [0.299, 0.587, 0.114][index];
  }, 0);
  return luminance > 0.58 ? "#111111" : "#F2EEE6";
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [publicAccess, setPublicAccess] = useState(false);
  const [bg, setBg] = useState(localStorage.getItem("system_background_color") || "#F5F0E6");
  const [panel, setPanel] = useState(localStorage.getItem("system_panel_color") || "#FBF9F4");
  const [theme, setTheme] = useState(readTheme);
  const [dashboardPreferences, setDashboardPreferences] = useState(readDashboardPreferences);

  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty("--font-head", `'${theme.font_head}', sans-serif`);
    s.setProperty("--font-body", `'${theme.font_body}', sans-serif`);
    s.setProperty("--title-color", theme.title_color);
    s.setProperty("--olive", theme.primary_color);
    s.setProperty("--gold", theme.accent_color);
    s.setProperty("--sidebar-bg", theme.sidebar_color);
    s.setProperty("--system-text-color", theme.text_color);
    s.setProperty("--muted-text-color", theme.muted_text_color);
    s.setProperty("--line", theme.border_color);
    s.setProperty("--input-bg", theme.input_bg);
    s.setProperty("--input-text", theme.input_text);
    s.setProperty("--sidebar-text", theme.sidebar_text);
    s.setProperty("--button-text", theme.button_text);
    s.setProperty("--chip", theme.chip_color);
    s.setProperty("--card-header-bg", theme.card_header_bg);
    s.setProperty("--card-header-background", theme.card_header_metallic
      ? `linear-gradient(115deg, ${theme.card_header_gradient_start} 0%, color-mix(in srgb, ${theme.card_header_gradient_start} 65%, ${theme.card_header_gradient_middle}) 18%, ${theme.card_header_gradient_end} 40%, color-mix(in srgb, ${theme.card_header_gradient_end} 40%, ${theme.card_header_gradient_middle}) 52%, ${theme.card_header_gradient_start} 72%, ${theme.card_header_gradient_end} 100%)`
      : theme.card_header_bg);
    s.setProperty("--card-header-text", theme.card_header_text);
  }, [theme]);

  const applyTheme = (patch) => setTheme((t) => {
    const next = { ...t, ...patch };
    localStorage.setItem("system_theme", JSON.stringify(next));
    return next;
  });

  const applyDashboardPreferences = useCallback((value) => setDashboardPreferences((current) => {
    const next = mergeDashboardPreferences({ ...current, ...value });
    localStorage.setItem("dashboard_preferences", JSON.stringify(next));
    return next;
  }), []);

  useEffect(() => {
    const readable = readableTextColor(panel);
    document.documentElement.style.setProperty("--panel-bg", panel);
    document.documentElement.style.setProperty("--cream", panel);
    document.documentElement.style.setProperty("--panel-fg", readable);
  }, [panel]);

  const applyPanel = (color) => {
    setPanel(color);
    localStorage.setItem("system_panel_color", color);
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--system-bg-color", bg);
    document.body.style.backgroundColor = bg;
  }, [bg]);

  const applyBg = (color) => {
    setBg(color);
    localStorage.setItem("system_background_color", color);
  };

  useEffect(() => {
    let cancelled = false;
    const applySettings = (response) => {
      if (cancelled) return;
      if (response.data.background_color) applyBg(response.data.background_color);
      if (response.data.panel_color) applyPanel(response.data.panel_color);
      if (response.data.theme) applyTheme(response.data.theme);
      if (response.data.dashboard_preferences) applyDashboardPreferences(response.data.dashboard_preferences);
    };
    const initialize = async () => {
      const modeRequest = api.get("/auth/mode").catch((error) => {
        console.error("Não foi possível verificar o modo de acesso.", error);
        return null;
      });
      const token = localStorage.getItem("lokal_token") || sessionStorage.getItem("lokal_token");
      const userRequest = token
        ? api.get("/auth/me").then((response) => ({ response }), (error) => ({ error }))
        : null;
      if (token) {
        api.get("/settings").then(applySettings).catch((error) => {
          console.error("Não foi possível carregar as configurações.", error);
        });
      }
      const modeResponse = await modeRequest;
      const isPublic = Boolean(modeResponse?.data?.public_access);
      if (cancelled) return;
      setPublicAccess(isPublic);
      if (!isPublic) sessionStorage.removeItem("lokal_public_access");

      if (!token) {
        const publicSession = isPublic && sessionStorage.getItem("lokal_public_access") === "true";
        const publicUser = publicSession ? {
          id: "public-access",
          email: "",
          name: "Acesso público",
          role: "admin",
        } : null;
        setUser(publicUser);
        if (publicUser) {
          api.get("/settings").then(applySettings).catch((error) => {
            console.error("Não foi possível carregar as configurações.", error);
          });
        }
        return;
      }
      try {
        const { response, error } = await userRequest;
        if (error) throw error;
        if (!cancelled) {
          setUser(response.data);
        }
      } catch (error) {
        if (!cancelled) {
          setUser(null);
          if (error.response) {
            localStorage.removeItem("lokal_token");
            sessionStorage.removeItem("lokal_token");
            localStorage.removeItem("lokal_user");
            sessionStorage.removeItem("lokal_user");
          }
        }
      }
    };
    initialize();
    return () => { cancelled = true; };
  }, [applyDashboardPreferences]);

  const login = async (email, password, remember = true) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.removeItem("lokal_token");
    sessionStorage.removeItem("lokal_token");
    sessionStorage.removeItem("lokal_public_access");
    localStorage.removeItem("lokal_user");
    sessionStorage.removeItem("lokal_user");
    (remember ? localStorage : sessionStorage).setItem("lokal_token", data.access_token);
    (remember ? localStorage : sessionStorage).setItem("lokal_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("lokal_token");
    sessionStorage.removeItem("lokal_token");
    sessionStorage.removeItem("lokal_public_access");
    localStorage.removeItem("lokal_user");
    sessionStorage.removeItem("lokal_user");
    setUser(null);
    window.location.href = "/login";
  };

  const enterPublicAccess = () => {
    if (!publicAccess) return;
    sessionStorage.setItem("lokal_public_access", "true");
    const publicUser = {
      id: "public-access",
      email: "",
      name: "Acesso público",
      role: "admin",
    };
    setUser(publicUser);
  };

  return (
    <AuthCtx.Provider value={{
      user, login, logout, publicAccess, enterPublicAccess, bg, applyBg, panel, applyPanel, theme, applyTheme,
      dashboardPreferences, applyDashboardPreferences,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
