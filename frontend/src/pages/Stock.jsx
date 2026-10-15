import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatBRL, formatDate } from "@/lib/api";
import { toast } from "sonner";
import { Printer, Trash2, Plus } from "lucide-react";

export default function Stock() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showEntry, setShowEntry] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [form, setForm] = useState({ product_id:"", size:"", qty:1, nf:"", reason:"", kind:"ENTRADA" });
  const [params] = useSearchParams();
  const catFilter = params.get("cat") || "";

  const load = async () => {
    const [p, m, c] = await Promise.all([api.get("/products"), api.get("/stock_movements"), api.get("/categories")]);
    setProducts(p.data); setMovements(m.data); setCategories(c.data);
  };
  useEffect(() => { load(); }, []);

  const catMap = useMemo(()=>Object.fromEntries(categories.map(c=>[c.id,c.name])),[categories]);

  const submit = async (kind) => {
    const payload = { ...form, kind };
    const p = products.find(x=>x.id===form.product_id);
    payload.product_name = p?.name; payload.sku = p?.sku;
    await api.post("/stock_movements", payload);
    toast.success(kind === "ENTRADA" ? "Entrada registrada" : "Saída registrada");
    setShowEntry(false); setShowExit(false);
    setForm({ product_id:"", size:"", qty:1, nf:"", reason:"", kind:"ENTRADA" });
    load();
  };

  const delMov = async (id) => {
    if (!window.confirm("Excluir movimento?")) return;
    await api.delete(`/stock_movements/${id}`); load();
  };

  const printStock = (periodDays=0) => {
    let list = products;
    if (catFilter) list = list.filter(p => catMap[p.category_id] === catFilter);
    const rows = [];
    list.forEach(p => (p.sizes||[]).forEach(s => rows.push({
      sku: p.sku, name: p.name, category: catMap[p.category_id] || "-",
      size: s.size, stock: s.stock, cost: p.cost, price: p.price, shelf: p.shelf
    })));
    const totalItems = rows.reduce((s,r)=>s+Number(r.stock||0),0);
    const totalValue = rows.reduce((s,r)=>s+Number(r.stock||0)*Number(r.price||0),0);
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Estoque LOKAL MILITAR</title>
      <style>body{font-family:system-ui;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px 6px;font-size:11px}h1{font-family:Chivo,sans-serif;color:#4B5320}.tot{text-align:right;font-weight:700;margin-top:8px}</style>
      </head><body><h1>LOKAL MILITAR — RELATÓRIO DE ESTOQUE</h1>
      <div>Data: ${new Date().toLocaleString("pt-BR")} ${catFilter?`· Categoria: ${catFilter}`:""}</div>
      <table><thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Tamanho</th><th>Qtd</th><th>Custo</th><th>Venda</th><th>Local</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${r.sku||""}</td><td>${r.name}</td><td>${r.category}</td><td>${r.size}</td><td>${r.stock}</td><td>${formatBRL(r.cost)}</td><td>${formatBRL(r.price)}</td><td>${r.shelf||""}</td></tr>`).join("")}</tbody></table>
      <div class="tot">Total de itens: ${totalItems} · Valor total em estoque: ${formatBRL(totalValue)}</div>
      <script>window.print()</script>
      </body></html>`);
    w.document.close();
  };

  const exportExcel = () => {
    let list = products;
    if (catFilter) list = list.filter(p => catMap[p.category_id] === catFilter);
    const header = ["SKU","Produto","Categoria","Tamanho","Estoque","Custo","Venda","Local"];
    const rows = [header];
    list.forEach(p=> (p.sizes||[]).forEach(s=> rows.push([p.sku,p.name,catMap[p.category_id]||"",s.size,s.stock,p.cost,p.price,p.shelf||""])));
    const csv = rows.map(r=>r.map(v=>`"${(v??"").toString().replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "estoque-lokal-militar.csv"; a.click();
  };

  const filteredProducts = catFilter ? products.filter(p=>catMap[p.category_id]===catFilter) : products;

  return (
    <div data-testid="stock-page">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h1 className="lokal-stencil text-2xl">Estoque {catFilter && <span className="text-sm font-mono text-neutral-500">· {catFilter}</span>}</h1>
          <p className="font-mono text-xs text-neutral-500">Entradas, saídas e movimentações</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="lokal-btn-primary flex items-center gap-1" onClick={()=>setShowEntry(true)} data-testid="btn-entry"><Plus size={14}/>ENTRADA (NF)</button>
          <button className="px-3 py-2 border rounded-sm text-sm" onClick={()=>setShowExit(true)}>SAÍDA / AVARIA</button>
          <button className="px-3 py-2 border rounded-sm text-sm flex items-center gap-1" onClick={()=>printStock()}><Printer size={14}/>Imprimir A4</button>
          <button className="px-3 py-2 border rounded-sm text-sm" onClick={exportExcel}>Exportar CSV</button>
        </div>
      </header>

      {/* Visão geral do estoque */}
      <section className="lokal-panel mb-4 overflow-x-auto">
        <table className="w-full text-sm table-mono">
          <thead className="bg-neutral-100 text-[11px]">
            <tr><th className="text-left p-2">SKU</th><th className="text-left">Produto</th><th className="text-left">Categoria</th><th>Grade (tam:qtd)</th><th>Total</th></tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.sku}</td><td>{p.name}</td><td>{catMap[p.category_id]||"-"}</td>
                <td>{(p.sizes||[]).map(s=>`${s.size}:${s.stock}`).join(" · ")}</td>
                <td className="font-bold text-center">{(p.sizes||[]).reduce((s,x)=>s+Number(x.stock||0),0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Histórico */}
      <section className="lokal-panel overflow-x-auto">
        <div className="p-3 lokal-stencil text-sm border-b">Histórico de Movimentações</div>
        <table className="w-full text-sm table-mono">
          <thead className="bg-neutral-50 text-[11px]">
            <tr><th className="text-left p-2">Data</th><th className="text-left">Tipo</th><th className="text-left">Produto</th><th>Tam</th><th>Qtd</th><th className="text-left">Motivo</th><th>NF</th><th></th></tr>
          </thead>
          <tbody>
            {movements.map(m=>(
              <tr key={m.id} className="border-t">
                <td className="p-2">{formatDate(m.created_at)}</td>
                <td><span className={`px-2 py-0.5 text-[10px] ${m.kind==='ENTRADA'?'bg-green-100 text-green-800':m.kind==='SAIDA'?'bg-red-100 text-red-800':'bg-amber-100 text-amber-800'}`}>{m.kind}</span></td>
                <td>{m.product_name}</td><td className="text-center">{m.size||""}</td><td className="text-center">{m.qty}</td>
                <td>{m.reason||""}</td><td>{m.nf||""}</td>
                <td><button onClick={()=>delMov(m.id)} className="text-red-700 p-1"><Trash2 size={13}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(showEntry || showExit) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>{setShowEntry(false);setShowExit(false);}}>
          <div className="bg-white max-w-lg w-full p-5 rounded-sm" onClick={e=>e.stopPropagation()}>
            <h3 className="lokal-stencil text-lg mb-3">{showEntry?"Entrada por NF":"Saída / Avaria"}</h3>
            <div className="space-y-3">
              <select className="input" value={form.product_id} onChange={e=>setForm({...form, product_id:e.target.value})}>
                <option value="">— Produto —</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
              <input className="input" placeholder="Tamanho" value={form.size} onChange={e=>setForm({...form, size:e.target.value})}/>
              <input className="input" type="number" placeholder="Quantidade" value={form.qty} onChange={e=>setForm({...form, qty:Number(e.target.value)})}/>
              {showEntry && <input className="input" placeholder="NF" value={form.nf} onChange={e=>setForm({...form, nf:e.target.value})}/>}
              <input className="input" placeholder={showEntry?"Observação":"Motivo (ex: Avaria)"} value={form.reason} onChange={e=>setForm({...form, reason:e.target.value})}/>
              {showExit && (
                <select className="input" onChange={e=>setForm({...form, kind:e.target.value})}>
                  <option value="SAIDA">SAÍDA (manual)</option>
                  <option value="AVARIA">AVARIA</option>
                </select>
              )}
              <div className="flex gap-2">
                <button className="lokal-btn-primary" onClick={()=>submit(showEntry?"ENTRADA":(form.kind||"SAIDA"))}>Registrar</button>
                <button className="px-4 py-2 border rounded-sm" onClick={()=>{setShowEntry(false);setShowExit(false);}}>Cancelar</button>
              </div>
            </div>
            <style>{`.input{width:100%;border:1px solid #ccc;padding:6px 8px;border-radius:2px;font-size:13px}`}</style>
          </div>
        </div>
      )}
    </div>
  );
}
