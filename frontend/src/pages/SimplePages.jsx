import React, { useEffect, useState } from "react";
import { CrudPage } from "@/components/CrudPage";
import { api, formatBRL, formatDateShort } from "@/lib/api";
import { toast } from "sonner";

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
        { key: "distance_km", label: "KM do depósito até o endereço", type: "number" },
      ]}
      columns={[
        { key: "name", label: "NOME / LOJA" }, { key: "cpf", label: "CPF" },
        { key: "phone", label: "TELEFONE" }, { key: "address", label: "ENDEREÇO" }, { key: "distance_km", label: "KM DO DEPÓSITO" },
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
        { key: "distance_km", label: "KM do depósito até o endereço", type: "number" },
        { key: "notes", label: "Observações", type: "textarea", wide: true },
      ]}
      columns={[{ key: "name", label: "NOME" }, { key: "cnpj", label: "CNPJ" }, { key: "phone", label: "TELEFONE" }, { key: "email", label: "E-MAIL" }, { key: "distance_km", label: "KM DO DEPÓSITO" }]} />
  );
}

const total = (rows, fn) => formatBRL(rows.reduce((s, r) => s + fn(r), 0));

export function Vehicles() {
  return (
    <CrudPage title="Veículos" subtitle="Cadastro de veículos e quilometragem acumulada" endpoint="vehicles" testid="vehicles"
      defaults={{ active: true, current_km: 0, avg_consumption: 0 }}
      fields={[
        { key: "name", label: "Nome do veículo", required: true },
        { key: "model", label: "Modelo" },
        { key: "plate", label: "Placa" },
        { key: "fuel_type", label: "Combustível", type: "select", options: ["Gasolina", "Etanol", "Diesel", "GNV"] },
        { key: "avg_consumption", label: "Consumo médio (km/l)", type: "number" },
        { key: "current_km", label: "Quilometragem atual", type: "number" },
        { key: "active", label: "Veículo ativo", type: "checkbox" },
      ]}
      columns={[
        { key: "name", label: "VEÍCULO" }, { key: "model", label: "MODELO" }, { key: "plate", label: "PLACA" },
        { key: "fuel_type", label: "COMBUSTÍVEL" }, { key: "avg_consumption", label: "KM/L" }, { key: "current_km", label: "KM ATUAL" },
        { label: "SITUAÇÃO", render: (vehicle) => vehicle.active === false ? "Inativo" : "Ativo" },
      ]} />
  );
}

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
        { key: "quantity", label: "Quantidade comprada", type: "number", required: true },
        { key: "unit", label: "Unidade (un, m, kg...)" },
        { key: "date", label: "Data", type: "date" },
        { key: "supplier_id", label: "Fornecedor", type: "select", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
      ]}
      columns={[
        { label: "DATA", render: (r) => formatDateShort(r.date) }, { key: "description", label: "DESCRIÇÃO" },
        { label: "FORNECEDOR", render: (r) => supName(r.supplier_id) }, { label: "VALOR", render: (r) => formatBRL(r.amount) },
        { label: "COMPRADO", render: (r) => `${Number(r.quantity || 0)} ${r.unit || ""}` },
        { label: "CONSUMIDO", render: (r) => `${Math.max(Number(r.quantity || 0) - Number(r.remaining_quantity || 0), 0)} ${r.unit || ""}` },
        { label: "RESTANTE", render: (r) => `${Number(r.remaining_quantity || 0)} ${r.unit || ""}` },
      ]}
      rowActions={(row, reload) => (
        <button className="text-xs text-green-800 px-2 py-1" disabled={Number(row.remaining_quantity || 0) <= 0}
          onClick={async () => {
            const raw = window.prompt(`Quantidade usada (restam ${row.remaining_quantity} ${row.unit || ""}):`);
            if (raw === null) return;
            const quantity = Number(raw);
            if (!Number.isFinite(quantity) || quantity <= 0) return toast.error("Informe uma quantidade válida");
            try {
              await api.post(`/expenses/${row.id}/consume`, { quantity });
              toast.success("Consumo registrado");
              reload();
            } catch (error) {
              toast.error(error.response?.data?.detail || "Não foi possível registrar o consumo");
            }
          }}>Consumir</button>
      )}
      footer={(rows) => sumBox("Total em insumos", total(rows, (r) => Number(r.amount || 0)))} />
  );
}

export function Viagens() {
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  useEffect(() => {
    Promise.all([api.get("/customers"), api.get("/suppliers"), api.get("/vehicles")])
      .then(([c, s, v]) => { setCustomers(c.data); setSuppliers(s.data); setVehicles(v.data.filter((vehicle) => vehicle.active !== false)); })
      .catch(() => toast.error("Não foi possível carregar clientes, fornecedores e veículos"));
  }, []);
  const destinationOptions = (editing) => (editing.destination_type === "fornecedor" ? suppliers : customers)
    .map((entry) => ({ value: entry.id, label: entry.name }));
  return (
    <CrudPage title="Viagens & Rotas" subtitle="Registro de rotas, combustível, pedágios e quilometragem fora das entregas" endpoint="expenses" testid="viagens"
      filter={(r) => r.type === "VIAGEM"} defaults={{ type: "VIAGEM", destination_type: "cliente", fuel_type: "Gasolina", date: new Date().toISOString().slice(0, 10) }}
      fields={[
        { key: "destination_type", label: "Tipo de destino", type: "select", options: [{ value: "cliente", label: "Cliente" }, { value: "fornecedor", label: "Fornecedor" }], onChange: (value) => ({ destination_type: value, destination_id: "", km: 0, route: "", description: "" }) },
        { key: "destination_id", label: "Cliente / fornecedor cadastrado", type: "select", options: destinationOptions, onChange: (value, editing) => {
          const entry = (editing.destination_type === "fornecedor" ? suppliers : customers).find((item) => item.id === value);
          return { destination_id: value, km: Number(entry?.distance_km || 0) * 2, route: entry ? `Depósito → ${entry.address || entry.name} → Depósito` : "", description: entry ? `Viagem até ${entry.name}` : "" };
        } },
        { key: "description", label: "Destino / Objetivo", required: true, wide: true },
        { key: "route", label: "Rota (origem → destino)", wide: true },
        { key: "date", label: "Data", type: "date" },
        { key: "vehicle_id", label: "Veículo", type: "select", options: vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.name}${vehicle.plate ? ` · ${vehicle.plate}` : ""}` })), onChange: (value) => ({ vehicle_id: value, avg_consumption: Number(vehicles.find((vehicle) => vehicle.id === value)?.avg_consumption || 0) }) },
        { key: "km", label: "KM rodados (ida e volta)", type: "number" },
        { key: "fuel_type", label: "Combustível", type: "select", options: ["Gasolina", "Etanol", "Diesel", "GNV"] },
        { key: "avg_consumption", label: "Consumo médio (km/l)", type: "number" },
        { key: "fuel_liters", label: "Litros estimados", type: "number", readOnly: true },
        { key: "fuel_price_per_liter", label: "Preço por litro (R$)", type: "number" },
        { key: "fuel_cost", label: "Gasto combustível (R$)", type: "number" },
        { key: "toll_cost", label: "Pedágios (R$)", type: "number" },
        { key: "amount", label: "Outros gastos (R$)", type: "number" },
      ]}
      columns={[
        { label: "DATA", render: (r) => formatDateShort(r.date) }, { key: "description", label: "DESTINO" },
        { key: "route", label: "ROTA" }, { key: "km", label: "KM" },
        { label: "KM NO PAINEL", render: (r) => r.odometer_km ?? "—" },
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
