import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatBRL } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Scissors, Image as ImageIcon, Link2, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BLANK = { name: "", sku: "", category_id: "", subcategory_id: "", color: "", brand: "", shelf: "", cost: 0, price: 0, sizes: [], linked_ids: [], photo: "" };

const Field = ({ label, children, wide }) => (
  <label className={`block ${wide ? "md:col-span-2" : ""}`}><div className="font-head text-[11px] text-neutral-600 mb-1">{label}</div>{children}</label>
);

const SizeChips = ({ sizes }) => (
  <div className="flex flex-wrap max-w-md">
    {(sizes || []).map((s) => {
      const low = Number(s.stock_min) > 0 && Number(s.stock) <= Number(s.stock_min);
      return <span key={s.size} className={`chip ${low ? "chip-low" : ""}`}>{s.size}: {s.stock}</span>;
    })}
  </div>
);

function LinkPicker({ editing, setEditing, products }) {
  const [q, setQ] = useState("");
  const ids = editing.linked_ids || [];
  const toggle = (id) => setEditing({ ...editing, linked_ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  const options = products
    .filter((p) => p.id !== editing.id && (!q || (p.name + p.sku + (p.color || "")).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ((b.color || "") === (editing.color || "")) - ((a.color || "") === (editing.color || "")));
  return (
    <div className="lm-card p-3" data-testid="link-picker">
      <div className="flex items-center gap-2 font-head text-sm"><Link2 size={15} color="#4B5320" /> Vínculo de desmontagem</div>
      <p className="text-xs text-neutral-600 mt-1 mb-2">
        Selecione os produtos em que este produto se desmonta (ex.: FARDA → CALÇA + GANDOLA da mesma cor). A desmontagem sempre usa o mesmo tamanho.
        Se um produto vinculado ficar sem estoque numa venda, 1 unidade deste produto é desmontada automaticamente.
      </p>
      <div className="relative mb-2"><Search size={14} className="absolute left-2 top-2.5 text-neutral-400" />
        <input className="lm-input pl-7" placeholder="Buscar produto para vincular..." value={q} onChange={(e) => setQ(e.target.value)} data-testid="link-search" /></div>
      <div className="max-h-48 overflow-y-auto border rounded bg-white">
        {options.map((p) => (
          <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-[#F4EFE3] cursor-pointer border-b last:border-0">
            <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} data-testid={`link-opt-${p.sku}`} />
            <span className="font-semibold">{p.name}</span><span className="text-neutral-500 text-xs">{p.sku} · {p.color || "sem cor"}</span>
            {editing.color && p.color === editing.color && <span className="badge bg-[#E6EBD3] text-[#4B5320] ml-auto">mesma cor</span>}
          </label>
        ))}
        {options.length === 0 && <div className="p-3 text-xs text-neutral-500">Nenhum produto encontrado.</div>}
      </div>
    </div>
  );
}

function DesmontarDialog({ product, onClose, onDone, byId }) {
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  if (!product) return null;
  const run = async () => {
    try {
      await api.post(`/products/${product.id}/desmontar`, { size, qty });
      toast.success("Desmontagem realizada"); onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Erro na desmontagem"); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="desmontar-dialog">
        <DialogHeader><DialogTitle className="font-head">Desmontar {product.name}</DialogTitle></DialogHeader>
        <div className="text-sm">Gera +1 de: <b>{product.linked_ids.map((id) => byId[id]?.name).filter(Boolean).join(" + ")}</b> por unidade.</div>
        <Field label="Tamanho">
          <select className="lm-input" value={size} onChange={(e) => setSize(e.target.value)} data-testid="desmontar-size">
            <option value="">—</option>
            {(product.sizes || []).map((s) => <option key={s.size} value={s.size}>{s.size} (estoque {s.stock})</option>)}
          </select>
        </Field>
        <Field label="Quantidade"><input type="number" min="1" className="lm-input" value={qty} onChange={(e) => setQty(Number(e.target.value))} data-testid="desmontar-qty" /></Field>
        <button className="lm-btn lm-btn-olive justify-center" disabled={!size} onClick={run} data-testid="desmontar-confirm"><Scissors size={15} />Desmontar</button>
      </DialogContent>
    </Dialog>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [grids, setGrids] = useState([]);
  const [editing, setEditing] = useState(null);
  const [desmontar, setDesmontar] = useState(null);
  const [search, setSearch] = useState("");
  const [params] = useSearchParams();

  const load = async () => {
    const [p, c, g] = await Promise.all([api.get("/products"), api.get("/categories"), api.get("/size_grids")]);
    setProducts(p.data); setCategories(c.data); setGrids(g.data);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const p = products.find((x) => x.id === params.get("edit"));
    if (p) setEditing(JSON.parse(JSON.stringify(p)));
  }, [params, products]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "-";
  const parentsOf = (id) => products.filter((p) => (p.linked_ids || []).includes(id));
  const topCats = categories.filter((c) => !c.parent_id);
  const subCats = editing ? categories.filter((c) => c.parent_id && c.parent_id === editing.category_id) : [];
  const gridObj = editing && grids.find((g) => g.name === categories.find((c) => c.id === editing.category_id)?.size_grid);

  const save = async () => {
    if (!editing.name || !editing.sku) return toast.error("Nome e SKU obrigatórios");
    try {
      if (editing.id) await api.put(`/products/${editing.id}`, editing);
      else await api.post("/products", editing);
      toast.success("Produto salvo"); setEditing(null); load();
    } catch { toast.error("Erro ao salvar"); }
  };
  const remove = async (id) => { if (!window.confirm("Excluir produto?")) return; await api.delete(`/products/${id}`); toast.success("Removido"); load(); };
  const onPhoto = (f) => { if (!f) return; const r = new FileReader(); r.onload = () => setEditing((e) => ({ ...e, photo: r.result })); r.readAsDataURL(f); };
  const setSize = (i, patch) => setEditing((e) => { const sz = [...e.sizes]; sz[i] = { ...sz[i], ...patch }; return { ...e, sizes: sz }; });
  const addSize = (size = "") => setEditing((e) => (e.sizes.some((s) => s.size === size && size) ? e : { ...e, sizes: [...e.sizes, { size, stock: 0, stock_min: 0 }] }));

  const filtered = products.filter((p) => !search || (p.name + p.sku + catName(p.category_id) + (p.color || "")).toLowerCase().includes(search.toLowerCase()));

  return (
    <div data-testid="products-page">
      <div className="lm-page-head flex items-end justify-between gap-3 flex-wrap">
        <div><h1>Produtos</h1><p>{products.length} produtos cadastrados · grade militar e vínculos de desmontagem</p></div>
        <button className="lm-btn lm-btn-olive" onClick={() => setEditing({ ...BLANK })} data-testid="btn-new-product"><Plus size={16} />Novo produto</button>
      </div>
      <div className="relative mb-3 md:w-96"><Search size={15} className="absolute left-3 top-3 text-neutral-400" />
        <input placeholder="Buscar por nome, SKU, categoria, cor..." value={search} onChange={(e) => setSearch(e.target.value)} className="lm-input pl-9" data-testid="search-products" /></div>

      <div className="lm-table-wrap overflow-x-auto">
        <table className="lm-table">
          <thead><tr><th></th><th>Produto</th><th>Categoria</th><th>Estoque por tamanho</th><th>Total</th><th>Custo</th><th>Venda</th><th>Prat.</th><th></th></tr></thead>
          <tbody>
            {filtered.map((p) => {
              const parents = parentsOf(p.id);
              return (
                <tr key={p.id} data-testid={`product-row-${p.sku}`}>
                  <td className="w-14">
                    <div className="w-11 h-11 rounded bg-[#E8E2D5] flex items-center justify-center overflow-hidden">
                      {p.photo ? <img src={p.photo} alt={p.name} className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-neutral-500" />}
                    </div>
                  </td>
                  <td>
                    <div className="font-head font-semibold text-[15px]">{p.name}</div>
                    <div className="text-xs text-neutral-500">{[p.sku, categories.find((c) => c.id === p.subcategory_id)?.name, p.color, p.brand].filter(Boolean).join(" · ")}</div>
                    {(p.linked_ids || []).length > 0 && <div className="text-[11px] text-[#4B5320] font-semibold mt-0.5">↳ Desmonta em: {p.linked_ids.map((id) => byId[id]?.name).filter(Boolean).join(" + ")}</div>}
                    {parents.length > 0 && <div className="text-[11px] text-[#9c7209] font-semibold mt-0.5">↳ Vinculado a: {parents.map((x) => x.name).join(", ")}</div>}
                  </td>
                  <td>{catName(p.category_id)}</td>
                  <td><SizeChips sizes={p.sizes} /></td>
                  <td className="font-head font-bold text-base">{(p.sizes || []).reduce((s, x) => s + Number(x.stock || 0), 0)}</td>
                  <td className="whitespace-nowrap">{formatBRL(p.cost)}</td>
                  <td className="whitespace-nowrap">{formatBRL(p.price)}</td>
                  <td>{p.shelf}</td>
                  <td className="whitespace-nowrap">
                    {(p.linked_ids || []).length > 0 && <button className="p-1.5 hover:bg-[#E8E2D5] rounded" title="Desmontar" onClick={() => setDesmontar(p)} data-testid={`desmontar-${p.sku}`}><Scissors size={16} /></button>}
                    <button className="p-1.5 hover:bg-[#E8E2D5] rounded" onClick={() => setEditing(JSON.parse(JSON.stringify(p)))} data-testid={`edit-${p.sku}`}><Pencil size={16} /></button>
                    <button className="p-1.5 hover:bg-red-100 rounded" onClick={() => remove(p.id)} data-testid={`delete-${p.sku}`}><Trash2 size={16} /></button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-neutral-500 py-8">Nenhum produto cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {desmontar && <DesmontarDialog product={desmontar} byId={byId} onClose={() => setDesmontar(null)} onDone={() => { setDesmontar(null); load(); }} />}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto" style={{ background: "#FBF9F4" }}>
          <SheetHeader><SheetTitle className="font-head text-xl">{editing?.id ? "Editar produto" : "Novo produto"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded bg-[#E8E2D5] flex items-center justify-center overflow-hidden">
                  {editing.photo ? <img src={editing.photo} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="text-neutral-500" />}
                </div>
                <label className="lm-btn lm-btn-outline cursor-pointer">Enviar foto<input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files[0])} data-testid="p-photo" /></label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nome *"><input className="lm-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="p-name" /></Field>
                <Field label="SKU *"><input className="lm-input" value={editing.sku} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} data-testid="p-sku" /></Field>
                <Field label="Categoria">
                  <select className="lm-input" value={editing.category_id || ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value, subcategory_id: "" })} data-testid="p-category">
                    <option value="">—</option>{topCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Subcategoria">
                  <select className="lm-input" value={editing.subcategory_id || ""} onChange={(e) => setEditing({ ...editing, subcategory_id: e.target.value })} data-testid="p-subcategory">
                    <option value="">—</option>{subCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Cor"><input className="lm-input" value={editing.color || ""} onChange={(e) => setEditing({ ...editing, color: e.target.value })} data-testid="p-color" /></Field>
                <Field label="Marca"><input className="lm-input" value={editing.brand || ""} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} data-testid="p-brand" /></Field>
                <Field label="Custo (R$)"><input type="number" step="0.01" className="lm-input" value={editing.cost} onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })} data-testid="p-cost" /></Field>
                <Field label="Venda (R$)"><input type="number" step="0.01" className="lm-input" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} data-testid="p-price" /></Field>
                <Field label="Prateleira"><input className="lm-input" value={editing.shelf || ""} onChange={(e) => setEditing({ ...editing, shelf: e.target.value })} data-testid="p-shelf" /></Field>
              </div>

              <div className="lm-card p-3">
                <div className="flex items-center justify-between">
                  <div className="font-head text-sm">Grade de tamanhos {gridObj && <span className="text-xs text-neutral-500">({gridObj.name})</span>}</div>
                  <button type="button" className="lm-btn lm-btn-outline !py-1 !px-2 !text-xs" onClick={() => addSize()} data-testid="p-add-size">+ Tamanho</button>
                </div>
                {gridObj && <div className="flex flex-wrap gap-1 my-2">{gridObj.sizes.map((s) => (
                  <button key={s} type="button" className="chip hover:bg-[#d8cfbc]" onClick={() => addSize(s)} data-testid={`p-grid-${s}`}>+ {s}</button>
                ))}</div>}
                {editing.sizes.length > 0 && <div className="grid grid-cols-4 gap-2 mt-2 font-head text-[11px] text-neutral-600"><span>Tamanho</span><span>Estoque</span><span>Mínimo</span><span></span></div>}
                {editing.sizes.map((s, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 mt-1 items-center">
                    <input className="lm-input" value={s.size} onChange={(e) => setSize(i, { size: e.target.value })} data-testid={`p-size-${i}`} />
                    <input type="number" className="lm-input" value={s.stock} onChange={(e) => setSize(i, { stock: Number(e.target.value) })} data-testid={`p-stock-${i}`} />
                    <input type="number" className="lm-input" value={s.stock_min} onChange={(e) => setSize(i, { stock_min: Number(e.target.value) })} data-testid={`p-min-${i}`} />
                    <button type="button" className="text-red-700 text-xs" onClick={() => setEditing({ ...editing, sizes: editing.sizes.filter((_, x) => x !== i) })}>remover</button>
                  </div>
                ))}
              </div>

              <LinkPicker editing={editing} setEditing={setEditing} products={products} />

              <div className="flex gap-2 pt-2">
                <button className="lm-btn lm-btn-olive" onClick={save} data-testid="save-product">Salvar</button>
                <button className="lm-btn lm-btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
