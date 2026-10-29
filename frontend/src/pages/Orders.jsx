import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import html2canvas from "html2canvas";
import { api, formatBRL, formatDateShort } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Printer, FileText, Truck, Check, Download } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PrintOrderA4, { PrintOrder80mm } from "@/components/PrintOrder";
import CustomerSignaturePad from "@/components/CustomerSignaturePad";
import ProductSearchSelect from "@/components/ProductSearchSelect";
import useSubmitLock from "@/hooks/useSubmitLock";

const BLANK_ORDER = {
  type: "VENDA", status: "Orçamento", customer_id: "", customer_name: "",
  items: [], returned_items: [], exchanged_items: [],
  discount: 0, payment: "PIX", notes: "", avulsa: false, original_order_id: "",
};
const ORDER_STATUSES = ["Orçamento", "Aprovado", "Separado", "Entregue", "Retirado", "Cancelado"];

export default function Orders({ mode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isTrocas = mode === "trocas";
  const [searchParams, setSearchParams] = useSearchParams();
  const autoPrintOrderId = searchParams.get("printOrder");
  const autoPrintStarted = useRef(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [loadingPrintOrderId, setLoadingPrintOrderId] = useState("");
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [settings, setSettings] = useState({});
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [printingVendor, setPrintingVendor] = useState(null);
  const [printMode, setPrintMode] = useState("a4"); // a4 | 80
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFilter, setReportFilter] = useState({ from: "", to: "", type: "ALL" });
  const [fulfillment, setFulfillment] = useState(null);
  const [autoPrintPending, setAutoPrintPending] = useState(false);
  const [savingJpeg, setSavingJpeg] = useState(false);
  const jpegTargetRef = useRef(null);
  const { run: withSubmitLock, isPending } = useSubmitLock();

  const load = async () => {
    try {
      const [o, p, c, s, v, vehiclesResponse] = await Promise.all([
        api.get("/orders"), api.get("/products"), api.get("/customers"), api.get("/settings"), api.get("/vendors"), api.get("/vehicles"),
      ]);
      setOrders(o.data); setProducts(p.data); setCustomers(c.data); setSettings(s.data); setVendors(v.data);
      setVehicles(vehiclesResponse.data.filter((vehicle) => vehicle.active !== false));
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível carregar os pedidos");
    } finally {
      setOrdersLoaded(true);
    }
  };
  useEffect(() => { load(); }, []);

  const prodById = useMemo(()=>Object.fromEntries(products.map(p=>[p.id,p])),[products]);

  const openNew = () => { setEditing({ ...BLANK_ORDER, ...(isTrocas ? { type: "TROCA" } : {}) }); setOpen(true); };
  const shownOrders = orders.filter(o => isTrocas ? ["TROCA","DEVOLUCAO"].includes(o.type) : true);
  const openEdit = (o) => { setEditing(JSON.parse(JSON.stringify(o))); setOpen(true); };
  const startFulfillment = (order, deliveryType = "ENTREGA") => {
    setFulfillment({ order, delivery_type: deliveryType, vehicle_id: "", signature: "", step: "review" });
  };
  const closeFulfillment = () => {
    window.screen?.orientation?.unlock?.();
    setFulfillment(null);
  };

  const addItem = () => setEditing(e => ({ ...e, items:[...e.items, { product_id:"", name:"", size:"", qty:1, unit_price:0 }] }));
  const setItem = (i, patch) => setEditing(e => {
    const items = [...e.items]; items[i] = { ...items[i], ...patch }; return { ...e, items };
  });
  const addReturnItem = (key) => setEditing(e => ({ ...e, [key]:[...(e[key]||[]), { product_id:"", name:"", size:"", qty:1, reason:"" }] }));
  const dismantlingInfo = (item, index) => {
    if (!editing || editing.id || editing.type !== "VENDA" || !item.product_id || !item.size) return null;
    const matchingItems = editing.items
      .map((orderItem, itemIndex) => ({ ...orderItem, itemIndex }))
      .filter((orderItem) => orderItem.product_id === item.product_id && orderItem.size === item.size);
    if (matchingItems[matchingItems.length - 1]?.itemIndex !== index) return null;

    const product = prodById[item.product_id];
    const availableStock = Number(product?.sizes?.find((size) => size.size === item.size)?.stock || 0);
    const requestedQuantity = matchingItems.reduce((total, orderItem) => total + Number(orderItem.qty || 0), 0);
    const shortage = Math.max(requestedQuantity - availableStock, 0);
    if (!shortage) return null;

    const parentProducts = products
      .filter((candidate) => (candidate.linked_ids || []).includes(item.product_id))
      .map((parent) => ({
        name: parent.name,
        stock: Number(parent.sizes?.find((size) => size.size === item.size)?.stock || 0),
      }))
      .filter((parent) => parent.stock > 0);
    const dismantlableQuantity = parentProducts.reduce((total, parent) => total + parent.stock, 0);

    return { shortage, parentProducts, dismantlableQuantity };
  };

  const save = () => withSubmitLock("save-order", async () => {
    try {
      if (!editing.customer_name && !editing.customer_id) return toast.error("Informe o cliente");
      if (editing.items.length === 0 && editing.type==="VENDA") return toast.error("Adicione ao menos 1 item");
      if (editing.type !== "VENDA" && !editing.avulsa && !editing.original_order_id)
        return toast.error("Vincule a um pedido ou marque Avulsa");
      const invalidReturnSize = (editing.returned_items || []).some((item) => {
        if (!item.product_id) return false;
        const sizes = prodById[item.product_id]?.sizes || [];
        return sizes.length > 0 && !sizes.some((size) => size.size === item.size);
      });
      if (invalidReturnSize) return toast.error("Selecione um tamanho cadastrado para o produto devolvido");
      if (editing.id) await api.put(`/orders/${editing.id}`, editing);
      else await api.post("/orders", editing);
      toast.success("Pedido salvo"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  });

  const changeOrderStatus = async (order, status) => {
    if (status === order.status) return;
    if (!["Entregue", "Retirado"].includes(order.status) && ["Entregue", "Retirado"].includes(status)) {
      startFulfillment(order, status === "Retirado" ? "RETIRADA" : "ENTREGA");
      return;
    }
    try {
      await api.put(`/orders/${order.id}`, { status });
      toast.success(`Status do pedido #${order.number} atualizado`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível alterar o status do pedido");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir pedido?")) return;
    try {
      await api.delete(`/orders/${id}`);
      toast.success("Pedido excluído e estoque estornado quando aplicável");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível excluir o pedido");
    }
  };

  const doPrint = useCallback(async (order, mode) => {
    setLoadingPrintOrderId(order.id);
    try {
      let orderToPrint = order;
      let vendorToPrint = vendors.find((vendor) => vendor.id === order.vendor_id) || null;
      if (mode === "a4") {
        const [orderResponse, vendorResponse] = await Promise.all([
          api.get(`/orders/${order.id}`),
          order.vendor_id ? api.get(`/vendors/${order.vendor_id}`) : Promise.resolve(null),
        ]);
        orderToPrint = orderResponse.data;
        vendorToPrint = vendorResponse?.data || vendorToPrint;
      }
      const linked = orders.filter((item) => item.original_order_id === order.id);
      const merged = {
        ...orderToPrint,
        returned_items: [...(orderToPrint.returned_items || []), ...linked.flatMap((item) => (item.returned_items || []).map((returnedItem) => ({ ...returnedItem, reason: `${returnedItem.reason || ""} (#${item.number})` })))],
        exchanged_items: [...(orderToPrint.exchanged_items || []), ...linked.filter((item) => item.type === "TROCA").flatMap((item) => (item.items || []).map((exchangedItem) => ({ ...exchangedItem, reason: `Item entregue na troca #${item.number}` })))],
      };
      const original = orders.find((item) => item.id === order.original_order_id);
      setPrinting({ ...merged, original_number: original?.number });
      setPrintingVendor(vendorToPrint);
      setPrintMode(mode);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível carregar os dados para impressão");
      return false;
    } finally {
      setLoadingPrintOrderId("");
    }
  }, [orders, vendors]);
  useEffect(() => {
    if (!autoPrintOrderId || !ordersLoaded || autoPrintStarted.current) return;
    const order = orders.find((item) => item.id === autoPrintOrderId);
    if (!order) {
      toast.error("Pedido relacionado não encontrado");
      setSearchParams({}, { replace: true });
      return;
    }
    autoPrintStarted.current = true;
    const printOrder = async () => {
      const printStarted = await doPrint(order, "a4");
      if (printStarted) setAutoPrintPending(true);
      setSearchParams({}, { replace: true });
    };
    printOrder();
  }, [autoPrintOrderId, doPrint, orders, ordersLoaded, setSearchParams]);
  useEffect(() => {
    if (!autoPrintPending || !printing) return undefined;
    const timeout = window.setTimeout(() => {
      setAutoPrintPending(false);
      window.print();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [autoPrintPending, printing]);

  const completeOrder = () => withSubmitLock("fulfill-order", async () => {
    if (!fulfillment) return;
    if (!fulfillment.signature) {
      toast.error("Solicite a assinatura do cliente antes de concluir o pedido");
      return;
    }
    try {
      await api.post(`/orders/${fulfillment.order.id}/fulfill`, {
        delivery_type: fulfillment.delivery_type,
        vehicle_id: fulfillment.delivery_type === "ENTREGA" ? fulfillment.vehicle_id || null : null,
        signature: fulfillment.signature || null,
      });
      const completionMessage = {
        ENTREGA: "Pedido entregue e estoque atualizado",
        RETIRADA: "Pedido retirado e estoque atualizado",
        CORREIO: "Pedido enviado por correio/transportadora e estoque atualizado",
      };
      toast.success(completionMessage[fulfillment.delivery_type]);
      closeFulfillment();
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível concluir o pedido");
    }
  });
  const beginSignature = async () => {
    setFulfillment((current) => current ? { ...current, step: "signature" } : current);
    try {
      if (!window.screen?.orientation?.lock) return;
      await window.screen.orientation.lock("landscape");
    } catch {
      // The browser may not support locking orientation; the customer can rotate the device manually.
    }
  };
  const runPrint = (pdf) => {
    if (pdf) toast.info("Na janela de impressão, escolha 'Salvar como PDF' como destino");
    setTimeout(() => window.print(), pdf ? 600 : 50);
  };
  const saveJpeg = async () => {
    if (printMode !== "a4" || !jpegTargetRef.current || savingJpeg) return;
    setSavingJpeg(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const canvas = await html2canvas(jpegTargetRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Não foi possível gerar a imagem JPEG")), "image/jpeg", 0.95);
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pedido-${printing.number}-lokal-militar.jpg`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Imagem JPEG do pedido salva");
    } catch (error) {
      console.error("Erro ao exportar pedido como JPEG", error);
      toast.error("Não foi possível gerar o JPEG. Tente novamente ou use a opção de impressão.");
    } finally {
      setSavingJpeg(false);
    }
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
      <header className="lm-page-head flex items-end justify-between flex-wrap gap-2">
        <div><h1>{isTrocas ? "Trocas e Devoluções" : "Pedidos & PDV"}</h1><p>{isTrocas ? "Trocas vinculadas a pedidos ou avulsas" : "O estoque é lançado somente quando o pedido é entregue ou retirado"}</p></div>
        <div className="flex gap-2">
          <button className="lm-btn lm-btn-dark" onClick={()=>setReportOpen(true)} data-testid="btn-report">
            <FileText size={14}/>Relatórios de Saídas
          </button>
          <button className="lm-btn lm-btn-olive" onClick={openNew} data-testid="btn-new-order"><Plus size={14}/>{isTrocas ? "NOVA TROCA/DEVOLUÇÃO" : "NOVO PEDIDO"}</button>
        </div>
      </header>

      <div className="lm-table-wrap overflow-x-auto">
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
                <td>
                  {isAdmin ? (
                    <select
                      className="max-w-[110px] text-[10px] px-1 py-0.5 bg-neutral-200"
                      value={o.status}
                      onChange={(event) => changeOrderStatus(o, event.target.value)}
                      aria-label={`Status do pedido #${o.number}`}
                      data-testid={`order-status-${o.number}`}
                    >
                      {!ORDER_STATUSES.includes(o.status) && <option>{o.status}</option>}
                      {ORDER_STATUSES.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-neutral-200">{o.status}</span>
                  )}
                </td>
                <td className="flex gap-1 py-2 flex-wrap">
                  <button className="p-1 hover:bg-neutral-200" onClick={()=>openEdit(o)} data-testid={`edit-order-${o.number}`}><Edit size={13}/></button>
                  {!["Entregue", "Retirado"].includes(o.status) && (
                    <button className="p-1 hover:bg-green-100 text-green-800" onClick={()=>startFulfillment(o)} title="Registrar entrega ou retirada" data-testid={`fulfill-order-${o.number}`}><Truck size={13}/></button>
                  )}
                  <button className="p-1 hover:bg-neutral-200" onClick={()=>doPrint(o,"a4")} disabled={Boolean(loadingPrintOrderId)} data-testid={`print-a4-${o.number}`}><Printer size={13}/></button>
                  <button className="p-1 hover:bg-neutral-200 text-[10px]" onClick={()=>doPrint(o,"80")} disabled={Boolean(loadingPrintOrderId)} data-testid={`print-80-${o.number}`}>80mm</button>
                  <button className="p-1 hover:bg-neutral-200 text-[10px]" onClick={()=>doPrint(o,"a4")} disabled={Boolean(loadingPrintOrderId)} data-testid={`print-pdf-${o.number}`}>PDF</button>
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
        {printing && printMode==="a4" && <PrintOrderA4 order={printing} settings={settings} customer={cust(printing.customer_id)} vendor={printingVendor}/>}
        {printing && printMode==="80" && <PrintOrder80mm order={printing} settings={settings}/>}
      </div>

      <Dialog open={!!printing} onOpenChange={(o) => { if (!o) { setPrinting(null); setPrintingVendor(null); } }}>
        <DialogContent className="max-w-[900px] w-[95vw] max-h-[92vh] overflow-y-auto no-print" data-testid="print-preview">
          <DialogHeader><DialogTitle className="font-head">Pré-visualização · Pedido #{printing?.number}</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">
            <div className="lm-seg">
              <button className={printMode==="a4" ? "on" : ""} onClick={() => setPrintMode("a4")} data-testid="preview-mode-a4">A4</button>
              <button className={printMode==="80" ? "on" : ""} onClick={() => setPrintMode("80")} data-testid="preview-mode-80">Térmica 80mm</button>
            </div>
            <button className="lm-btn lm-btn-olive" onClick={() => runPrint(false)} data-testid="preview-print"><Printer size={15}/>Imprimir</button>
            <button className="lm-btn lm-btn-gold" onClick={() => runPrint(true)} data-testid="preview-pdf"><FileText size={15}/>Salvar PDF</button>
            {printMode === "a4" && <button className="lm-btn lm-btn-outline" onClick={saveJpeg} disabled={savingJpeg} data-testid="preview-jpeg"><Download size={15}/>{savingJpeg ? "Gerando JPEG..." : "Salvar JPEG"}</button>}
          </div>
          <div className="bg-neutral-300 p-4 rounded flex justify-center overflow-x-auto">
            <div className="shadow-lg">
              {printing && printMode==="a4" && <PrintOrderA4 order={printing} settings={settings} customer={cust(printing.customer_id)} vendor={printingVendor} captureRef={jpegTargetRef}/>}
              {printing && printMode==="80" && <PrintOrder80mm order={printing} settings={settings}/>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                  <select className="input" value={editing.status} disabled={!isAdmin && ["Entregue", "Retirado"].includes(editing.status)} onChange={e=>setEditing({...editing, status:e.target.value})}>
                    <option>Orçamento</option><option>Aprovado</option><option>Separado</option><option>Cancelado</option>
                    {isAdmin && <><option>Entregue</option><option>Retirado</option></>}
                    {!isAdmin && ["Entregue", "Retirado"].includes(editing.status) && <option>{editing.status}</option>}
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

              <label><div className="text-[11px] font-mono text-neutral-500">Vendedor</div>
                <select className="input" value={editing.vendor_id||""} onChange={e=>{
                  const v = vendors.find(x=>x.id===e.target.value);
                  setEditing({...editing, vendor_id:e.target.value, vendor_name:v?.name||""});
                }} data-testid="order-vendor">
                  <option value="">— Usuário logado —</option>
                  {vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
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
                  <div key={i} className="grid grid-cols-4 sm:grid-cols-[repeat(15,minmax(0,1fr))] gap-2 mt-2 items-end">
                    <ProductSearchSelect
                      products={products}
                      value={it.product_id}
                      onChange={(productId) => {
                        const product = prodById[productId];
                        setItem(i, { product_id: productId, name: product?.name || "", sku: product?.sku || "", size: "", unit_price: product?.price || 0 });
                      }}
                      placeholder="Buscar produto por nome ou SKU..."
                      className="col-span-4 sm:col-span-5"
                      testid={`order-product-${i}`}
                    />
                    <select className="input col-span-2 sm:col-span-2" value={it.size||""} onChange={e=>setItem(i,{size:e.target.value})} data-testid={`item-size-${i}`} aria-label={`Tamanho do item ${i + 1}`}>
                      <option value="">Tam</option>
                      {(prodById[it.product_id]?.sizes||[]).map(s=><option key={s.size} value={s.size}>{s.size} ({s.stock})</option>)}
                    </select>
                    <label className="col-span-2 sm:col-span-2 min-w-0">
                      <span className="block text-[10px] leading-tight text-neutral-600 mb-1">Quantidade</span>
                      <input className="input" type="number" min="1" step="1" value={it.qty} onChange={e=>setItem(i,{qty:Number(e.target.value)})} aria-label={`Quantidade do item ${i + 1}`}/>
                    </label>
                    <label className="col-span-2 sm:col-span-3 min-w-0">
                      <span className="block text-[10px] leading-tight text-neutral-600 mb-1">Valor unitário (R$)</span>
                      <input className="input" type="number" min="0" step="0.01" value={it.unit_price} onChange={e=>setItem(i,{unit_price:Number(e.target.value)})} aria-label={`Valor unitário do item ${i + 1} em reais`}/>
                    </label>
                    <div className="col-span-2 sm:col-span-2 text-xs text-right" aria-label={`Subtotal do item ${i + 1}`}>Subtotal: {formatBRL(it.qty*it.unit_price)}</div>
                    <button type="button" className="col-span-2 sm:col-span-1 text-red-700" onClick={()=>setEditing({...editing, items:editing.items.filter((_,x)=>x!==i)})} aria-label={`Remover item ${i + 1}`}>×</button>
                      {(() => {
                        const info = dismantlingInfo(it, i);
                        if (!info) return null;
                        const canCoverShortage = info.dismantlableQuantity >= info.shortage;
                        return (
                          <div className={`col-span-4 sm:col-span-15 border p-2 text-xs ${canCoverShortage ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900"}`} role="status" data-testid={`dismantling-warning-${i}`}>
                            Estoque insuficiente: faltam {info.shortage} unidade(s) de {it.name} tamanho {it.size}.
                            {info.parentProducts.length > 0
                              ? ` Será necessário desmontar ${info.shortage} unidade(s) de ${info.parentProducts.map((parent) => `${parent.name} (${parent.stock} disponível(is))`).join(", ")}.`
                              : " Não há produtos vinculados disponíveis para desmontagem nesse tamanho."}
                            {!canCoverShortage && info.parentProducts.length > 0 && ` A desmontagem disponível cobre apenas ${info.dismantlableQuantity} unidade(s).`}
                            {" "}A desmontagem será feita ao concluir a entrega ou retirada.
                          </div>
                        );
                      })()}
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
                    <div key={i} className="grid grid-cols-4 sm:grid-cols-12 gap-2 mt-1">
                      <ProductSearchSelect
                        products={products}
                        value={r.product_id}
                        onChange={(productId) => {
                          const product = prodById[productId];
                          const returnedItems = [...editing.returned_items];
                          returnedItems[i] = { ...returnedItems[i], product_id: productId, name: product?.name || "", size: "" };
                          setEditing({ ...editing, returned_items: returnedItems });
                        }}
                        placeholder="Buscar produto por nome ou SKU..."
                        className="col-span-4 sm:col-span-5"
                        testid={`returned-product-${i}`}
                      />
                      <select
                        className="input col-span-1 sm:col-span-2"
                        value={(prodById[r.product_id]?.sizes || []).some((size) => size.size === r.size) ? r.size : ""}
                        onChange={e=>{const ri=[...editing.returned_items]; ri[i] = { ...ri[i], size:e.target.value }; setEditing({...editing, returned_items:ri});}}
                        aria-label={`Tamanho do item devolvido ${i + 1}`}
                        data-testid={`returned-item-size-${i}`}
                      >
                        <option value="">Tam</option>
                        {(prodById[r.product_id]?.sizes || []).map((size) => (
                          <option key={size.size} value={size.size}>{size.size} ({size.stock})</option>
                        ))}
                      </select>
                      <input className="input col-span-1 sm:col-span-1" type="number" value={r.qty} onChange={e=>{const ri=[...editing.returned_items]; ri[i].qty=Number(e.target.value); setEditing({...editing, returned_items:ri});}}/>
                      <input className="input col-span-2 sm:col-span-4" placeholder="Motivo (ex: tamanho errado)" value={r.reason||""} onChange={e=>{const ri=[...editing.returned_items]; ri[i].reason=e.target.value; setEditing({...editing, returned_items:ri});}}/>
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
                      <button className="lm-btn lm-btn-dark" onClick={()=>doPrint(editing,"a4")} data-testid="sheet-print"><Printer size={13}/>Imprimir / PDF</button>
                    </>
                  )}
                  <button className="lokal-btn-primary" onClick={save} disabled={isPending("save-order")} data-testid="save-order">
                    {isPending("save-order") ? "SALVANDO..." : "SALVAR"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!fulfillment} onOpenChange={(isOpen) => !isOpen && closeFulfillment()}>
        <DialogContent
          className={fulfillment?.step === "signature"
            ? "w-screen h-[100dvh] max-w-none max-h-none overflow-y-auto rounded-none p-4 sm:p-6"
            : "max-w-xl max-h-[90vh] overflow-y-auto"}
          data-testid="order-fulfillment-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-head">
              {fulfillment?.step === "signature"
                ? `Assinatura do cliente · Pedido #${fulfillment?.order.number}`
                : `Conferir pedido #${fulfillment?.order.number}`}
            </DialogTitle>
          </DialogHeader>
          {fulfillment && (
            <div className="space-y-4">
              {fulfillment.step === "review" ? (
                <>
                  <div className="rounded border p-3 space-y-2">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span><strong>Cliente:</strong> {fulfillment.order.customer_name || cust(fulfillment.order.customer_id)?.name || "—"}</span>
                      <span><strong>Tipo:</strong> {fulfillment.order.type}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-left"><th className="py-2">Produto</th><th className="py-2">Tamanho</th><th className="py-2 text-right">Qtd.</th></tr></thead>
                        <tbody>
                          {(fulfillment.order.items || []).map((item, index) => (
                            <tr key={`${item.product_id || item.name}-${index}`} className="border-b last:border-0">
                              <td className="py-2">{item.name || prodById[item.product_id]?.name || "Produto"}</td>
                              <td className="py-2">{item.size || "—"}</td>
                              <td className="py-2 text-right">{item.qty || 0}</td>
                            </tr>
                          ))}
                          {(fulfillment.order.items || []).length === 0 && (
                            <tr><td colSpan={3} className="py-3 text-center text-neutral-500">Nenhum item registrado neste pedido.</td></tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t">
                            <th colSpan={2} className="pt-2 text-right">Quantidade total de produtos</th>
                            <th className="pt-2 text-right">{(fulfillment.order.items || []).reduce((quantity, item) => quantity + Number(item.qty || 0), 0)}</th>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {fulfillment.order.notes && <p className="border-t pt-2 text-sm"><strong>Observações:</strong> {fulfillment.order.notes}</p>}
                  </div>
                  <label className="block text-sm">Como o cliente receberá o pedido?
                    <select className="input mt-1" value={fulfillment.delivery_type}
                      onChange={(event) => setFulfillment({ ...fulfillment, delivery_type: event.target.value, vehicle_id: "" })}
                      data-testid="fulfillment-delivery-type">
                      <option value="ENTREGA">Entrega</option>
                      <option value="RETIRADA">Retirada pelo cliente</option>
                      <option value="CORREIO">Correio/transportadora</option>
                    </select>
                  </label>
                  {fulfillment.delivery_type === "ENTREGA" && (
                    <label className="block text-sm">Veículo utilizado
                      <select className="input mt-1" value={fulfillment.vehicle_id}
                        onChange={(event) => setFulfillment({ ...fulfillment, vehicle_id: event.target.value })}
                        data-testid="fulfillment-vehicle">
                        <option value="">— Não informar veículo —</option>
                        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}{vehicle.plate ? ` · ${vehicle.plate}` : ""}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="flex justify-end gap-2">
                    <button className="lm-btn lm-btn-outline" onClick={closeFulfillment}>Cancelar</button>
                    <button className="lm-btn lm-btn-olive" onClick={beginSignature} data-testid="begin-order-signature">Conferido · Assinar</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-neutral-600">Peça ao cliente para assinar no espaço abaixo. No celular, gire o aparelho para a horizontal.</p>
                  <CustomerSignaturePad initialValue={fulfillment.signature} onChange={(signature) => setFulfillment((current) => current ? { ...current, signature } : current)} />
                  <div className="flex flex-wrap justify-between gap-2">
                    <button className="lm-btn lm-btn-outline" onClick={() => setFulfillment((current) => current ? { ...current, step: "review" } : current)}>Voltar à conferência</button>
                    <button className="lm-btn lm-btn-olive" onClick={completeOrder} disabled={isPending("fulfill-order")} data-testid="confirm-order-fulfillment">
                      <Check size={14}/>{isPending("fulfill-order") ? "Registrando..." : "Confirmar e lançar estoque"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
