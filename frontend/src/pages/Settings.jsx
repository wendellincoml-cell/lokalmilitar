import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, DEFAULT_THEME } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  DASHBOARD_KPIS,
  DEFAULT_DASHBOARD_PREFERENCES,
  getDashboardGridPositions,
  mergeDashboardPreferences,
} from "@/pages/dashboardPreferences";

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
  ["title_color", "Títulos"],
  ["text_color", "Textos"],
  ["muted_text_color", "Textos secundários"],
  ["border_color", "Contornos e divisórias"],
  ["input_bg", "Fundo dos campos"],
  ["input_text", "Texto dos campos"],
  ["primary_color", "Botões principais e seleção"],
  ["button_text", "Texto dos botões principais"],
  ["accent_color", "Destaques e detalhes"],
  ["chip_color", "Etiquetas e balões"],
  ["card_header_bg", "Fundo dos cabeçalhos de cartões"],
  ["card_header_text", "Texto dos cabeçalhos de cartões"],
  ["sidebar_color", "Fundo do menu lateral"],
  ["sidebar_text", "Texto do menu lateral"],
];
const dashboardItemId = (category) => `category:${category}`;
const dashboardItemLabel = (id, categories) => {
  if (id.startsWith("category:")) return `Estoque: ${id.slice("category:".length)}`;
  if (id === "chart") return "Gráfico de vendas";
  return DASHBOARD_KPIS.find((item) => item.id === id)?.label || id;
};

function ThemeSection({ theme, applyTheme, onSave, onReset }) {
  return (
    <section className="lokal-panel p-4" data-testid="theme-section">
      <h2 className="lokal-stencil text-sm mb-1">Aparência — fontes e cores</h2>
      <p className="text-xs text-neutral-500 mb-3">Personalize cores do fundo, balões, textos, campos, contornos, menu, botões e cabeçalhos. As mudanças aparecem na hora; salve para manter em todas as abas.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <label><div className="text-[11px] font-head text-neutral-600 mb-1">Fonte dos títulos</div>
          <select className="lm-input" value={theme.font_head} onChange={(e) => applyTheme({ font_head: e.target.value })} data-testid="theme-font-head">
            {HEAD_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select></label>
        <label><div className="text-[11px] font-head text-neutral-600 mb-1">Fonte dos textos</div>
          <select className="lm-input" value={theme.font_body} onChange={(e) => applyTheme({ font_body: e.target.value })} data-testid="theme-font-body">
            {BODY_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select></label>
        {THEME_COLORS.filter(([key]) => key !== "card_header_bg" || !theme.card_header_metallic).map(([k, l]) => (
          <label key={k} className="flex items-center gap-3">
            <input type="color" value={theme[k]} onChange={(e) => applyTheme({ [k]: e.target.value })} className="w-12 h-10 border rounded cursor-pointer" data-testid={`theme-${k}`} />
            <span className="text-sm">{l} <span className="font-mono text-xs text-neutral-500">{theme[k]}</span></span>
          </label>
        ))}
      </div>
      <div className="border rounded p-3 mt-3 space-y-3" data-testid="metallic-header-gradient">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(theme.card_header_metallic)}
            onChange={(event) => applyTheme({ card_header_metallic: event.target.checked })}
            data-testid="theme-card-header-metallic"
          />
          Degradê metálico nos cabeçalhos de cartões e tabelas
        </label>
        {theme.card_header_metallic && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {[["card_header_gradient_start", "Cor inicial"], ["card_header_gradient_middle", "Tom metálico intermediário"], ["card_header_gradient_end", "Cor final"]].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(event) => applyTheme({ [key]: event.target.value })}
                    className="w-12 h-10 border rounded cursor-pointer"
                    aria-label={label}
                    data-testid={`theme-${key}`}
                  />
                  <span className="text-sm">{label} <span className="font-mono text-xs text-neutral-500">{theme[key]}</span></span>
                </label>
              ))}
            </div>
            <div
              className="h-10 rounded border"
              style={{
                background: `linear-gradient(115deg, ${theme.card_header_gradient_start} 0%, color-mix(in srgb, ${theme.card_header_gradient_start} 65%, ${theme.card_header_gradient_middle}) 18%, ${theme.card_header_gradient_end} 40%, color-mix(in srgb, ${theme.card_header_gradient_end} 40%, ${theme.card_header_gradient_middle}) 52%, ${theme.card_header_gradient_start} 72%, ${theme.card_header_gradient_end} 100%)`,
              }}
              aria-label="Prévia do degradê metálico"
              data-testid="metallic-header-gradient-preview"
            />
          </>
        )}
      </div>
      <div className="lm-card p-3 mt-3" data-testid="theme-preview">
        <h3 className="text-xl font-bold" style={{ color: "var(--title-color)" }}>Prévia do título</h3>
        <p className="text-sm">Texto de exemplo com a fonte escolhida para o corpo do sistema.</p>
        <button className="lm-btn lm-btn-olive mt-2">Botão principal</button>
      </div>
      <div className="flex gap-2 mt-3">
        <button className="lm-btn lm-btn-olive" onClick={() => onSave(theme)} data-testid="theme-save">Salvar aparência</button>
        <button className="lm-btn lm-btn-outline" onClick={onReset} data-testid="theme-reset">Restaurar padrão</button>
      </div>
    </section>
  );
}

function DashboardSection({ categories, initialPreferences, onSave, onChange }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const itemIds = [
    ...categories.map((category) => dashboardItemId(category.name)),
    ...DASHBOARD_KPIS.map(({ id }) => id),
    "chart",
  ];
  const order = [
    ...preferences.order.filter((id) => itemIds.includes(id)),
    ...itemIds.filter((id) => !preferences.order.includes(id)),
  ];
  const positionableItemIds = itemIds.filter((id) => id !== "chart");
  const gridPositions = getDashboardGridPositions(order, positionableItemIds, preferences.grid_positions);

  useEffect(() => {
    setPreferences(mergeDashboardPreferences(initialPreferences));
  }, [initialPreferences]);

  const update = (patch) => {
    const next = mergeDashboardPreferences({ ...preferences, ...patch });
    setPreferences(next);
    onChange(next);
  };
  const move = (id, offset) => {
    const index = order.indexOf(id);
    const target = index + offset;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    const nextGridPositions = { ...gridPositions };
    if (id !== "chart" && next[target] !== "chart") {
      [nextGridPositions[id], nextGridPositions[next[target]]] = [nextGridPositions[next[target]], nextGridPositions[id]];
    }
    update({ order: next, grid_positions: nextGridPositions });
  };
  const moveToGridPosition = (id, field, value) => {
    const current = gridPositions[id];
    const target = { ...current, [field]: Number(value) };
    const occupant = Object.entries(gridPositions).find(([otherId, position]) =>
      otherId !== id && position.row === target.row && position.column === target.column,
    )?.[0];
    const nextGridPositions = { ...gridPositions, [id]: target };
    if (occupant) nextGridPositions[occupant] = current;
    const nextOrder = [...order].sort((firstId, secondId) => {
      if (firstId === "chart") return 1;
      if (secondId === "chart") return -1;
      const first = nextGridPositions[firstId];
      const second = nextGridPositions[secondId];
      return first.row - second.row || first.column - second.column;
    });
    update({ order: nextOrder, grid_positions: nextGridPositions });
  };

  return (
    <section className="lokal-panel p-4 space-y-4" data-testid="dashboard-customization">
      <div>
        <h2 className="lokal-stencil text-sm mb-1">Personalizar dashboard</h2>
        <p className="text-xs text-neutral-500">Escolha os cartões visíveis, organize a posição na grade e ajuste o gráfico. Em telas menores, a posição se adapta à largura disponível.</p>
      </div>

      <div>
        <h3 className="font-head text-xs mb-2">Cartões e ordem</h3>
        <div className="grid md:grid-cols-2 gap-x-4">
          {order.map((id, index) => (
            <div key={id} className="flex items-center gap-2 border-b py-2">
              <input
                type="checkbox"
                checked={preferences.visibility[id] !== false}
                onChange={(event) => update({
                  visibility: { ...preferences.visibility, [id]: event.target.checked },
                })}
                aria-label={`Mostrar ${dashboardItemLabel(id, categories)}`}
                data-testid={`dashboard-visible-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
              />
              <span className="flex-1 text-sm">{dashboardItemLabel(id, categories)}</span>
              {id !== "chart" && (
                <>
                  <label className="text-xs">
                    Linha
                    <select
                      className="lm-input ml-1 w-16 px-1 py-1"
                      value={gridPositions[id].row}
                      onChange={(event) => moveToGridPosition(id, "row", event.target.value)}
                      aria-label={`Linha de ${dashboardItemLabel(id, categories)}`}
                      data-testid={`dashboard-row-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                    >
                      {Array.from({ length: positionableItemIds.length }, (_, row) => row + 1).map((row) => (
                        <option key={row} value={row}>{row}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Coluna
                    <select
                      className="lm-input ml-1 w-16 px-1 py-1"
                      value={gridPositions[id].column}
                      onChange={(event) => moveToGridPosition(id, "column", event.target.value)}
                      aria-label={`Coluna de ${dashboardItemLabel(id, categories)}`}
                      data-testid={`dashboard-column-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                    >
                      {[1, 2, 3, 4].map((column) => <option key={column} value={column}>{column}</option>)}
                    </select>
                  </label>
                </>
              )}
              <button className="lm-btn lm-btn-outline px-2 py-1" onClick={() => move(id, -1)} disabled={index === 0} aria-label={`Mover ${dashboardItemLabel(id, categories)} para cima`}>↑</button>
              <button className="lm-btn lm-btn-outline px-2 py-1" onClick={() => move(id, 1)} disabled={index === order.length - 1} aria-label={`Mover ${dashboardItemLabel(id, categories)} para baixo`}>↓</button>
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="color"
          value={preferences.colors.card_text}
          onChange={(event) => update({
            card_text_customized: true,
            colors: { ...preferences.colors, card_text: event.target.value },
          })}
          className="w-12 h-10 border rounded cursor-pointer"
          aria-label="Cor do texto dos cartões do Dashboard"
          data-testid="dashboard-card-text-color"
        />
        Cor do texto dos cartões do Dashboard
      </label>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-sm">Tipo de gráfico
          <select className="lm-input mt-1" value={preferences.chart_type} onChange={(event) => update({ chart_type: event.target.value })} data-testid="dashboard-chart-type">
            <option value="linha">Linha</option>
            <option value="barras">Barras</option>
          </select>
        </label>
        <label className="text-sm">Período do gráfico
          <select className="lm-input mt-1" value={preferences.chart_days} onChange={(event) => update({ chart_days: Number(event.target.value) })} data-testid="dashboard-chart-days">
            {[7, 14, 30].map((days) => <option key={days} value={days}>Últimos {days} dias</option>)}
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        <button className="lm-btn lm-btn-olive" onClick={() => onSave(preferences)} data-testid="dashboard-save">Salvar dashboard</button>
        <button className="lm-btn lm-btn-outline" onClick={() => update({
          ...DEFAULT_DASHBOARD_PREFERENCES,
          order: itemIds,
        })} data-testid="dashboard-reset">Restaurar padrão</button>
      </div>
    </section>
  );
}

const STORE_FIELDS = [
  ["store_full_name", "Razão social"], ["cnpj", "CNPJ"], ["address", "Endereço"], ["phone", "Telefone"],
  ["instagram", "Instagram"], ["pix_key", "Chave PIX"], ["print_footer_text", "Rodapé da impressão"],
];

export default function Settings() {
  const { user, bg, applyBg, panel, applyPanel, theme, applyTheme, dashboardPreferences, applyDashboardPreferences } = useAuth();
  const [s, setS] = useState(null);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [nu, setNu] = useState({ name: "", email: "", password: "", role: "visualizador" });
  const [userEdits, setUserEdits] = useState({});
  const [passwordChange, setPasswordChange] = useState({ current_password: "", new_password: "" });
  const [invitations, setInvitations] = useState([]);
  const [currentOrderNumber, setCurrentOrderNumber] = useState("");
  const [inviteDays, setInviteDays] = useState(7);
  const [createdInviteLink, setCreatedInviteLink] = useState("");
  const isAdmin = user?.role === "admin";

  const loadUsers = () => api.get("/auth/users").then((r) => {
    setUsers(r.data);
    setUserEdits(Object.fromEntries(r.data.map((item) => [item.id, {
      email: item.email, role: item.role, password: "",
    }])));
  });
  const loadInvitations = () => api.get("/auth/invitations").then((r) => setInvitations(r.data)).catch((error) => {
    toast.error(error.response?.data?.detail || "Não foi possível carregar os convites");
  });
  useEffect(() => {
    api.get("/settings").then((r) => {
      setS(r.data);
      if (r.data.dashboard_preferences) applyDashboardPreferences(r.data.dashboard_preferences);
    });
    api.get("/categories").then((r) => setCategories(r.data));
    loadUsers();
    if (isAdmin) {
      loadInvitations();
      api.get("/orders/number-sequence").then((r) => {
        setCurrentOrderNumber(String(r.data.current_number));
      }).catch((error) => {
        toast.error(error.response?.data?.detail || "Não foi possível carregar a numeração dos pedidos");
      });
    }
  }, [applyDashboardPreferences, isAdmin]);

  const saveCurrentOrderNumber = async () => {
    const currentNumber = Number(currentOrderNumber);
    if (!Number.isSafeInteger(currentNumber) || currentNumber < 0) {
      toast.error("Informe um número inteiro válido");
      return;
    }
    try {
      const { data } = await api.put("/orders/number-sequence", { current_number: currentNumber });
      setCurrentOrderNumber(String(data.current_number));
      toast.success(`Numeração atualizada. O próximo pedido será o #${data.current_number + 1}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível atualizar a numeração dos pedidos");
    }
  };

  const createInvite = async () => {
    try {
      const { data } = await api.post("/auth/invitations", { expires_in_days: Number(inviteDays) });
      const link = `${window.location.origin}/login?invite=${encodeURIComponent(data.code)}`;
      setCreatedInviteLink(link);
      await loadInvitations();
      toast.success("Convite criado. Copie e envie o link ao novo usuário.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível criar o convite");
    }
  };
  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(createdInviteLink);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar automaticamente; selecione e copie o link.");
    }
  };
  const revokeInvite = async (id) => {
    try {
      await api.delete(`/auth/invitations/${id}`);
      toast.success("Convite revogado");
      loadInvitations();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível revogar o convite");
    }
  };

  const pickColor = async (c) => {
    applyBg(c);
    try {
      await api.put("/settings", { background_color: c });
      toast.success("Fundo atualizado");
    } catch {
      toast.error("Não foi possível salvar a cor de fundo");
    }
  };
  const pickPanel = async (c) => {
    applyPanel(c);
    try {
      await api.put("/settings", { panel_color: c });
      toast.success("Cor das janelas atualizada");
    } catch {
      toast.error("Não foi possível salvar a cor das janelas");
    }
  };
  const saveTheme = async (t) => {
    try {
      await api.put("/settings", { theme: t });
      toast.success("Aparência salva");
    } catch {
      toast.error("Não foi possível salvar a aparência");
    }
  };
  const saveDashboard = async (preferences) => {
    try {
      await api.put("/settings", { dashboard_preferences: preferences });
      applyDashboardPreferences(preferences);
      toast.success("Dashboard salvo");
    } catch {
      toast.error("Não foi possível salvar o dashboard");
    }
  };
  const resetAppearance = async () => {
    applyTheme(DEFAULT_THEME);
    applyBg("#F5F0E6");
    applyPanel("#FBF9F4");
    try {
      await api.put("/settings", {
        theme: DEFAULT_THEME,
        background_color: "#F5F0E6",
        panel_color: "#FBF9F4",
      });
      toast.success("Aparência padrão restaurada");
    } catch {
      toast.error("Não foi possível salvar a aparência padrão");
    }
  };
  const saveStore = async () => { await api.put("/settings", s); toast.success("Dados salvos"); };
  const updateUser = async (id) => {
    const update = userEdits[id];
    try {
      await api.put(`/auth/users/${id}`, {
        email: update.email,
        role: update.role,
        ...(update.password ? { password: update.password } : {}),
      });
      toast.success("Usuário atualizado");
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível atualizar o usuário");
    }
  };
  const changeOwnPassword = async () => {
    try {
      await api.put("/auth/password", passwordChange);
      setPasswordChange({ current_password: "", new_password: "" });
      toast.success("Senha alterada");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível alterar a senha");
    }
  };
  const addUser = async () => {
    try { await api.post("/auth/users", nu); toast.success("Usuário criado"); setNu({ name: "", email: "", password: "", role: "visualizador" }); loadUsers(); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Erro ao criar usuário"); }
  };
  const delUser = async (id) => { if (!window.confirm("Excluir usuário?")) return; await api.delete(`/auth/users/${id}`); loadUsers(); };

  if (!s) return <div className="font-mono">Carregando...</div>;

  return (
    <div className="space-y-5" data-testid="settings-page">
      <div className="lm-page-head"><h1>Configurações</h1><p>Aparência, dados da empresa e usuários</p></div>

      <section className="lokal-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="lokal-stencil text-sm">Cor de fundo do sistema</h2>
          <label className="flex items-center gap-2 text-xs font-mono">
            Personalizada
            <input type="color" value={bg} onChange={(e) => pickColor(e.target.value)} aria-label="Cor personalizada do fundo" />
          </label>
        </div>
        <Swatches colors={COLORS} current={bg} onPick={pickColor} prefix="bg-color" />
      </section>

      <section className="lokal-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="lokal-stencil text-sm">Cor das janelas e balões</h2>
          <label className="flex items-center gap-2 text-xs font-mono">
            Personalizada
            <input type="color" value={panel} onChange={(e) => pickPanel(e.target.value)} aria-label="Cor personalizada das janelas e balões" />
          </label>
        </div>
        <p className="text-xs text-neutral-500 mb-3">Aplica-se a cartões, formulários laterais, janelas, balões e painéis.</p>
        <Swatches colors={PANEL_COLORS} current={panel} onPick={pickPanel} prefix="panel-color" />
      </section>

      <ThemeSection theme={theme} applyTheme={applyTheme} onSave={saveTheme} onReset={resetAppearance} />

      <DashboardSection
        categories={categories}
        initialPreferences={dashboardPreferences}
        onChange={applyDashboardPreferences}
        onSave={saveDashboard}
      />

      {isAdmin && <section className="lokal-panel p-4 space-y-3" data-testid="order-number-settings">
        <div>
          <h2 className="lokal-stencil text-sm mb-1">Numeração dos pedidos</h2>
          <p className="text-xs text-neutral-500">Ajuste o número atual da sequência. O próximo pedido receberá o número informado mais 1. Não é possível usar um número menor que a sequência atual.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-mono">
            Número atual
            <input
              className="block border px-2 py-1.5 text-sm mt-1"
              type="number"
              min={currentOrderNumber || 0}
              step="1"
              value={currentOrderNumber}
              onChange={(event) => setCurrentOrderNumber(event.target.value)}
              aria-label="Número atual dos pedidos"
              data-testid="current-order-number"
            />
          </label>
          <button
            className="lokal-btn-primary"
            onClick={saveCurrentOrderNumber}
            disabled={currentOrderNumber === ""}
            data-testid="save-order-number"
          >
            SALVAR NUMERAÇÃO
          </button>
        </div>
      </section>}

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
        <div className="overflow-x-auto">
        <table className="w-full text-sm table-mono mb-3">
          <thead className="bg-neutral-100 text-[11px]"><tr><th className="p-2 text-left">NOME</th><th className="text-left">LOGIN / E-MAIL</th><th className="text-left">PERFIL</th>{isAdmin && <th className="text-left">NOVA SENHA</th>}<th></th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.name}{u.pending && <span className="block text-[10px] text-amber-700">Aguardando privilégios</span>}</td>
              <td>{isAdmin ? <input className="border px-2 py-1 text-sm min-w-48" type="email" value={userEdits[u.id]?.email || ""}
                onChange={(e) => setUserEdits({ ...userEdits, [u.id]: { ...userEdits[u.id], email: e.target.value } })} aria-label={`Login de ${u.name}`} /> : u.email}</td>
              <td>{isAdmin ? <select className="border px-2 py-1 text-sm" value={userEdits[u.id]?.role || u.role}
                onChange={(e) => setUserEdits({ ...userEdits, [u.id]: { ...userEdits[u.id], role: e.target.value } })} aria-label={`Privilégios de ${u.name}`}>
                <option value="visualizador">Somente visualização</option><option value="vendedor">Vendedor</option><option value="admin">Administrador</option>
              </select> : u.role}</td>
              {isAdmin && <td><input className="border px-2 py-1 text-sm min-w-40" type="password" placeholder="Opcional · mínimo 8"
                value={userEdits[u.id]?.password || ""} onChange={(e) => setUserEdits({ ...userEdits, [u.id]: { ...userEdits[u.id], password: e.target.value } })} aria-label={`Nova senha de ${u.name}`} /></td>}
              <td className="whitespace-nowrap">{isAdmin && <>
                <button className="text-green-800 p-1" onClick={() => updateUser(u.id)} title="Salvar login e privilégios" data-testid={`save-user-${u.id}`}>Salvar</button>
                {u.id !== user.id && <button className="text-red-700 p-1" onClick={() => delUser(u.id)} data-testid={`del-user-${u.email}`}><Trash2 size={13} /></button>}
              </>}</td></tr>
          ))}</tbody>
        </table>
        </div>
        {isAdmin ? (
          <div className="grid md:grid-cols-5 gap-2">
            <input className="border px-2 py-1.5 text-sm" placeholder="Nome" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} data-testid="nu-name" />
            <input className="border px-2 py-1.5 text-sm" placeholder="E-mail" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} data-testid="nu-email" />
            <input className="border px-2 py-1.5 text-sm" type="password" placeholder="Senha" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} data-testid="nu-password" />
            <select className="border px-2 py-1.5 text-sm" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} data-testid="nu-role">
              <option value="visualizador">Somente visualização</option><option value="vendedor">Vendedor</option><option value="admin">Admin</option>
            </select>
            <button className="lokal-btn-primary" onClick={addUser} data-testid="nu-save">ADICIONAR</button>
          </div>
        ) : <div className="text-xs font-mono text-neutral-500">Apenas administradores podem gerenciar usuários.</div>}
      </section>

      {isAdmin && <section className="lokal-panel p-4 space-y-3" data-testid="registration-invitations">
        <div>
          <h2 className="lokal-stencil text-sm mb-1">Convites para cadastro</h2>
          <p className="text-xs text-neutral-500">Cada convite pode ser usado uma única vez. A nova conta começa somente com acesso de visualização.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-mono">Validade</label>
          <select className="border px-2 py-1.5 text-sm" value={inviteDays} onChange={(e) => setInviteDays(Number(e.target.value))} data-testid="invite-expiration">
            {[1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} {days === 1 ? "dia" : "dias"}</option>)}
          </select>
          <button className="lokal-btn-primary" onClick={createInvite} data-testid="create-invite">GERAR CONVITE</button>
        </div>
        {createdInviteLink && <div className="flex flex-col sm:flex-row gap-2">
          <input className="border px-2 py-1.5 text-sm flex-1 min-w-0" value={createdInviteLink} readOnly onFocus={(e) => e.target.select()} aria-label="Link do convite" data-testid="invite-link" />
          <button className="lokal-btn-primary" onClick={copyInviteLink} data-testid="copy-invite">COPIAR LINK</button>
        </div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-mono">
            <thead className="bg-neutral-100 text-[11px]"><tr><th className="p-2 text-left">CRIADO</th><th className="text-left">VALIDADE</th><th className="text-left">STATUS</th><th></th></tr></thead>
            <tbody>{invitations.map((invite) => {
              const expired = new Date(invite.expires_at) <= new Date();
              const status = invite.revoked_at ? "Revogado" : invite.used_at ? "Utilizado" : expired ? "Expirado" : invite.claimed_at ? "Cadastro em andamento" : "Ativo";
              return <tr key={invite.id} className="border-t">
                <td className="p-2">{new Date(invite.created_at).toLocaleString("pt-BR")}</td>
                <td>{new Date(invite.expires_at).toLocaleString("pt-BR")}</td>
                <td>{status}</td>
                <td className="text-right">{!invite.used_at && !invite.revoked_at && !expired && <button className="text-red-700 p-1" onClick={() => revokeInvite(invite.id)} data-testid={`revoke-invite-${invite.id}`}>Revogar</button>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>}

      <section className="lokal-panel p-4">
        <h2 className="lokal-stencil text-sm mb-3">Alterar minha senha</h2>
        <div className="grid md:grid-cols-3 gap-2">
          <input className="border px-2 py-1.5 text-sm" type="password" placeholder="Senha atual" value={passwordChange.current_password}
            onChange={(e) => setPasswordChange({ ...passwordChange, current_password: e.target.value })} data-testid="current-password" />
          <input className="border px-2 py-1.5 text-sm" type="password" placeholder="Nova senha · mínimo 8 caracteres" minLength={8} value={passwordChange.new_password}
            onChange={(e) => setPasswordChange({ ...passwordChange, new_password: e.target.value })} data-testid="new-password" />
          <button className="lokal-btn-primary" onClick={changeOwnPassword} disabled={!passwordChange.current_password || passwordChange.new_password.length < 8} data-testid="change-password">ALTERAR SENHA</button>
        </div>
      </section>
    </div>
  );
}
