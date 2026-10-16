import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export const DEFAULT_THEME = {
  font_head: "Oswald", font_body: "Barlow", title_color: "#111111",
  primary_color: "#4B5320", accent_color: "#B8860B", sidebar_color: "#111111",
};
const readTheme = () => {
  try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem("system_theme") || "{}") }; } catch { return DEFAULT_THEME; }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [bg, setBg] = useState(localStorage.getItem("system_background_color") || "#F5F0E6");
  const [panel, setPanel] = useState(localStorage.getItem("system_panel_color") || "#FBF9F4");
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty("--font-head", `'${theme.font_head}', sans-serif`);
    s.setProperty("--font-body", `'${theme.font_body}', sans-serif`);
    s.setProperty("--title-color", theme.title_color);
    s.setProperty("--olive", theme.primary_color);
    s.setProperty("--gold", theme.accent_color);
    s.setProperty("--sidebar-bg", theme.sidebar_color);
  }, [theme]);

  const applyTheme = (patch) => setTheme((t) => {
    const next = { ...t, ...patch };
    localStorage.setItem("system_theme", JSON.stringify(next));
    return next;
  });

  useEffect(() => {
    const dark = panel === "#1E1E1E";
    document.documentElement.style.setProperty("--panel-bg", panel);
    document.documentElement.style.setProperty("--panel-fg", dark ? "#F2EEE6" : "#111111");
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
    const token = localStorage.getItem("lokal_token");
    if (!token) { setUser(null); return; }
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => { setUser(null); localStorage.removeItem("lokal_token"); });
    api.get("/settings").then((r) => {
      if (r.data.background_color) applyBg(r.data.background_color);
      if (r.data.panel_color) applyPanel(r.data.panel_color);
      if (r.data.theme) applyTheme(r.data.theme);
    }).catch(() => {});
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("lokal_token", data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("lokal_token");
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthCtx.Provider value={{ user, login, logout, bg, applyBg, panel, applyPanel, theme, applyTheme }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
