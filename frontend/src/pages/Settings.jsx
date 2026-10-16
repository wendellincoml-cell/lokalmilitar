import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, DEFAULT_THEME } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const COLORS = [
  { name: "Branco", value: "#FFFFFF" }, { name: "Cinza Claro", value: "#F5F5F5" }, { name: "Bege", value: "#F5F0E6" },
  { name: "Azul Claro", value: "#E6F0FF" }, { name: "Verde Claro", value: "#E6FFE6" }, { name: "Escuro", value: "#1E1E1E" },
];
const PANEL_COLORS = [
  { name: "Creme", value: "#FBF9F4" }, { name: "Branco", value: "#FFFFFF" }, { name: "Bege", value: "#F5F0E6" },
  { name: "Caqui Claro", value: "#EDE4D0" }, { name: "Oliva Claro", value: "#E9ECDC" }, { name: "Cinza Claro", value: "#F0F0F0" },
  { name: "Escuro", value: "#1E1E1E" },
];

const Swatches = ({ colors, current, onPick, prefix }) => (
  <div className="flex flex-wrap gap-3">
    {colors.map((c) => (
      <button key={c.value} onClick={() => onPick(c.value)} data-testid={`${prefix}-${c.name}`}
        className={`flex flex-col items-center gap-1 p-2 border rounded ${current === c.value ? "border-[#B8860B] ring-2 ring-[#B8860B]" : ""}`}>
        <span className="w-12 h-12 border rounded" style={{ background: c.value }} />
        <span className="text-[11px] font-head">{c.name}</span>
      </button>
    ))}
  </div>
);
const HEAD_FONTS = ["Oswald", "Bebas Neue", "Barlow Condensed", "Teko", "Black Ops One", "Saira Stencil One", "Rajdhani", "Roboto Condensed", "Archivo"];
const BODY_FONTS = ["Barlow", "IBM Plex Sans", "Source Sans 3", "Nunito Sans", "Roboto Condensed", "Archivo", "Rajdhani"];
const THEME_COLORS = [
  ["title_color", "Cor dos títulos"], ["primary_color", "Cor principal (botões, destaques)"],
  ["accent_color", "Cor de detalhe (dourado)"], ["sidebar_color", "Cor do menu lateral"],
];

function ThemeSection({ theme, applyTheme, onSave }) {
  return (
    <section className="lokal-panel p-4" data-testid="theme-section">
      <h2 className="lokal-stencil text-sm mb-1">Aparência — fontes e cores</h2>
      <p className="text-xs text-neutral-500 mb-3">Vale para todas as abas do sistema. As mudanças aparecem na hora; clique em salvar para manter.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <label><div className="text-[11px] font-head text-neutral-600 mb-1">Fonte dos títulos</div>
          <select className="lm-input" value={theme.font_head} onChange={(e) => applyTheme({ font_head: e.target.value })} data-testid="theme-font-head">
            {HEAD_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select></label>
        <label><div className="text-[11px] font-head text-neutral-600 mb-1">Fonte dos textos</div>
          <select className="lm-input" value={theme.font_body} onChange={(e) => applyTheme({ font_body: e.target.value })} data-testid="theme-font-body">
            {BODY_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select></label>
        {THEME_COLORS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-3">
            <input type="color" value={theme[k]} onChange={(e) => applyTheme({ [k]: e.target.value })} className="w-12 h-10 border rounded cursor-pointer" data-testid={`theme-${k}`} />
            <span className="text-sm">{l} <span className="font-mono text-xs text-neutral-500">{theme[k]}</span></span>
          </label>
        ))}
      </div>
      <div className="lm-card p-3 mt-3" data-testid="theme-preview">
        <h3 className="text-xl font-bold" style={{ color: "var(--title-color)" }}>Prévia do título</h3>
        <p className="text-sm">Texto de exemplo com a fonte escolhida para o corpo do sistema.</p>
        <button className="lm-btn lm-btn-olive mt-2">Botão principal</button>
      </div>
      <div className="flex gap-2 mt-3">
        <button className="lm-btn lm-btn-olive" onClick={() => onSave(theme)} data-testid="theme-save">Salvar aparência</button>
        <button className="lm-btn lm-btn-outline" onClick={() => { applyTheme(DEFAULT_THEME); onSave(DEFAULT_THEME); }} data-testid="theme-reset">Restaurar padrão</button>
      </div>
    </section>
  );
}

const STORE_FIELDS = [
  ["store_full_name", "Razão social"], ["cnpj", "CNPJ"], ["address", "Endereço"], ["phone", "Telefone"],
  ["instagram", "Instagram"], ["pix_key", "Chave PIX"], ["print_footer_text", "Rodapé da impressão"],
];

export default function Settings() {
  const { user, bg, applyBg, panel, applyPanel, theme, applyTheme } = useAuth();
  const [s, setS] = useState(null);
  const [users, setUsers] = useState([]);
  const [nu, setNu] = useState({ name: "", email: "", password: "", role: "vendedor" });

  const loadUsers = () => api.get("/auth/users").then((r) => setUsers(r.data));
  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); loadUsers(); }, []);

  const pickColor = async (c) => { applyBg(c); await api.put("/settings", { background_color: c }); toast.success("Fundo atualizado"); };
  const pickPanel = async (c) => { applyPanel(c); await api.put("/settings", { panel_color: c }); toast.success("Cor das janelas atualizada"); };
  const saveTheme = async (t) => { await api.put("/settings", { theme: t }); toast.success("Aparência salva"); };
  const saveStore = async () => { await api.put("/settings", s); toast.success("Dados salvos"); };
  const addUser = async () => {
    try { await api.post("/auth/users", nu); toast.success("Usuário criado"); setNu({ name: "", email: "", password: "", role: "vendedor" }); loadUsers(); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Erro ao criar usuário"); }
  };
  const delUser = async (id) => { if (!window.confirm("Excluir usuário?")) return; await api.delete(`/auth/users/${id}`); loadUsers(); };

  if (!s) return <div className="font-mono">Carregando...</div>;
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-5" data-testid="settings-page">
      <div className="lm-page-head"><h1>Configurações</h1><p>Aparência, dados da empresa e usuários</p></div>

      <section className="lokal-panel p-4">
        <h2 className="lokal-stencil text-sm mb-3">Cor de fundo do sistema</h2>
        <Swatches colors={COLORS} current={bg} onPick={pickColor} prefix="bg-color" />
      </section>

      <section className="lokal-panel p-4">
        <h2 className="lokal-stencil text-sm mb-1">Cor das janelas flutuantes</h2>
        <p className="text-xs text-neutral-500 mb-3">Aplica-se aos formulários laterais, janelas de entrada/saída, desmontagem e pré-visualização.</p>
        <Swatches colors={PANEL_COLORS} current={panel} onPick={pickPanel} prefix="panel-color" />
      </section>

      <ThemeSection theme={theme} applyTheme={applyTheme} onSave={saveTheme} />

      <section className="lokal-panel p-4">
        <h2 className="lokal-stencil text-sm mb-3">Dados da empresa (impressão)</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {STORE_FIELDS.map(([k, l]) => (
            <label key={k}><div className="text-[11px] font-mono text-neutral-500 mb-1">{l}</div>
              <input className="w-full border px-2 py-1.5 text-sm rounded-sm" value={s[k] || ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} data-testid={`set-${k}`} />
            </label>
          ))}
        </div>
        <button className="lokal-btn-primary mt-3" onClick={saveStore} data-testid="save-settings">SALVAR</button>
      </section>

      <section className="lokal-panel p-4">
        <h2 className="lokal-stencil text-sm mb-3">Usuários e vendedores</h2>
        <table className="w-full text-sm table-mono mb-3">
          <thead className="bg-neutral-100 text-[11px]"><tr><th className="p-2 text-left">NOME</th><th className="text-left">E-MAIL</th><th className="text-left">PERFIL</th><th></th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} className="border-t"><td className="p-2">{u.name}</td><td>{u.email}</td><td>{u.role}</td>
              <td>{isAdmin && u.id !== user.id && <button className="text-red-700 p-1" onClick={() => delUser(u.id)} data-testid={`del-user-${u.email}`}><Trash2 size={13} /></button>}</td></tr>
          ))}</tbody>
        </table>
        {isAdmin ? (
          <div className="grid md:grid-cols-5 gap-2">
            <input className="border px-2 py-1.5 text-sm" placeholder="Nome" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} data-testid="nu-name" />
            <input className="border px-2 py-1.5 text-sm" placeholder="E-mail" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} data-testid="nu-email" />
            <input className="border px-2 py-1.5 text-sm" type="password" placeholder="Senha" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} data-testid="nu-password" />
            <select className="border px-2 py-1.5 text-sm" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} data-testid="nu-role">
              <option value="vendedor">Vendedor</option><option value="admin">Admin</option>
            </select>
            <button className="lokal-btn-primary" onClick={addUser} data-testid="nu-save">ADICIONAR</button>
          </div>
        ) : <div className="text-xs font-mono text-neutral-500">Apenas administradores podem gerenciar usuários.</div>}
      </section>
    </div>
  );
}
