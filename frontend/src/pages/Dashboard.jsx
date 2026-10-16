import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatBRL } from "@/lib/api";
import { Shirt, Footprints, Package, Award, ClipboardList, Clock, Users, CircleDollarSign, AlertTriangle, Scissors, Car, Shield, Star } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";

const ICONS = { Shirt, Footprints, Package, Award, Shield, Star };
const UNIT = { "Fardamento": "peças", "Calçados": "pares" };

const CategoryCard = ({ cat, onClick }) => {
  const Icon = ICONS[cat.icon] || Package;
  return (
    <button onClick={onClick} className="lokal-tile text-left overflow-hidden" data-testid={`card-cat-${cat.name}`}>
      <div className="lm-card-head"><span className="text-[15px]">{cat.name}</span><Icon size={18} color="var(--gold)" /></div>
      <div className="px-4 py-3">
        <div className="flex items-baseline gap-2"><span className="font-head text-3xl font-bold">{Math.round(cat.qty)}</span><span className="text-sm text-neutral-600">{UNIT[cat.name] || "unid"}</span></div>
        <div className="text-sm text-neutral-600">Valor: <b className="text-neutral-900">{formatBRL(cat.value)}</b></div>
      </div>
    </button>
  );
};

const Kpi = ({ icon: Icon, color, label, value, sub, onClick, testid }) => (
  <button onClick={onClick} className="lokal-tile p-4 flex items-center gap-4 text-left" data-testid={testid}>
    <div className="lm-icon-sq" style={{ background: color }}><Icon size={20} /></div>
    <div className="min-w-0">
      <div className="font-head text-[12px] text-neutral-700">{label}</div>
      <div className="font-head text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs text-neutral-500 truncate">{sub}</div>}
    </div>
  </button>
);

export default function Dashboard() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [mode, setMode] = useState("linha");

  useEffect(() => {
    Promise.all([api.get("/dashboard"), api.get("/categories")]).then(([d, c]) => { setData(d.data); setCats(c.data); });
  }, []);

  if (!data) return <div className="font-mono">Carregando operação...</div>;

  const tiles = Object.entries(data.totals_by_cat).map(([name, v]) => ({ name, ...v, icon: cats.find((c) => c.name === name)?.icon }));
  const chartData = data.chart.map((d) => ({ label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7), vendas: d.value }));

  return (
    <div className="space-y-4" data-testid="dashboard-page">
      <div className="lm-page-head"><h1>Dashboard</h1><p>Visão geral da operação · {new Date().toLocaleDateString("pt-BR")}</p></div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => <CategoryCard key={t.name} cat={t} onClick={() => nav(`/estoque?cat=${encodeURIComponent(t.name)}`)} />)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={ClipboardList} color="var(--olive)" label="Pedidos hoje" value={data.orders_today} sub={formatBRL(data.orders_today_total)} onClick={() => nav("/pedidos")} testid="kpi-orders-today" />
        <Kpi icon={Clock} color="var(--gold)" label="Pedidos pendentes" value={data.pending} sub="Orçamento / Aprovado / Separado" onClick={() => nav("/pedidos")} testid="kpi-pending" />
        <Kpi icon={Users} color="#111" label="Clientes" value={data.customers} onClick={() => nav("/clientes")} testid="kpi-customers" />
        <Kpi icon={CircleDollarSign} color="var(--gold)" label="Comissão do mês" value={formatBRL(data.commission_month)} onClick={() => nav("/comissoes")} testid="kpi-commission" />
        <Kpi icon={AlertTriangle} color="#D93636" label="Estoque baixo" value={data.low_stock.length} sub="tamanhos no mínimo" onClick={() => nav("/estoque?low=1")} testid="kpi-low-stock" />
        <Kpi icon={Scissors} color="var(--olive)" label="Gastos insumos (mês)" value={formatBRL(data.insumos_month)} onClick={() => nav("/insumos")} testid="kpi-insumos" />
        <Kpi icon={Car} color="#111" label="Manutenção veículo" value={formatBRL(data.manut_month)} sub={data.manut_alerts ? `${data.manut_alerts} revisão(ões) próxima(s)` : "Sem alertas"} onClick={() => nav("/manutencao")} testid="kpi-manutencao" />
      </div>

      <section className="lm-card overflow-hidden">
        <div className="lm-card-head">
          <span>Vendas · últimos 7 dias</span>
          <div className="lm-seg" style={{ background: "#222" }}>
            {[["linha", "Linha"], ["barras", "Barras"]].map(([k, l]) => (
              <button key={k} className={mode === k ? "on" : "text-neutral-300"} onClick={() => setMode(k)} data-testid={`chart-mode-${k}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="h-64 p-3">
          <ResponsiveContainer width="100%" height="100%">
            {mode === "linha" ? (
              <LineChart data={chartData}>
                <CartesianGrid stroke="#e6dfcf" strokeDasharray="3 3" />
                <XAxis dataKey="label" style={{ fontSize: 12 }} /><YAxis style={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatBRL(v)} />
                <Line type="monotone" dataKey="vendas" stroke="var(--olive)" strokeWidth={2.5} dot={{ fill: "var(--gold)" }} />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid stroke="#e6dfcf" strokeDasharray="3 3" />
                <XAxis dataKey="label" style={{ fontSize: 12 }} /><YAxis style={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatBRL(v)} />
                <Bar dataKey="vendas" fill="var(--olive)" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
