import React, { useEffect, useState, useMemo } from "react";
import { api, formatBRL, formatDateShort } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Printer, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PrintOrderA4, { PrintOrder80mm } from "@/components/PrintOrder";

const BLANK_ORDER = {
  type: "VENDA", status: "Orçamento", customer_id: "", customer_name: "",
  items: [], returned_items: [], exchanged_items: [],
  discount: 0, payment: "PIX", notes: "", avulsa: false, original_order_id: "",
};

export default function Orders({ mode }) {
  const isTrocas = mode === "trocas";
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [settings, setSettings] = useState({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [printMode, setPrintMode] = useState("a4"); // a4 | 80
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFilter, setReportFilter] = useState({ from: "", to: "", type: "ALL" });

  const load = async () => {
    const [o, p, c, s] = await Promise.all([
      api.get("/orders"), api.get("/products"), api.get("/customers"), api.get("/settings"),
    ]);
    setOrders(o.data); setProducts(p.data); setCustomers(c.data); setSettings(s.data);
  };
  useEffect(() => { load(); }, []);

  const prodById = useMemo(()=>Object.fromEntries(products.map(p=>[p.id,p])),[products]);

  const openNew = () => { setEditing({ ...BLANK_ORDER, ...(isTrocas ? { type: "TROCA", status: "Entregue" } : {}) }); setOpen(true); };
  const shownOrders = orders.filter(o => isTrocas ? ["TROCA","DEVOLUCAO"].includes(o.type) : true);
  const openEdit = (o) => { setEditing(JSON.parse(JSON.stringify(o))); setOpen(true); };

  const addItem = () => setEditing(e => ({ ...e, items:[...e.items, { product_id:"", name:"", size:"", qty:1, unit_price:0 }] }));
  const setItem = (i, patch) => setEditing(e => {
    const items = [...e.items]; items[i] = { ...items[i], ...patch }; return { ...e, items };
  });
  const addReturnItem = (key) => setEditing(e => ({ ...e, [key]:[...(e[key]||[]), { product_id:"", name:"", size:"", qty:1, reason:"" }] }));

  const save = async () => {
    try {
      if (!editing.customer_name && !editing.customer_id) return toast.error("Informe o cliente");
      if (editing.items.length === 0 && editing.type==="VENDA") return toast.error("Adicione ao menos 1 item");
      if (editing.type !== "VENDA" && !editing.avulsa && !editing.original_order_id)
        return toast.error("Vincule a um pedido ou marque Avulsa");
      if (editing.id) await api.put(`/orders/${editing.id}`, editing);
      else await api.post("/orders", editing);
      toast.success("Pedido salvo"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir pedido?")) return;
    await api.delete(`/orders/${id}`); load();
  };

  const doPrint = (order, mode) => {
    const linked = orders.filter(o => o.original_order_id === order.id);
    const merged = {
      ...order,
      returned_items: [...(order.returned_items||[]), ...linked.flatMap(l => (l.returned_items||[]).map(r => ({ ...r, reason: `${r.reason||""} (#${l.number})` })))],
      exchanged_items: [...(order.exchanged_items||[]), ...linked.filter(l => l.type==="TROCA").flatMap(l => (l.items||[]).map(r => ({ ...r, reason: `Item entregue na troca #${l.number}` })))],
    };
    setPrinting(merged); setPrintMode(mode);
    setTimeout(()=> { window.print(); }, 150);
  };

  const filteredReport = () => {
    const list = orders.filter(o => {
      if (reportFilter.type !== "ALL" && o.type !== reportFilter.type) return false;
      const d = (o.created_at||"").slice(0,10);
      if (reportFilter.from && d < reportFilter.from) return false;
      if (reportFilter.to && d > reportFilter.to) return false;
      return true;
    });
    return list;
  };

  const printReport = () => {
    const list = filteredReport();
    const totalItems = list.reduce((s,o)=>s + (o.items||[]).reduce((a,b)=>a+Number(b.qty||0),0), 0);
    const w = window.open("","_blank");
    w.document.write(`<html><head><title>Relatório de Saídas</title>
      <style>body{font-family:system-ui;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px;font-size:11px}h1{color:#4B5320;font-family:Chivo,sans-serif}</style>
      </head><body><h1>LOKAL MILITAR — Relatório de Saídas</h1>
      <div>Período: ${reportFilter.from||"-"} até ${reportFilter.to||"-"} · Tipo: ${reportFilter.type}</div>
      <table><thead><tr><th>Data</th><th>#</th><th>Tipo</th><th>Cliente</th><th>Qtd Itens</th><th>Total</th></tr></thead>
      <tbody>${list.map(o=>`<tr><td>${formatDateShort(o.created_at)}</td><td>${o.number}</td><td>${o.type}</td><td>${o.customer_name||""}</td><td>${(o.items||[]).reduce((a,b)=>a+Number(b.qty||0),0)}</td><td>${formatBRL(o.total||0)}</td></tr>`).join("")}</tbody></table>
      <h3 style="text-align:right">Total de itens: ${totalItems}</h3>
      <script>window.print()</script></body></html>`);
    w.document.close();
    localStorage.setItem("report_filter", JSON.stringify(reportFilter));
  };

  useEffect(()=>{
    const f = localStorage.getItem("report_filter"); if (f) setReportFilter(JSON.parse(f));
  }, []);

  const cust = (id) => customers.find(c=>c.id===id);

  return (
    <div data-testid="orders-page">
      <header className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h1 className="lokal-stencil text-2xl">{isTrocas ? "Trocas e Devoluções" : "Pedidos & PDV"}</h1>
        <div className="flex gap-2">
          <button className="px-3 py-2 border rounded-sm text-sm flex items-center gap-1" onClick={()=>setReportOpen(true)} data-testid="btn-report">
            <FileText size={14}/>Relatórios de Saídas
          </button>
          <button className="lokal-btn-primary flex items-center gap-1" onClick={openNew} data-testid="btn-new-order"><Plus size={14}/>{isTrocas ? "NOVA TROCA/DEVOLUÇÃO" : "NOVO PEDIDO"}</button>
        </div>
      </header>

      <div className="lokal-panel overflow-x-auto">
        <table className="w-full text-sm table-mono">
          <thead className="bg-neutral-100 text-[11px]">
            <tr><th className="p-2">#</th><th>Data</th><th>Tipo</th><th>Cliente</th><th>Vendedor</th><th>Itens</th><th>Total</th><th>Pgto</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {shownOrders.map(o => (
              <tr key={o.id} className="border-t hover:bg-neutral-50">
                <td className="p-2 font-bold">{o.number}</td>
                <td>{formatDateShort(o.created_at)}</td>
                <td>{o.type}</td>
                <td>{o.customer_name}</td>
                <td>{o.vendor_name}</td>
                <td className="text-center">{(o.items||[]).length}</td>
                <td>{formatBRL(o.total||0)}</td>
                <td>{o.payment}</td>
                <td><span className="text-[10px] px-2 py-0.5 bg-neutral-200">{o.status}</span></td>
                <td className="flex gap-1 py-2">
                  <button className="p-1 hover:bg-neutral-200" onClick={()=>openEdit(o)} data-testid={`edit-order-${o.number}`}><Edit size={13}/></button>
                  <button className="p-1 hover:bg-neutral-200" onClick={()=>doPrint(o,"a4")} data-testid={`print-a4-${o.number}`}><Printer size={13}/></button>
                  <button className="p-1 hover:bg-neutral-200 text-[10px]" onClick={()=>doPrint(o,"80")} data-testid={`print-80-${o.number}`}>80mm</button>
                  <button className="p-1 hover:bg-neutral-200 text-[10px]" onClick={()=>doPrint(o,"a4")} data-testid={`print-pdf-${o.number}`}>PDF</button>
                  <button className="p-1 hover:bg-red-100 text-red-700" onClick={()=>remove(o.id)}><Trash2 size={13}/></button>
                </td>
              </tr>
            ))}
            {shownOrders.length===0 && (<tr><td colSpan={10} className="p-6 text-center text-neutral-500 text-xs">Nenhum pedido ainda.</td></tr>)}
          </tbody>
        </table>
      </div>

      {/* Hidden print area */}
      <div id="print-area" style={{ position:"absolute", left:"-9999px", top:0 }}>
        {printing && printMode==="a4" && <PrintOrderA4 order={printing} settings={settings} customer={cust(printing.customer_id)}/>}
        {printing && printMode==="80" && <PrintOrder80mm order={printing} settings={settings}/>}
      </div>

      {/* Editor Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full md:max-w-4xl overflow-y-auto">
          <SheetHeader><SheetTitle className="lokal-stencil">{editing?.id?`Pedido #${editing.number}`:"Novo Pedido"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label><div className="text-[11px] font-mono text-neutral-500">Tipo</div>
                  <select className="input" value={editing.type} onChange={e=>setEditing({...editing, type:e.target.value})}>
                    <option>VENDA</option><option>TROCA</option><option>DEVOLUCAO</option><option>ORCAMENTO</option>
                  </select></label>
                <label><div className="text-[11px] font-mono text-neutral-500">Status</div>
                  <select className="input" value={editing.status} onChange={e=>setEditing({...editing, status:e.target.value})}>
                    <option>Orçamento</option><option>Aprovado</option><option>Separado</option><option>Entregue</option><option>Cancelado</option>
                  </select></label>
                <label><div className="text-[11px] font-mono text-neutral-500">Pagamento</div>
                  <select className="input" value={editing.payment} onChange={e=>setEditing({...editing, payment:e.target.value})}>
                    <option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Prazo</option>
                  </select></label>
                <label><div className="text-[11px] font-mono text-neutral-500">Desconto (R$)</div>
                  <input type="number" step="0.01" className="input" value={editing.discount} onChange={e=>setEditing({...editing, discount:Number(e.target.value)})}/>
                </label>
              </div>

              <label><div className="text-[11px] font-mono text-neutral-500">Cliente</div>
                <select className="input" value={editing.customer_id||""} onChange={e=>{
                  const c = customers.find(x=>x.id===e.target.value);
                  setEditing({...editing, customer_id:e.target.value, customer_name:c?.name||""});
                }}>
                  <option value="">— Selecionar —</option>
                  {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!editing.customer_id && <input className="input mt-2" placeholder="Nome livre (sem cadastro)" value={editing.customer_name} onChange={e=>setEditing({...editing, customer_name:e.target.value})}/>}
              </label>

              {editing.type!=="VENDA" && editing.type!=="ORCAMENTO" && (
                <div className="border p-2 bg-amber-50">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!editing.avulsa} onChange={e=>setEditing({...editing, avulsa:e.target.checked})}/>
                    Troca/Devolução avulsa sem pedido de origem
                  </label>
                  {!editing.avulsa && (
                    <select className="input mt-2" value={editing.original_order_id||""} onChange={e=>setEditing({...editing, original_order_id:e.target.value})}>
                      <option value="">— Pedido de origem —</option>
                      {orders.filter(o=>o.type==="VENDA").map(o=><option key={o.id} value={o.id}>#{o.number} - {o.customer_name}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Items */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="font-head text-sm">Itens</div>
                  <button type="button" className="text-xs underline" onClick={addItem}>+ Produto</button>
                </div>
                {editing.items.map((it, i)=>(
                  <div key={i} className="grid grid-cols-12 gap-2 mt-2 items-center">
                    <select className="input col-span-5" value={it.product_id} onChange={e=>{
                      const p = prodById[e.target.value];
                      setItem(i, { product_id:e.target.value, name:p?.name||"", sku:p?.sku||"", unit_price:p?.price||0 });
                    }}>
                      <option value="">— Produto —</option>
                      {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                    <input className="input col-span-2" placeholder="Tam" value={it.size||""} onChange={e=>setItem(i,{size:e.target.value})}/>
                    <input className="input col-span-1" type="number" placeholder="Qtd" value={it.qty} onChange={e=>setItem(i,{qty:Number(e.target.value)})}/>
                    <input className="input col-span-2" type="number" step="0.01" placeholder="Vl Unit" value={it.unit_price} onChange={e=>setItem(i,{unit_price:Number(e.target.value)})}/>
                    <div className="col-span-1 text-xs text-right">{formatBRL(it.qty*it.unit_price)}</div>
                    <button type="button" className="col-span-1 text-red-700" onClick={()=>setEditing({...editing, items:editing.items.filter((_,x)=>x!==i)})}>×</button>
                  </div>
                ))}
              </div>

              {/* Returns inside order */}
              <details className="border p-2">
                <summary className="cursor-pointer text-sm font-mono">+ Trocas/Devoluções durante este pedido</summary>
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs">Itens Devolvidos (voltam ao estoque)</div>
                    <button type="button" className="text-xs underline" onClick={()=>addReturnItem("returned_items")}>+ Item</button>
                  </div>
                  {(editing.returned_items||[]).map((r,i)=>(
                    <div key={i} className="grid grid-cols-12 gap-2 mt-1">
                      <select className="input col-span-5" value={r.product_id} onChange={e=>{
                        const p = prodById[e.target.value]; const ri=[...editing.returned_items];
                        ri[i] = { ...ri[i], product_id:e.target.value, name:p?.name||"" };
                        setEditing({...editing, returned_items:ri});
                      }}>
                        <option value="">—</option>
                        {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input className="input col-span-2" placeholder="Tam" value={r.size||""} onChange={e=>{const ri=[...editing.returned_items]; ri[i].size=e.target.value; setEditing({...editing, returned_items:ri});}}/>
                      <input className="input col-span-1" type="number" value={r.qty} onChange={e=>{const ri=[...editing.returned_items]; ri[i].qty=Number(e.target.value); setEditing({...editing, returned_items:ri});}}/>
                      <input className="input col-span-4" placeholder="Motivo (ex: tamanho errado)" value={r.reason||""} onChange={e=>{const ri=[...editing.returned_items]; ri[i].reason=e.target.value; setEditing({...editing, returned_items:ri});}}/>
                    </div>
                  ))}
                </div>
              </details>

              <label><div className="text-[11px] font-mono text-neutral-500">Observações</div>
                <textarea className="input" rows={2} value={editing.notes||""} onChange={e=>setEditing({...editing, notes:e.target.value})}/></label>

              {editing.log?.length>0 && (
                <div className="text-[11px] font-mono text-amber-800 bg-amber-50 p-2 border border-amber-200">
                  {editing.log.map((l,i)=><div key={i}>→ {l}</div>)}
                </div>
              )}

              <div className="flex items-center justify-between pt-3">
                <div className="font-head text-lg">Total: {formatBRL(editing.items.reduce((s,i)=>s+i.qty*i.unit_price,0) - (editing.discount||0))}</div>
                <div className="flex gap-2">
                  {editing.id && (
                    <>
                      <button className="px-3 py-2 border rounded-sm text-sm flex items-center gap-1" onClick={()=>doPrint(editing,"a4")}><Printer size={13}/>A4</button>
                      <button className="px-3 py-2 border rounded-sm text-sm" onClick={()=>doPrint(editing,"80")}>80mm</button>
                      <button className="px-3 py-2 border rounded-sm text-sm" onClick={()=>doPrint(editing,"a4")}>PDF</button>
                    </>
                  )}
                  <button className="lokal-btn-primary" onClick={save} data-testid="save-order">SALVAR</button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setReportOpen(false)}>
          <div className="bg-white max-w-lg w-full p-5 rounded-sm" onClick={e=>e.stopPropagation()}>
            <h3 className="lokal-stencil text-lg mb-3">Relatório de Saídas</h3>
            <div className="space-y-2">
              <label><div className="text-[11px] font-mono">De</div><input type="date" className="input" value={reportFilter.from} onChange={e=>setReportFilter({...reportFilter, from:e.target.value})}/></label>
              <label><div className="text-[11px] font-mono">Até</div><input type="date" className="input" value={reportFilter.to} onChange={e=>setReportFilter({...reportFilter, to:e.target.value})}/></label>
              <label><div className="text-[11px] font-mono">Tipo</div>
                <select className="input" value={reportFilter.type} onChange={e=>setReportFilter({...reportFilter, type:e.target.value})}>
                  <option value="ALL">Todos</option><option>VENDA</option><option>TROCA</option><option>DEVOLUCAO</option>
                </select></label>
              <div className="flex gap-2 pt-2">
                <button className="lokal-btn-primary flex items-center gap-1" onClick={printReport}><Printer size={13}/>Imprimir / PDF</button>
                <button className="px-3 py-2 border rounded-sm" onClick={()=>setReportOpen(false)}>Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`.input{width:100%;border:1px solid #ccc;padding:6px 8px;border-radius:2px;font-size:13px}`}</style>
    </div>
  );
}
