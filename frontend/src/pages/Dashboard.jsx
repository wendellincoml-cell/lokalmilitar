import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatBRL } from "@/lib/api";
import { Shirt, Footprints, Package, Award, ShoppingCart, Users, DollarSign, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CAT_ICONS = { "Fardamento": Shirt, "Calçados": Footprints, "Acessórios": Package, "Insígnias": Award, "Brevês": Award, "Tático": Package };

export default function Dashboard() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [chartMode, setChartMode] = useState("vendas");

  const load = () => api.get("/dashboard").then(r=>setData(r.data));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="font-mono">Carregando operação...</div>;

  const chartData = data.chart.map(d => ({
    label: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    vendas: d.value,
  }));

  const tiles = Object.entries(data.totals_by_cat).map(([name, v]) => ({ name, ...v }));

  return (
    <div className="space-y-5" data-testid="dashboard-page">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="lokal-stencil text-2xl md:text-3xl">Dashboard</h1>
          <p className="font-mono text-xs text-neutral-500 mt-1">PAINEL OPERACIONAL · {new Date().toLocaleDateString("pt-BR")}</p>
        </div>
      </header>

      {/* 4 categoria cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.slice(0, 8).map((t) => {
          const Icon = CAT_ICONS[t.name] || Package;
          return (
            <button key={t.name} onClick={()=>nav(`/estoque?cat=${encodeURIComponent(t.name)}`)}
              className="lokal-tile p-4 text-left" data-testid={`card-cat-${t.name}`}>
              <div className="flex items-center justify-between">
                <Icon size={22} color="#4B5320"/>
                <span className="font-mono text-[10px] text-neutral-500">CATEGORIA</span>
              </div>
              <div className="mt-3 font-head text-lg">{t.name}</div>
              <div className="font-mono text-2xl font-bold mt-1">{Math.round(t.qty)}</div>
              <div className="font-mono text-[11px] text-neutral-500">{formatBRL(t.value)}</div>
            </button>
          );
        })}
        {tiles.length === 0 && (
          <div className="col-span-full text-sm font-mono text-neutral-500 border border-dashed p-6 text-center">
            Nenhum produto cadastrado ainda. Cadastre produtos para ver métricas por categoria.
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI onClick={()=>nav("/pedidos")} icon={ShoppingCart} label="Pedidos Hoje" value={data.orders_today} testid="kpi-orders-today"/>
        <KPI onClick={()=>nav("/pedidos")} icon={ShoppingCart} label="Pendentes" value={data.pending} testid="kpi-pending"/>
        <KPI onClick={()=>nav("/clientes")} icon={Users} label="Clientes" value={data.customers} testid="kpi-customers"/>
        <KPI onClick={()=>nav("/comissoes")} icon={DollarSign} label="Comissão do Mês" value={formatBRL(data.commission_month)} testid="kpi-commission"/>
        <KPI onClick={()=>nav("/insumos")} icon={TrendingDown} label="Gastos do Mês" value={formatBRL(data.expenses_month)} testid="kpi-expenses"/>
      </div>

      {/* Chart */}
      <section className="lokal-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="lokal-stencil text-base">Movimento · Últimos 7 dias</h2>
          <Select value={chartMode} onValueChange={setChartMode}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="chart-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vendas">Vendas</SelectItem>
              <SelectItem value="barras">Vendas (Barras)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === "vendas" ? (
              <LineChart data={chartData}>
                <CartesianGrid stroke="#eee" strokeDasharray="3 3"/>
                <XAxis dataKey="label" style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}/>
                <YAxis style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}/>
                <Tooltip formatter={(v)=>formatBRL(v)}/>
                <Line type="monotone" dataKey="vendas" stroke="#4B5320" strokeWidth={2} dot={{ fill: "#B8860B" }}/>
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid stroke="#eee" strokeDasharray="3 3"/>
                <XAxis dataKey="label" style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}/>
                <YAxis style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}/>
                <Tooltip formatter={(v)=>formatBRL(v)}/>
                <Bar dataKey="vendas" fill="#4B5320"/>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      {/* Low stock */}
      <section className="lokal-panel p-4">
        <h2 className="lokal-stencil text-base mb-2">Estoque Baixo</h2>
        {data.low_stock.length === 0 ? (
          <div className="font-mono text-xs text-neutral-500">Nenhum produto abaixo do mínimo. Operação em ordem.</div>
        ) : (
          <table className="w-full text-sm table-mono">
            <thead><tr className="text-left text-[11px] text-neutral-500 border-b">
              <th className="py-1">PRODUTO</th><th>SKU</th><th>TAM</th><th>ESTOQUE</th><th>MÍNIMO</th>
            </tr></thead>
            <tbody>
              {data.low_stock.map((l, i) => (
                <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                    onClick={()=>nav(`/produtos?edit=${l.id}`)}>
                  <td className="py-1">{l.name}</td><td>{l.sku}</td><td>{l.size}</td>
                  <td className="text-red-700">{l.stock}</td><td>{l.stock_min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function KPI({ icon:Icon, label, value, onClick, testid }) {
  return (
    <button onClick={onClick} className="lokal-tile p-4 text-left" data-testid={testid}>
      <div className="flex items-center justify-between">
        <Icon size={18} color="#B8860B"/>
        <span className="font-mono text-[10px] text-neutral-500">INDICADOR</span>
      </div>
      <div className="font-mono text-[11px] text-neutral-500 mt-2">{label}</div>
      <div className="font-mono text-xl font-bold mt-1">{value}</div>
    </button>
  );
}
