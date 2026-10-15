import React from "react";
import { formatBRL, formatDateShort } from "@/lib/api";

/**
 * A4 printable layout that MATCHES the referenced invoice:
 * - LOKAL logo top-left, company info top-right
 * - Centered "Pedido #" header
 * - Cliente / Vendedor / Data boxes
 * - Items table: Descrição | Código | Un. | Qtd. | Valor unitário | Valor total
 * - Totals right (Nº itens, Soma Qtdes, Total produtos, Total pedido)
 * - Observações + Trocas/Devoluções if present
 */
export default function PrintOrderA4({ order, settings, customer }) {
  if (!order) return null;
  const items = order.items || [];
  const nItens = items.length;
  const somaQtd = items.reduce((s,i)=>s + Number(i.qty||0), 0);
  const totalProd = items.reduce((s,i)=>s + Number(i.subtotal || (i.qty*i.unit_price) || 0), 0);
  const totalPedido = Number(order.total || totalProd - (order.discount||0));

  return (
    <div className="print-a4" style={{ color: "#000" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #000", paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 90, height: 56, border: "2px solid #4B5320",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Chivo, sans-serif", fontWeight: 800, color: "#4B5320",
            letterSpacing: "0.08em", fontSize: 14, position: "relative"
          }}>
            LOKAL
            <div style={{ position: "absolute", bottom: -2, right: 2, fontSize: 7, letterSpacing: 2, color: "#4B5320" }}>MILITAR</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 10, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700 }}>{settings?.store_full_name || "Lokal Comercio de Artigos do Vestuario LTDA"}</div>
          <div>{settings?.address}</div>
          <div>CNPJ: {settings?.cnpj} · Tel: {settings?.phone} · {settings?.instagram}</div>
        </div>
      </div>

      {/* Pedido N° */}
      <div style={{ textAlign: "center", margin: "10px 0 6px", fontFamily: "Chivo, sans-serif", fontWeight: 700, fontSize: 16 }}>
        Pedido {order.number}
      </div>

      {/* Cliente + Dados do pedido */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Cliente</div>
          <div style={{ border: "1px solid #000", padding: 6, minHeight: 24, fontWeight: 600 }}>
            {order.customer_name || customer?.name || "-"}
          </div>
          {customer?.patente_om && (
            <div style={{ fontSize: 10, marginTop: 2 }}>Patente/OM: {customer.patente_om}</div>
          )}
        </div>
        <table style={{ fontSize: 10 }}>
          <tbody>
            <tr><td>Número do pedido</td><td style={{ fontWeight: 700 }}>{order.number}</td></tr>
            <tr><td>Data</td><td>{formatDateShort(order.created_at)}</td></tr>
            <tr><td>Data prevista</td><td>{order.expected_date ? formatDateShort(order.expected_date) : ""}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Vendedor */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>Vendedor</div>
        <div style={{ border: "1px solid #000", padding: 6 }}>{order.vendor_name || "-"}</div>
      </div>

      {/* Itens */}
      <div style={{ marginTop: 10, fontSize: 10, color: "#555" }}>Itens do pedido de venda</div>
      <table style={{ marginTop: 2 }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={{ textAlign: "left" }}>Descrição do produto/serviço</th>
            <th>Código</th>
            <th>Un.</th>
            <th>Qtd.</th>
            <th>Valor unitário</th>
            <th>Valor total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{(it.name || "").toUpperCase()} {it.size ? `TAMANHO:${it.size}` : ""}</td>
              <td>{it.sku || ""}{it.size ? `;${it.size}` : ""}</td>
              <td style={{ textAlign: "center" }}>{(it.name||"").toUpperCase().includes("PAR") ? "PAR" : (it.name||"").toUpperCase().includes("CONJUNTO") ? "CONJ" : "UN"}</td>
              <td style={{ textAlign: "right" }}>{Number(it.qty||0).toFixed(2)}</td>
              <td style={{ textAlign: "right" }}>{Number(it.unit_price||0).toFixed(2)}</td>
              <td style={{ textAlign: "right" }}>{Number(it.subtotal||it.qty*it.unit_price||0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={5} style={{ textAlign: "right" }}>N° de itens</td><td style={{ textAlign: "right" }}>{nItens.toFixed(2)}</td></tr>
          <tr><td colSpan={5} style={{ textAlign: "right" }}>Soma das Qtdes</td><td style={{ textAlign: "right" }}>{somaQtd.toFixed(2)}</td></tr>
          <tr><td colSpan={5} style={{ textAlign: "right" }}>Total de produtos</td><td style={{ textAlign: "right" }}>{totalProd.toFixed(2)}</td></tr>
          <tr><td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>Total do pedido</td><td style={{ textAlign: "right", fontWeight: 700 }}>{totalPedido.toFixed(2)}</td></tr>
        </tfoot>
      </table>

      {/* Trocas / Devoluções */}
      {(order.returned_items?.length > 0 || order.exchanged_items?.length > 0) && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "#555" }}>Itens Devolvidos / Trocados neste pedido</div>
          <table>
            <thead>
              <tr style={{ background: "#f7f0e0" }}>
                <th style={{ textAlign: "left" }}>Tipo</th>
                <th style={{ textAlign: "left" }}>Produto</th>
                <th>Tam</th><th>Qtd</th><th style={{ textAlign: "left" }}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {(order.returned_items||[]).map((r,i)=>(
                <tr key={"r"+i}><td>DEVOLUÇÃO</td><td>{r.name}</td><td>{r.size}</td><td>{r.qty}</td><td>{r.reason||""}</td></tr>
              ))}
              {(order.exchanged_items||[]).map((r,i)=>(
                <tr key={"e"+i}><td>TROCA</td><td>{r.name}</td><td>{r.size}</td><td>{r.qty}</td><td>{r.reason||""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagamento + Observações */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "#555" }}>Forma de Pagamento</div>
          <div style={{ border: "1px solid #000", padding: 6 }}>{order.payment}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#555" }}>Desconto</div>
          <div style={{ border: "1px solid #000", padding: 6 }}>{formatBRL(order.discount||0)}</div>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, color: "#555" }}>Observações</div>
        <div style={{ border: "1px solid #000", padding: 6, minHeight: 36 }}>{order.notes || ""}</div>
      </div>

      {/* Assinaturas */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 36, fontSize: 10, textAlign: "center" }}>
        <div><div style={{ borderTop: "1px solid #000", paddingTop: 2 }}>Assinatura do Cliente</div></div>
        <div><div style={{ borderTop: "1px solid #000", paddingTop: 2 }}>Assinatura do Vendedor</div></div>
      </div>

      <div style={{ marginTop: 20, textAlign: "center", fontSize: 9, color: "#555" }}>
        {settings?.print_footer_text || "Obrigado pela preferência! - Lokal Militar"}
      </div>
    </div>
  );
}

export function PrintOrder80mm({ order, settings }) {
  if (!order) return null;
  return (
    <div className="print-80">
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13 }}>LOKAL MILITAR</div>
      <div style={{ textAlign: "center", fontSize: 10 }}>{settings?.store_subtitle}</div>
      <div style={{ textAlign: "center", fontSize: 9 }}>CNPJ {settings?.cnpj}</div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }}></div>
      <div>Pedido: <b>#{order.number}</b></div>
      <div>Data: {formatDateShort(order.created_at)}</div>
      <div>Cliente: {order.customer_name || "-"}</div>
      <div>Vendedor: {order.vendor_name || "-"}</div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }}></div>
      {(order.items||[]).map((it,i)=>(
        <div key={i} style={{ marginBottom: 2 }}>
          <div>{it.name} {it.size?`T:${it.size}`:""}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{it.qty} x {Number(it.unit_price||0).toFixed(2)}</span>
            <span>{Number(it.subtotal||it.qty*it.unit_price||0).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }}></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
        <span>TOTAL</span><span>{formatBRL(order.total||0)}</span>
      </div>
      <div>Forma: {order.payment}</div>
      {settings?.pix_key && (
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 9 }}>
          PIX: {settings.pix_key}
        </div>
      )}
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }}></div>
      <div style={{ textAlign: "center", fontSize: 9 }}>Obrigado pela preferência!</div>
    </div>
  );
}
