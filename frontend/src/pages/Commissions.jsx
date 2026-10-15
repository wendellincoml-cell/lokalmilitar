import React, { useEffect, useMemo, useState } from "react";
import { api, formatBRL, formatDateShort } from "@/lib/api";
import { toast } from "sonner";

export default function Commissions() {
  const [rows, setRows] = useState([]);
  const [vendor, setVendor] = useState("ALL");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = () => api.get("/commissions").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const vendors = useMemo(() => [...new Set(rows.map((r) => r.vendor_name).filter(Boolean))], [rows]);
  const shown = rows.filter((r) => (vendor === "ALL" || r.vendor_name === vendor) && (!month || (r.created_at || "").startsWith(month)));
  const pending = shown.filter((r) => !r.paid);

  const pay = async () => {
    if (!pending.length) return;
    await api.post("/commissions/mark_paid", { ids: pending.map((r) => r.id) });
    toast.success("Comissões marcadas como pagas"); load();
  };

  return (
    <div data-testid="commissions-page">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="lokal-stencil text-2xl">Comissões</h1>
          <p className="font-mono text-xs text-neutral-500">R$ 1,00 por item vendido (pedidos Aprovados/Entregues)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border px-2 py-1.5 text-sm rounded-sm" data-testid="com-month" />
          <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="border px-2 py-1.5 text-sm rounded-sm" data-testid="com-vendor">
            <option value="ALL">Todos vendedores</option>
            {vendors.map((v) => <option key={v}>{v}</option>)}
          </select>
          <button className="lokal-btn-primary" onClick={pay} data-testid="com-pay">MARCAR PAGAS ({pending.length})</button>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Box label="Itens" value={shown.reduce((s, r) => s + r.items_count, 0)} />
        <Box label="Total" value={formatBRL(shown.reduce((s, r) => s + r.amount, 0))} />
        <Box label="A pagar" value={formatBRL(pending.reduce((s, r) => s + r.amount, 0))} />
      </div>
      <div className="lokal-panel overflow-x-auto">
        <table className="w-full text-sm table-mono">
          <thead className="bg-neutral-100 text-[11px]"><tr>
            <th className="p-2 text-left">DATA</th><th className="text-left">PEDIDO</th><th className="text-left">VENDEDOR</th><th>ITENS</th><th>VALOR</th><th>STATUS</th>
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{formatDateShort(r.created_at)}</td><td>#{r.order_number}</td><td>{r.vendor_name}</td>
                <td className="text-center">{r.items_count}</td><td className="text-center">{formatBRL(r.amount)}</td>
                <td className="text-center"><span className={`text-[10px] px-2 py-0.5 ${r.paid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{r.paid ? "PAGA" : "PENDENTE"}</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-xs text-neutral-500">Sem comissões no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Box = ({ label, value }) => (
  <div className="lokal-tile p-3" data-testid={`com-box-${label}`}>
    <div className="font-mono text-[11px] text-neutral-500">{label}</div>
    <div className="font-mono text-xl font-bold">{value}</div>
  </div>
);
