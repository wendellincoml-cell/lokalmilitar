import React, { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { api } from "@/lib/api";

export default function Login() {
  const { user, login, publicAccess, enterPublicAccess } = useAuth();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState(() => searchParams.get("invite") || "");
  const [remember, setRemember] = useState(true);
  const [registering, setRegistering] = useState(() => Boolean(searchParams.get("invite")));
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (registering) {
        if (!inviteCode.trim()) {
          toast.error("Informe o código de convite fornecido pelo administrador");
          return;
        }
        await api.post("/auth/register", { name, email, password, invite_code: inviteCode.trim() });
        toast.success("Cadastro realizado. Você já pode entrar com acesso de visualização.");
        setRegistering(false);
        setPassword("");
        setInviteCode("");
        setSearchParams({}, { replace: true });
        return;
      }
      await login(email, password, remember);
      toast.success("Bem-vindo ao LOKAL MILITAR");
      nav("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
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
            <div className="lokal-stencil text-2xl text-white">{registering ? "NOVO CADASTRO" : "COMANDO · ACESSO"}</div>
            <div className="font-mono text-xs text-neutral-500 mt-1">{registering ? "O cadastro exige convite e libera inicialmente apenas visualização" : "Entrar no painel operacional"}</div>
            {!registering && publicAccess && <div className="mt-3 text-xs text-amber-400" role="alert">
              Modo público ativo: qualquer visitante pode consultar e alterar os dados do sistema.
            </div>}
          </div>
          {registering && <>
            <label className="text-xs text-neutral-400 font-mono">NOME</label>
            <input value={name} onChange={(e) => setName(e.target.value)} type="text" required
              className="w-full bg-black border border-neutral-700 text-white px-3 py-2 mb-4 mt-1 rounded-sm font-mono text-sm"
              data-testid="register-name" />
            <label className="text-xs text-neutral-400 font-mono">CÓDIGO DE CONVITE</label>
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} type="text" required
              className="w-full bg-black border border-neutral-700 text-white px-3 py-2 mb-4 mt-1 rounded-sm font-mono text-sm"
              autoComplete="off" data-testid="register-invite-code" />
          </>}
          <label className="text-xs text-neutral-400 font-mono">E-MAIL</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            className="w-full bg-black border border-neutral-700 text-white px-3 py-2 mb-4 mt-1 rounded-sm font-mono text-sm"
            data-testid="login-email" />
          <label className="text-xs text-neutral-400 font-mono">SENHA {registering && "(mínimo 8 caracteres)"}</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={registering ? 8 : undefined}
            className="w-full bg-black border border-neutral-700 text-white px-3 py-2 mb-4 mt-1 rounded-sm font-mono text-sm"
            data-testid="login-password" />
          {!registering && <label className="flex items-center gap-2 text-xs text-neutral-400 font-mono mb-5">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="login-remember" />
            Manter conectado neste dispositivo
          </label>}
          <button type="submit" disabled={loading}
            className="w-full lokal-btn-primary disabled:opacity-50" data-testid="login-submit">
            {loading ? "Aguarde..." : registering ? "CRIAR CONTA" : "ENTRAR"}
          </button>
          {!registering && publicAccess && <button type="button" className="w-full mt-3 text-xs text-amber-400 underline"
            onClick={() => { enterPublicAccess(); nav("/"); }} data-testid="enter-public-access">
            ACESSAR SEM LOGIN
          </button>}
          <button type="button" className="w-full mt-4 text-xs text-neutral-400 underline" onClick={() => setRegistering((current) => !current)} data-testid="toggle-register">
            {registering ? "Já tenho uma conta — voltar ao login" : "Cadastrar novo usuário"}
          </button>
        </form>
      </div>
    </div>
  );
}
