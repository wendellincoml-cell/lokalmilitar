import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [bg, setBg] = useState(localStorage.getItem("system_background_color") || "#F5F0E6");
  const [panel, setPanel] = useState(localStorage.getItem("system_panel_color") || "#FBF9F4");

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
    <AuthCtx.Provider value={{ user, login, logout, bg, applyBg, panel, applyPanel }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
