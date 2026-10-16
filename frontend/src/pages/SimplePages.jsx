import React, { useEffect, useState } from "react";
import { CrudPage } from "@/components/CrudPage";
import { api, formatBRL, formatDateShort } from "@/lib/api";

const sumBox = (label, value) => (
  <div className="lokal-panel p-3 mt-3 text-right font-mono text-sm" data-testid="total-box">{label}: <b>{value}</b></div>
);

export function Customers() {
  return (
    <CrudPage title="Clientes" subtitle="Cadastro de clientes militares e lojas" endpoint="customers" testid="customers"
      fields={[
        { key: "name", label: "Nome / Loja", required: true, wide: true },
        { key: "cpf", label: "CPF / CNPJ" },
        { key: "phone", label: "Telefone" },
        { key: "address", label: "Endereço", wide: true },
      ]}
      columns={[
        { key: "name", label: "NOME / LOJA" }, { key: "cpf", label: "CPF" },
        { key: "phone", label: "TELEFONE" }, { key: "address", label: "ENDEREÇO" },
      ]} />
  );
}

export function Categories() {
  const [cats, setCats] = useState([]);
  useEffect(() => { api.get("/categories").then((r) => setCats(r.data)); }, []);
  const parentName = (id) => cats.find((c) => c.id === id)?.name || "";
  return (
    <CrudPage title="Categorias" subtitle="Categorias e subcategorias com cor, ícone e grade" endpoint="categories" testid="categories"
      defaults={{ color: "#4B5320", icon: "Package" }}
      fields={[
        { key: "name", label: "Nome", required: true },
        { key: "parent_id", label: "Subcategoria de", type: "select", options: cats.filter((c) => !c.parent_id).map((c) => ({ value: c.id, label: c.name })) },
        { key: "color", label: "Cor", type: "color" },
        { key: "icon", label: "Ícone", type: "select", options: ["Package", "Shirt", "Footprints", "Award", "Star", "Shield"] },
        { key: "size_grid", label: "Grade de tamanhos", type: "select", options: ["ROUPA", "CALCADOS"] },
      ]}
      columns={[
        { label: "COR", render: (r) => <span className="inline-block w-4 h-4 border" style={{ background: r.color }} /> },
        { key: "name", label: "NOME" }, { label: "SUBCATEGORIA DE", render: (r) => parentName(r.parent_id) }, { key: "icon", label: "ÍCONE" }, { key: "size_grid", label: "GRADE" },
      ]} />
  );
}

export function Suppliers() {
  return (
    <CrudPage title="Fornecedores" endpoint="suppliers" testid="suppliers"
      fields={[
        { key: "name", label: "Nome", required: true }, { key: "cnpj", label: "CNPJ" },
        { key: "phone", label: "Telefone" }, { key: "email", label: "E-mail" },
        { key: "notes", label: "Observações", type: "textarea", wide: true },
      ]}
      columns={[{ key: "name", label: "NOME" }, { key: "cnpj", label: "CNPJ" }, { key: "phone", label: "TELEFONE" }, { key: "email", label: "E-MAIL" }]} />
  );
}

const total = (rows, fn) => formatBRL(rows.reduce((s, r) => s + fn(r), 0));

export function Insumos() {
  const [suppliers, setSuppliers] = useState([]);
  useEffect(() => { api.get("/suppliers").then((r) => setSuppliers(r.data)); }, []);
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || "-";
  return (
    <CrudPage title="Insumos" subtitle="Linhas, botões, tecidos, embalagens e outros gastos" endpoint="expenses" testid="insumos"
      filter={(r) => r.type === "INSUMO"} defaults={{ type: "INSUMO", date: new Date().toISOString().slice(0, 10) }}
      fields={[
        { key: "description", label: "Descrição", required: true, wide: true },
        { key: "amount", label: "Valor (R$)", type: "number", required: true },
        { key: "date", label: "Data", type: "date" },
        { key: "supplier_id", label: "Fornecedor", type: "select", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
      ]}
      columns={[
        { label: "DATA", render: (r) => formatDateShort(r.date) }, { key: "description", label: "DESCRIÇÃO" },
        { label: "FORNECEDOR", render: (r) => supName(r.supplier_id) }, { label: "VALOR", render: (r) => formatBRL(r.amount) },
      ]}
      footer={(rows) => sumBox("Total em insumos", total(rows, (r) => Number(r.amount || 0)))} />
  );
}

export function Viagens() {
  return (
    <CrudPage title="Viagens & Rotas" subtitle="Registro textual de rotas, combustível e pedágios" endpoint="expenses" testid="viagens"
      filter={(r) => r.type === "VIAGEM"} defaults={{ type: "VIAGEM", fuel_type: "Gasolina", date: new Date().toISOString().slice(0, 10) }}
      fields={[
        { key: "description", label: "Destino / Objetivo", required: true, wide: true },
        { key: "route", label: "Rota (origem → destino)", wide: true },
        { key: "date", label: "Data", type: "date" },
        { key: "km", label: "KM rodados", type: "number" },
        { key: "fuel_type", label: "Combustível", type: "select", options: ["Gasolina", "Etanol", "Diesel", "GNV"] },
        { key: "avg_consumption", label: "Consumo médio (km/l)", type: "number" },
        { key: "fuel_cost", label: "Gasto combustível (R$)", type: "number" },
        { key: "toll_cost", label: "Pedágios (R$)", type: "number" },
        { key: "amount", label: "Outros gastos (R$)", type: "number" },
      ]}
      columns={[
        { label: "DATA", render: (r) => formatDateShort(r.date) }, { key: "description", label: "DESTINO" },
        { key: "route", label: "ROTA" }, { key: "km", label: "KM" },
        { label: "COMBUSTÍVEL", render: (r) => formatBRL(r.fuel_cost) }, { label: "PEDÁGIOS", render: (r) => formatBRL(r.toll_cost) },
        { label: "TOTAL", render: (r) => formatBRL(Number(r.fuel_cost || 0) + Number(r.toll_cost || 0) + Number(r.amount || 0)) },
      ]}
      footer={(rows) => sumBox("Total em viagens", total(rows, (r) => Number(r.fuel_cost || 0) + Number(r.toll_cost || 0) + Number(r.amount || 0)))} />
  );
}

export function Manutencao() {
  return (
    <CrudPage title="Manutenção Veículo" subtitle="Revisões, trocas de óleo, pneus e reparos" endpoint="expenses" testid="manutencao"
      filter={(r) => r.type === "MANUTENCAO"} defaults={{ type: "MANUTENCAO", date: new Date().toISOString().slice(0, 10) }}
      fields={[
        { key: "description", label: "Serviço", required: true, wide: true },
        { key: "vehicle_model", label: "Veículo / Modelo" }, { key: "plate", label: "Placa" },
        { key: "km", label: "KM atual", type: "number" }, { key: "amount", label: "Valor (R$)", type: "number", required: true },
        { key: "date", label: "Data", type: "date" }, { key: "next_review_date", label: "Próxima revisão", type: "date" },
      ]}
      columns={[
        { label: "DATA", render: (r) => formatDateShort(r.date) }, { key: "description", label: "SERVIÇO" },
        { key: "vehicle_model", label: "VEÍCULO" }, { key: "plate", label: "PLACA" }, { key: "km", label: "KM" },
        { label: "VALOR", render: (r) => formatBRL(r.amount) }, { label: "PRÓX. REVISÃO", render: (r) => formatDateShort(r.next_review_date) },
      ]}
      footer={(rows) => sumBox("Total em manutenção", total(rows, (r) => Number(r.amount || 0)))} />
  );
}
