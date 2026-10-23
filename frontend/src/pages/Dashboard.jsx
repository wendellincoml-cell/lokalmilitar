import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatBRL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Shirt, Footprints, Package, Award, ClipboardList, Clock, Users, CircleDollarSign, AlertTriangle, Scissors, Car, Shield, Star } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { DASHBOARD_KPIS } from "@/pages/dashboardPreferences";

const ICONS = { Shirt, Footprints, Package, Award, Shield, Star };
const UNIT = { "Fardamento": "peças", "Calçados": "pares" };

const DashboardCardHeader = ({ children, icon: Icon, iconColor }) => (
  <div className="lm-card-head" style={{ background: "var(--card-header-background)", color: "var(--card-header-text)" }}>
    <span className="text-[15px]">{children}</span>
    {Icon && <Icon size={18} color={iconColor} />}
  </div>
);

const CategoryCard = ({ cat, onClick, colors }) => {
  const Icon = ICONS[cat.icon] || Package;
  return (
    <button onClick={onClick} className="lokal-tile text-left overflow-hidden" style={{ background: colors.card_background, color: colors.card_text, borderColor: colors.card_border }} data-testid={`card-cat-${cat.name}`}>
      <DashboardCardHeader icon={Icon} iconColor={colors.chart_accent}>{cat.name}</DashboardCardHeader>
      <div className="px-4 py-3">
        <div className="flex items-baseline gap-2"><span className="font-head text-3xl font-bold">{Math.round(cat.qty)}</span><span className="text-sm" style={{ color: "var(--muted-text-color)" }}>{UNIT[cat.name] || "unid"}</span></div>
        <div className="text-sm" style={{ color: "var(--muted-text-color)" }}>Valor: <b style={{ color: "var(--system-text-color)" }}>{formatBRL(cat.value)}</b></div>
      </div>
    </button>
  );
};

const Kpi = ({ icon: Icon, label, value, sub, onClick, testid, colors }) => (
  <button onClick={onClick} className="lokal-tile text-left overflow-hidden" style={{ background: colors.card_background, color: colors.card_text, borderColor: colors.card_border }} data-testid={testid}>
    <DashboardCardHeader icon={Icon} iconColor={colors.chart_accent}>{label}</DashboardCardHeader>
    <div className="px-4 py-3">
      <div className="font-head text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-sm truncate" style={{ color: "var(--muted-text-color)" }}>{sub}</div>}
    </div>
  </button>
);

export default function Dashboard() {
  const nav = useNavigate();
  const { dashboardPreferences } = useAuth();
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState("");
  const { chart_days: chartDays, chart_type: chartType, order, visibility } = dashboardPreferences;
  const colors = {
    background: "transparent",
    card_background: "var(--panel-bg)",
    card_text: "var(--system-text-color)",
    card_border: "var(--line)",
    chart_line: "var(--olive)",
    chart_accent: "var(--gold)",
    chart_grid: "var(--line)",
  };

  useEffect(() => {
    setError("");
    Promise.all([api.get("/dashboard", { params: { days: chartDays } }), api.get("/categories")])
      .then(([d, c]) => { setData(d.data); setCats(c.data); })
      .catch(() => setError("Não foi possível carregar os dados do dashboard."));
  }, [chartDays]);

  if (error) return <div className="font-mono" role="alert">{error}</div>;
  if (!data) return <div className="font-mono">Carregando operação...</div>;

  const tiles = Object.entries(data.totals_by_cat).map(([name, v]) => ({ name, ...v, icon: cats.find((c) => c.name === name)?.icon }));
  const chartData = data.chart.map((d) => ({ label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7), vendas: d.value }));
  const kpis = {
    orders_today: { icon: ClipboardList, label: "Pedidos hoje", value: data.orders_today, sub: formatBRL(data.orders_today_total), onClick: () => nav("/pedidos"), testid: "kpi-orders-today" },
    pending: { icon: Clock, label: "Pedidos pendentes", value: data.pending, sub: "Orçamento / Aprovado / Separado", onClick: () => nav("/pedidos"), testid: "kpi-pending" },
    customers: { icon: Users, label: "Clientes", value: data.customers, onClick: () => nav("/clientes"), testid: "kpi-customers" },
    commission_month: { icon: CircleDollarSign, label: "Comissão do mês", value: formatBRL(data.commission_month), onClick: () => nav("/comissoes"), testid: "kpi-commission" },
    low_stock: { icon: AlertTriangle, label: "Estoque baixo", value: data.low_stock.length, sub: "tamanhos no mínimo", onClick: () => nav("/estoque?low=1"), testid: "kpi-low-stock" },
    insumos: { icon: Scissors, label: "Gastos insumos (mês)", value: formatBRL(data.insumos_month), onClick: () => nav("/insumos"), testid: "kpi-insumos" },
    maintenance: { icon: Car, label: "Manutenção veículo", value: formatBRL(data.manut_month), sub: data.manut_alerts ? `${data.manut_alerts} revisão(ões) próxima(s)` : "Sem alertas", onClick: () => nav("/manutencao"), testid: "kpi-manutencao" },
  };
  const available = [
    ...tiles.map((tile) => `category:${tile.name}`),
    ...DASHBOARD_KPIS.map(({ id }) => id),
    "chart",
  ];
  const displayOrder = [...order.filter((id) => available.includes(id)), ...available.filter((id) => !order.includes(id))];
  const renderItem = (id) => {
    if (id.startsWith("category:")) {
      const categoryName = id.slice("category:".length);
      const tile = tiles.find((item) => item.name === categoryName);
      return tile && <CategoryCard key={id} cat={tile} colors={colors} onClick={() => nav(`/estoque?cat=${encodeURIComponent(tile.name)}`)} />;
    }
    if (id === "chart") {
      return (
        <section key={id} className="lm-card overflow-hidden col-span-full" style={{ background: colors.card_background, color: colors.card_text, borderColor: colors.card_border }}>
          <DashboardCardHeader>Vendas · últimos {chartDays} dias</DashboardCardHeader>
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "linha" ? (
                <LineChart data={chartData}>
                  <CartesianGrid stroke={colors.chart_grid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-text-color)" }} style={{ fontSize: 12 }} /><YAxis tick={{ fill: "var(--muted-text-color)" }} style={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatBRL(v)} contentStyle={{ background: colors.card_background, color: colors.card_text, borderColor: colors.card_border }} />
                  <Line type="monotone" dataKey="vendas" stroke={colors.chart_line} strokeWidth={2.5} dot={{ fill: colors.chart_accent }} />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid stroke={colors.chart_grid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-text-color)" }} style={{ fontSize: 12 }} /><YAxis tick={{ fill: "var(--muted-text-color)" }} style={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatBRL(v)} contentStyle={{ background: colors.card_background, color: colors.card_text, borderColor: colors.card_border }} />
                  <Bar dataKey="vendas" fill={colors.chart_line} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </section>
      );
    }
    const kpi = kpis[id];
    if (!kpi) return null;
    return <Kpi key={id} {...kpi} colors={colors} />;
  };

  return (
    <div className="space-y-4" style={{ color: colors.card_text }} data-testid="dashboard-page">
      <div className="lm-page-head"><h1 style={{ color: "var(--title-color)" }}>Dashboard</h1><p>Visão geral da operação · {new Date().toLocaleDateString("pt-BR")}</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayOrder.filter((id) => visibility[id] !== false).map(renderItem)}
      </div>
    </div>
  );
}
