import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatBRL } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Scissors } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [grids, setGrids] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [params] = useSearchParams();

  const load = async () => {
    const [p, c, g] = await Promise.all([api.get("/products"), api.get("/categories"), api.get("/size_grids")]);
    setProducts(p.data); setCategories(c.data); setGrids(g.data);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = params.get("edit");
    if (id && products.length) {
      const p = products.find(x=>x.id===id);
      if (p) { setEditing(p); setOpen(true); }
    }
  }, [params, products]);

  const openNew = () => { setEditing({ name:"", sku:"", category_id:"", cost:0, price:0, sizes:[], is_kit:false, kit_items:[] }); setOpen(true); };
  const openEdit = (p) => { setEditing(JSON.parse(JSON.stringify(p))); setOpen(true); };

  const save = async () => {
    try {
      if (!editing.name || !editing.sku) return toast.error("Nome e SKU obrigatórios");
      if (editing.id) await api.put(`/products/${editing.id}`, editing);
      else await api.post("/products", editing);
      toast.success("Produto salvo");
      setOpen(false); load();
    } catch (e) { toast.error("Erro ao salvar"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir produto?")) return;
    await api.delete(`/products/${id}`); toast.success("Removido"); load();
  };

  const desmontarKit = async (p) => {
    const size = window.prompt("Tamanho do kit a desmontar:");
    if (!size) return;
    try {
      await api.post(`/products/${p.id}/desmontar_kit`, { size });
      toast.success("Kit desmontado"); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  const addSize = () => setEditing(e => ({ ...e, sizes: [...(e.sizes||[]), { size:"", stock:0, stock_min:0 }] }));
  const addKitItem = () => setEditing(e => ({ ...e, kit_items: [...(e.kit_items||[]), { product_id:"", size:"", qty:1 }] }));

  const cat = (id) => categories.find(c=>c.id===id)?.name || "-";
  const totalStock = (p) => (p.sizes||[]).reduce((s,x)=>s + Number(x.stock||0), 0);

  const grid = editing && categories.find(c=>c.id===editing.category_id);
  const gridObj = grid && grids.find(g=>g.name===grid.size_grid);

  const filtered = products.filter(p =>
    !search || (p.name+p.sku+(cat(p.category_id)||"")).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="products-page">
      <header className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="lokal-stencil text-2xl">Produtos — Grade Militar</h1>
        <button className="lokal-btn-primary flex items-center gap-2" onClick={openNew} data-testid="btn-new-product">
          <Plus size={16}/> NOVO PRODUTO
        </button>
      </header>
      <input placeholder="Buscar por nome, SKU, categoria..." value={search} onChange={e=>setSearch(e.target.value)}
        className="w-full md:w-80 border px-3 py-2 rounded-sm mb-3 text-sm" data-testid="search-products"/>
      <div className="lokal-panel overflow-x-auto">
        <table className="w-full text-sm table-mono">
          <thead className="bg-neutral-100">
            <tr className="text-left text-[11px] text-neutral-600">
              <th className="p-2">SKU</th><th>PRODUTO</th><th>CATEGORIA</th><th>TAMANHOS</th><th>ESTOQUE</th><th>CUSTO</th><th>VENDA</th><th>KIT</th><th>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-t hover:bg-neutral-50">
                <td className="p-2">{p.sku}</td>
                <td>{p.name}</td>
                <td>{cat(p.category_id)}</td>
                <td>{(p.sizes||[]).map(s=>`${s.size}:${s.stock}`).join(" · ")}</td>
                <td className="font-bold">{totalStock(p)}</td>
                <td>{formatBRL(p.cost)}</td>
                <td>{formatBRL(p.price)}</td>
                <td>{p.is_kit ? "SIM" : "-"}</td>
                <td className="flex gap-1 py-2">
                  <button className="p-1 hover:bg-neutral-200" onClick={()=>openEdit(p)} data-testid={`edit-${p.sku}`}><Edit size={14}/></button>
                  {p.is_kit && <button className="p-1 hover:bg-amber-100" onClick={()=>desmontarKit(p)} title="Desmontar Kit"><Scissors size={14}/></button>}
                  <button className="p-1 hover:bg-red-100 text-red-700" onClick={()=>remove(p.id)}><Trash2 size={14}/></button>
                </td>
              </tr>
            ))}
            {filtered.length===0 && (
              <tr><td colSpan={9} className="p-6 text-center text-neutral-500 text-xs">Nenhum produto cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full md:max-w-3xl overflow-y-auto">
          <SheetHeader><SheetTitle className="lokal-stencil">{editing?.id ? "Editar Produto" : "Novo Produto"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome *"><input className="input" value={editing.name} onChange={e=>setEditing({...editing, name:e.target.value})} data-testid="p-name"/></Field>
                <Field label="SKU *"><input className="input" value={editing.sku} onChange={e=>setEditing({...editing, sku:e.target.value})} data-testid="p-sku"/></Field>
                <Field label="Categoria">
                  <select className="input" value={editing.category_id||""} onChange={e=>setEditing({...editing, category_id:e.target.value})}>
                    <option value="">—</option>
                    {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Marca"><input className="input" value={editing.brand||""} onChange={e=>setEditing({...editing, brand:e.target.value})}/></Field>
                <Field label="Cor"><input className="input" value={editing.color||""} onChange={e=>setEditing({...editing, color:e.target.value})}/></Field>
                <Field label="Prateleira"><input className="input" value={editing.shelf||""} onChange={e=>setEditing({...editing, shelf:e.target.value})}/></Field>
                <Field label="Custo (R$)"><input type="number" step="0.01" className="input" value={editing.cost} onChange={e=>setEditing({...editing, cost:Number(e.target.value)})}/></Field>
                <Field label="Venda (R$)"><input type="number" step="0.01" className="input" value={editing.price} onChange={e=>setEditing({...editing, price:Number(e.target.value)})}/></Field>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="font-head text-sm">Grade de Tamanhos {gridObj && <span className="text-xs text-neutral-500">({gridObj.name})</span>}</div>
                  <button type="button" className="text-xs underline" onClick={addSize}>+ Adicionar tamanho</button>
                </div>
                {gridObj && (
                  <div className="flex flex-wrap gap-1 my-2">
                    {gridObj.sizes.map(s=>(
                      <button key={s} type="button" className="text-[11px] border px-2 py-1 hover:bg-neutral-100"
                        onClick={()=>setEditing(e=>({ ...e, sizes:[...(e.sizes||[]), {size:s, stock:0, stock_min:0}]}))}>
                        + {s}
                      </button>
                    ))}
                  </div>
                )}
                {(editing.sizes||[]).map((s,i)=>(
                  <div key={i} className="grid grid-cols-4 gap-2 mt-1 items-center">
                    <input className="input" placeholder="Tam" value={s.size} onChange={e=>{const sz=[...editing.sizes]; sz[i].size=e.target.value; setEditing({...editing, sizes:sz});}}/>
                    <input type="number" className="input" placeholder="Estoque" value={s.stock} onChange={e=>{const sz=[...editing.sizes]; sz[i].stock=Number(e.target.value); setEditing({...editing, sizes:sz});}}/>
                    <input type="number" className="input" placeholder="Mínimo" value={s.stock_min} onChange={e=>{const sz=[...editing.sizes]; sz[i].stock_min=Number(e.target.value); setEditing({...editing, sizes:sz});}}/>
                    <button type="button" className="text-red-700 text-xs" onClick={()=>setEditing({...editing, sizes:editing.sizes.filter((_,x)=>x!==i)})}>remover</button>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={!!editing.is_kit} onChange={e=>setEditing({...editing, is_kit:e.target.checked})}/>
                Este produto é um CONJUNTO/KIT?
              </label>
              {editing.is_kit && (
                <div className="border p-3 bg-neutral-50">
                  <div className="flex items-center justify-between">
                    <div className="font-head text-xs">Itens do Kit</div>
                    <button type="button" className="text-xs underline" onClick={addKitItem}>+ Item</button>
                  </div>
                  {(editing.kit_items||[]).map((k,i)=>(
                    <div key={i} className="grid grid-cols-4 gap-2 mt-2">
                      <select className="input col-span-2" value={k.product_id} onChange={e=>{const kk=[...editing.kit_items]; kk[i].product_id=e.target.value; setEditing({...editing, kit_items:kk});}}>
                        <option value="">— Produto —</option>
                        {products.filter(p=>!p.is_kit).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input className="input" placeholder="Tam" value={k.size||""} onChange={e=>{const kk=[...editing.kit_items]; kk[i].size=e.target.value; setEditing({...editing, kit_items:kk});}}/>
                      <input className="input" type="number" placeholder="Qtd" value={k.qty} onChange={e=>{const kk=[...editing.kit_items]; kk[i].qty=Number(e.target.value); setEditing({...editing, kit_items:kk});}}/>
                    </div>
                  ))}
                  <div className="text-[10px] text-neutral-500 mt-2">Dica: FARDA = CALÇA + GANDOLA do mesmo tamanho. Ao vender o kit, o estoque dos componentes é reduzido automaticamente.</div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button className="lokal-btn-primary" onClick={save} data-testid="save-product">SALVAR</button>
                <button className="px-4 py-2 border rounded-sm" onClick={()=>setOpen(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <style>{`.input{width:100%;border:1px solid #ccc;padding:6px 8px;border-radius:2px;font-size:13px}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><div className="text-[11px] font-mono text-neutral-500 mb-1">{label}</div>{children}</label>;
}
