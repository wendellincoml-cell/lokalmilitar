import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatBRL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Shirt, Footprints, Package, Award, ClipboardList, Clock, Users, CircleDollarSign, AlertTriangle, Scissors, Car, Shield, Star, ClipboardCheck, Printer } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { DASHBOARD_KPIS } from "@/pages/dashboardPreferences";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const printDayClosure = (report) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  const table = (headers, rows) => `
    <table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">Sem movimentações</td></tr>`}</tbody></table>`;
  const orderRows = report.orders.map((order) => [
    `#${order.number}`, order.type, order.customer_name, order.status, formatBRL(order.total || 0),
  ]);
  const stockRows = report.stock_movements.map((movement) => [
    movement.kind, movement.product_name, movement.size, movement.qty, movement.nf || movement.reason || "",
  ]);
  const expenseRows = report.expenses.map((expense) => [
    expense.type, expense.description, formatBRL(Number(expense.amount || 0) + Number(expense.fuel_cost || 0) + Number(expense.toll_cost || 0)),
  ]);

  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fechamento do dia ${escapeHtml(report.date)}</title>
    <style>body{font:12px Arial,sans-serif;padding:24px;color:#222}h1,h2{color:#354017}h1{font-size:20px}h2{font-size:15px;margin-top:26px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #aaa;padding:6px;text-align:left}th{background:#eee}.summary{display:flex;gap:24px;padding:12px 0}.summary div{padding:8px;border:1px solid #aaa}</style>
    </head><body><h1>LOKAL MILITAR — Fechamento do dia ${escapeHtml(report.date.split("-").reverse().join("/"))}</h1>
    <p>Registrado em ${escapeHtml(new Date(report.closed_at).toLocaleString("pt-BR"))} por ${escapeHtml(report.closed_by)}</p>
    <div class="summary"><div>Pedidos: ${report.summary.orders_count} · ${formatBRL(report.summary.orders_total)}</div><div>Movimentações de estoque: ${report.summary.stock_movements_count}</div><div>Despesas: ${report.summary.expenses_count} · ${formatBRL(report.summary.expenses_total)}</div></div>
    <h2>Pedidos, vendas, trocas e devoluções</h2>${table(["Pedido", "Tipo", "Cliente", "Status", "Total"], orderRows)}
    <h2>Movimentações de estoque</h2>${table(["Tipo", "Produto", "Tamanho", "Qtd.", "NF / Motivo"], stockRows)}
    <h2>Despesas, insumos e viagens</h2>${table(["Tipo", "Descrição", "Valor"], expenseRows)}
    </body></html>`);
  printWindow.document.close();
  printWindow.setTimeout(() => printWindow.print(), 500);
  return true;
};

export default function Dashboard() {
  const nav = useNavigate();
  const { dashboardPreferences, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState("");
  const [closingDay, setClosingDay] = useState(false);
  const [closureReport, setClosureReport] = useState(null);
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

  const closeDay = async () => {
    setClosingDay(true);
    try {
      const { data: report } = await api.post("/dashboard/close-day");
      setClosureReport(report);
    } catch (closeError) {
      toast.error(closeError.response?.data?.detail || "Não foi possível finalizar o dia");
    } finally {
      setClosingDay(false);
    }
  };

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
      <div className="lm-page-head flex items-end justify-between gap-3 flex-wrap">
        <div><h1 style={{ color: "var(--title-color)" }}>Dashboard</h1><p>Visão geral da operação · {new Date().toLocaleDateString("pt-BR")}</p></div>
        {isAdmin && (
          <button className="lm-btn lm-btn-olive" onClick={closeDay} disabled={closingDay} data-testid="close-day">
            <ClipboardCheck size={16} />{closingDay ? "FINALIZANDO..." : "FINALIZAR DIA"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayOrder.filter((id) => visibility[id] !== false).map(renderItem)}
      </div>
      <Dialog open={!!closureReport} onOpenChange={(isOpen) => !isOpen && setClosureReport(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="day-closure-report">
          <DialogHeader>
            <DialogTitle className="font-head">Fechamento do dia {closureReport?.date.split("-").reverse().join("/")}</DialogTitle>
          </DialogHeader>
          {closureReport && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-neutral-600">
                  {closureReport.already_closed ? "Relatório do dia já finalizado" : "Dia finalizado"}
                  {" · "}{new Date(closureReport.closed_at).toLocaleString("pt-BR")} · {closureReport.closed_by}
                </p>
                <button className="lm-btn lm-btn-dark" onClick={() => {
                  if (!printDayClosure(closureReport)) toast.error("Permita pop-ups para imprimir o relatório");
                }} data-testid="print-day-closure"><Printer size={15} />Imprimir relatório</button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3" data-testid="day-closure-summary">
                <div className="lokal-panel p-3"><div className="font-head text-xs">Pedidos no relatório</div><div className="text-xl font-bold">{closureReport.summary.orders_count}</div><div>{formatBRL(closureReport.summary.orders_total)}</div></div>
                <div className="lokal-panel p-3"><div className="font-head text-xs">Movimentações de estoque</div><div className="text-xl font-bold">{closureReport.summary.stock_movements_count}</div></div>
                <div className="lokal-panel p-3"><div className="font-head text-xs">Despesas / viagens</div><div className="text-xl font-bold">{closureReport.summary.expenses_count}</div><div>{formatBRL(closureReport.summary.expenses_total)}</div></div>
              </div>
              <section>
                <h3 className="font-head mb-2">Pedidos, vendas, trocas e devoluções</h3>
                <div className="lm-table-wrap overflow-x-auto"><table className="lm-table">
                  <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente</th><th>Status</th><th>Total</th></tr></thead>
                  <tbody>{closureReport.orders.map((order) => <tr key={order.id}><td>#{order.number}</td><td>{order.type}</td><td>{order.customer_name}</td><td>{order.status}</td><td>{formatBRL(order.total || 0)}</td></tr>)}
                    {closureReport.orders.length === 0 && <tr><td colSpan={5} className="text-center py-3">Sem pedidos no dia.</td></tr>}</tbody>
                </table></div>
              </section>
              <section>
                <h3 className="font-head mb-2">Movimentações de estoque</h3>
                <div className="lm-table-wrap overflow-x-auto"><table className="lm-table">
                  <thead><tr><th>Tipo</th><th>Produto</th><th>Tamanho</th><th>Qtd.</th><th>NF / Motivo</th></tr></thead>
                  <tbody>{closureReport.stock_movements.map((movement) => <tr key={movement.id}><td>{movement.kind}</td><td>{movement.product_name}</td><td>{movement.size}</td><td>{movement.qty}</td><td>{movement.nf || movement.reason}</td></tr>)}
                    {closureReport.stock_movements.length === 0 && <tr><td colSpan={5} className="text-center py-3">Sem movimentações de estoque no dia.</td></tr>}</tbody>
                </table></div>
              </section>
              <section>
                <h3 className="font-head mb-2">Despesas, insumos e viagens</h3>
                <div className="lm-table-wrap overflow-x-auto"><table className="lm-table">
                  <thead><tr><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead>
                  <tbody>{closureReport.expenses.map((expense) => <tr key={expense.id}><td>{expense.type}</td><td>{expense.description}</td><td>{formatBRL(Number(expense.amount || 0) + Number(expense.fuel_cost || 0) + Number(expense.toll_cost || 0))}</td></tr>)}
                    {closureReport.expenses.length === 0 && <tr><td colSpan={3} className="text-center py-3">Sem despesas no dia.</td></tr>}</tbody>
                </table></div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
