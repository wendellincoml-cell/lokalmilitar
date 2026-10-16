import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatBRL, formatDate } from "@/lib/api";
import { toast } from "sonner";
import { Download, Upload, Printer, FileText, FileSpreadsheet, Search, Trash2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KIND_STYLE = {
  ENTRADA: "bg-green-100 text-green-800", SAIDA: "bg-red-100 text-red-800", AVARIA: "bg-red-200 text-red-900",
  DESMONTAGEM_SAIDA: "bg-amber-100 text-amber-800", DESMONTAGEM_ENTRADA: "bg-lime-100 text-lime-800",
};
const KIND_LABEL = { DESMONTAGEM_SAIDA: "Desmont. (−)", DESMONTAGEM_ENTRADA: "Desmont. (+)" };
const BLANK = { product_id: "", size: "", qty: 1, nf: "", reason: "", kind: "ENTRADA" };

const openPrint = (title, rows, totals) => {
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;padding:20px}h1{font-size:18px;margin:0 0 4px;color:#4B5320}
    table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#111;color:#D9C9A0;text-align:left}
    th,td{border:1px solid #444;padding:4px 6px;font-size:11px}.tot{text-align:right;font-weight:700;margin-top:8px}</style></head><body>
    <h1>LOKAL MILITAR — ${title}</h1><div style="font-size:11px">Emitido em ${new Date().toLocaleString("pt-BR")}</div>
    <table><thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Tamanho</th><th>Qtd</th><th>Custo</th><th>Venda</th><th>Local</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${r.sku || ""}</td><td>${r.name}</td><td>${r.cat}</td><td>${r.size}</td><td>${r.stock}</td><td>${formatBRL(r.cost)}</td><td>${formatBRL(r.price)}</td><td>${r.shelf || ""}</td></tr>`).join("")}</tbody></table>
    <div class="tot">Total de itens: ${totals.items} · Valor em estoque (venda): ${formatBRL(totals.value)}</div>
    <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
};

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [params] = useSearchParams();
  const [tab, setTab] = useState("posicao");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(params.get("cat") || "");
  const [onlyLow, setOnlyLow] = useState(params.get("low") === "1");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);

  const load = async () => {
    const [p, m, c, o] = await Promise.all([api.get("/products"), api.get("/stock_movements"), api.get("/categories"), api.get("/orders")]);
    setProducts(p.data); setMovements(m.data); setCategories(c.data); setOrders(o.data);
  };
  useEffect(() => { load(); }, []);

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const allRows = useMemo(() => products.flatMap((p) => (p.sizes || []).map((s) => ({
    id: p.id + s.size, sku: p.sku, name: p.name, cat: catMap[p.category_id] || "-", size: s.size, stock: Number(s.stock || 0),
    min: Number(s.stock_min || 0), cost: p.cost, price: p.price, shelf: p.shelf,
  }))), [products, catMap]);
  const rows = allRows.filter((r) => (!cat || r.cat === cat) && (!onlyLow || (r.min > 0 && r.stock <= r.min))
    && (!q || (r.name + r.sku + r.size).toLowerCase().includes(q.toLowerCase())));
  const totals = (list) => ({ items: list.reduce((s, r) => s + r.stock, 0), value: list.reduce((s, r) => s + r.stock * Number(r.price || 0), 0) });
  const all = totals(allRows);

  const printBy = (byCat) => {
    if (byCat && !cat) return toast.error("Selecione uma categoria no filtro");
    const list = byCat ? allRows.filter((r) => r.cat === cat) : allRows;
    openPrint(byCat ? `Estoque · ${cat}` : "Estoque completo", list, totals(list));
  };
  const exportExcel = () => {
    const head = ["SKU", "Produto", "Categoria", "Tamanho", "Qtd", "Custo", "Venda", "Local"];
    const csv = [head, ...rows.map((r) => [r.sku, r.name, r.cat, r.size, r.stock, r.cost, r.price, r.shelf || ""])]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv" })); a.download = "estoque-lokal-militar.csv"; a.click();
  };

  const product = products.find((p) => p.id === form.product_id);
  const submit = async () => {
    if (!form.product_id || !form.size || !form.qty) return toast.error("Produto, tamanho e quantidade são obrigatórios");
    await api.post("/stock_movements", { ...form, product_name: product?.name, sku: product?.sku });
    toast.success(form.kind === "ENTRADA" ? "Entrada registrada" : "Saída registrada");
    setModal(null); setForm(BLANK); load();
  };
  const delMov = async (id) => {
    if (!window.confirm("Excluir o registro e estornar sua quantidade no estoque?")) return;
    try {
      await api.delete(`/stock_movements/${id}`);
      toast.success("Registro excluído e estoque atualizado");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível excluir o registro");
    }
  };
  const printOrder = (orderId) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return toast.error("Pedido relacionado não encontrado");
    window.open(`/pedidos?printOrder=${encodeURIComponent(orderId)}`, "_blank", "noopener,noreferrer");
  };
  const movs = movements.filter((m) => !q || (m.product_name + (m.reason || "") + (m.sku || "")).toLowerCase().includes(q.toLowerCase()));

  return (
    <div data-testid="stock-page">
      <div className="lm-page-head flex items-end justify-between gap-3 flex-wrap">
        <div><h1>Estoque — Entrada / Saída</h1><p>{all.items} itens · {formatBRL(all.value)} em valor de venda</p></div>
        <div className="flex gap-2">
          <button className="lm-btn lm-btn-olive" onClick={() => { setForm({ ...BLANK, kind: "ENTRADA" }); setModal("in"); }} data-testid="btn-entry"><Download size={16} />Entrada (NF)</button>
          <button className="lm-btn lm-btn-red" onClick={() => { setForm({ ...BLANK, kind: "SAIDA" }); setModal("out"); }} data-testid="btn-exit"><Upload size={16} />Saída / Avaria</button>
        </div>
      </div>

      <div className="lm-card p-3 flex flex-wrap gap-2 mb-4">
        <button className="lm-btn lm-btn-dark" onClick={() => printBy(false)} data-testid="btn-print-full"><Printer size={15} />Imprimir estoque completo A4</button>
        <button className="lm-btn lm-btn-dark" onClick={() => printBy(true)} data-testid="btn-print-cat"><Printer size={15} />Imprimir estoque por categoria</button>
        <button className="lm-btn lm-btn-gold" onClick={() => openPrint("Estoque", rows, totals(rows))} data-testid="btn-export-pdf"><FileText size={15} />Exportar PDF</button>
        <button className="lm-btn lm-btn-outline" onClick={exportExcel} data-testid="btn-export-excel"><FileSpreadsheet size={15} />Exportar Excel</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-stretch">
        <div className="lm-seg">
          <button className={tab === "posicao" ? "on" : ""} onClick={() => setTab("posicao")} data-testid="tab-posicao">Posição atual</button>
          <button className={tab === "historico" ? "on" : ""} onClick={() => setTab("historico")} data-testid="tab-historico">Histórico</button>
        </div>
        <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-3 text-neutral-400" />
          <input className="lm-input pl-9 h-full" placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="stock-search" /></div>
        <select className="lm-input !w-56" value={cat} onChange={(e) => setCat(e.target.value)} data-testid="stock-cat-filter">
          <option value="">Todas categorias</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <label className="lm-btn lm-btn-outline cursor-pointer"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} data-testid="stock-only-low" />Só estoque baixo</label>
      </div>

      <div className="lm-table-wrap overflow-x-auto">
        {tab === "posicao" ? (
          <table className="lm-table">
            <thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Tamanho</th><th>Qtd</th><th>Custo</th><th>Venda</th><th>Local</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs">{r.sku}</td><td className="font-head">{r.name}</td><td>{r.cat}</td>
                  <td><span className="chip">{r.size}</span></td>
                  <td><span className={`chip ${r.min > 0 && r.stock <= r.min ? "chip-low" : ""}`}>{r.stock}</span></td>
                  <td>{formatBRL(r.cost)}</td><td>{formatBRL(r.price)}</td><td>{r.shelf}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="text-center text-neutral-500 py-8">Nenhum item.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="lm-table">
            <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Tam</th><th>Qtd</th><th>Motivo</th><th>NF</th><th></th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs whitespace-nowrap">{formatDate(m.created_at)}</td>
                  <td><span className={`badge ${KIND_STYLE[m.kind] || "bg-neutral-200"}`}>{KIND_LABEL[m.kind] || m.kind}</span></td>
                  <td className="font-head">{m.product_name}{m.order_id && <button className="ml-2 inline-flex items-center gap-1 text-xs underline" onClick={() => printOrder(m.order_id)} title="Abrir impressão A4 do pedido"><ExternalLink size={12} />Pedido #{orders.find((o) => o.id === m.order_id)?.number || ""}</button>}</td>
                  <td><span className="chip">{m.size}</span></td><td>{m.qty}</td>
                  <td className="text-sm">{m.reason}</td><td>{m.nf}</td>
                  <td>{!m.order_id && <button className="p-1 hover:bg-red-100 rounded" onClick={() => delMov(m.id)} aria-label="Excluir movimentação e estornar estoque"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
              {movs.length === 0 && <tr><td colSpan={8} className="text-center text-neutral-500 py-8">Sem movimentações.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent data-testid="stock-modal">
          <DialogHeader><DialogTitle className="font-head">{modal === "in" ? "Entrada por NF" : "Saída / Avaria"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <select className="lm-input" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value, size: "" })} data-testid="mov-product">
              <option value="">— Produto —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
            <select className="lm-input" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} data-testid="mov-size">
              <option value="">— Tamanho —</option>{(product?.sizes || []).map((s) => <option key={s.size} value={s.size}>{s.size} (atual {s.stock})</option>)}
            </select>
            <input className="lm-input" type="number" min="1" placeholder="Quantidade" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} data-testid="mov-qty" />
            {modal === "in" && <input className="lm-input" placeholder="Número da NF" value={form.nf} onChange={(e) => setForm({ ...form, nf: e.target.value })} data-testid="mov-nf" />}
            {modal === "out" && (
              <select className="lm-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="mov-kind">
                <option value="SAIDA">Saída manual</option><option value="AVARIA">Avaria</option>
              </select>
            )}
            <input className="lm-input" placeholder="Observação / motivo" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="mov-reason" />
            <button className={`lm-btn w-full justify-center ${modal === "in" ? "lm-btn-olive" : "lm-btn-red"}`} onClick={submit} data-testid="mov-submit">Registrar</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
