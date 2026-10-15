import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Shield } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Bem-vindo ao LOKAL MILITAR");
      nav("/");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao autenticar");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#0b0b0b" }} data-testid="login-page">
      <div className="hidden md:flex md:w-1/2 relative" style={{
        backgroundImage: "linear-gradient(rgba(10,10,10,.72),rgba(10,10,10,.86)), url(https://images.unsplash.com/photo-1569242840510-9fe6f0112cee?w=1200&q=80)",
        backgroundSize: "cover", backgroundPosition: "center"
      }}>
        <div className="p-14 flex flex-col justify-end text-white">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={44} color="#B8860B" />
            <div className="lokal-stencil text-4xl">LOKAL MILITAR</div>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color: "#C3B091" }}>FARDAS · EQUIPAMENTOS · ARTIGOS MILITARES</p>
          <div className="mt-6 h-1 w-24" style={{ background: "#B8860B" }}></div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="mb-8">
            <div className="lokal-stencil text-2xl text-white">COMANDO · ACESSO</div>
            <div className="font-mono text-xs text-neutral-500 mt-1">Entrar no painel operacional</div>
          </div>
          <label className="text-xs text-neutral-400 font-mono">E-MAIL</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required
            className="w-full bg-black border border-neutral-700 text-white px-3 py-2 mb-4 mt-1 rounded-sm font-mono text-sm"
            data-testid="login-email" />
          <label className="text-xs text-neutral-400 font-mono">SENHA</label>
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" required
            className="w-full bg-black border border-neutral-700 text-white px-3 py-2 mb-6 mt-1 rounded-sm font-mono text-sm"
            data-testid="login-password" />
          <button type="submit" disabled={loading}
            className="w-full lokal-btn-primary disabled:opacity-50" data-testid="login-submit">
            {loading ? "Autenticando..." : "ENTRAR"}
          </button>
        </form>
      </div>
    </div>
  );
}
