export const DASHBOARD_KPIS = [
  { id: "orders_today", label: "Pedidos hoje" },
  { id: "pending", label: "Pedidos pendentes" },
  { id: "customers", label: "Clientes" },
  { id: "commission_month", label: "Comissão do mês" },
  { id: "low_stock", label: "Estoque baixo" },
  { id: "insumos", label: "Gastos insumos (mês)" },
  { id: "maintenance", label: "Manutenção veículo" },
];

export const DASHBOARD_COLORS = {
  background: "#F5F0E6",
  card_background: "#FBF9F4",
  card_text: "#222222",
  card_border: "#D9D2C3",
  chart_line: "#4B5320",
  chart_accent: "#B8860B",
  chart_grid: "#E6DFCF",
};

export const DEFAULT_DASHBOARD_PREFERENCES = {
  visibility: {},
  order: [],
  chart_type: "linha",
  chart_days: 7,
  colors: DASHBOARD_COLORS,
};

export function mergeDashboardPreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...DEFAULT_DASHBOARD_PREFERENCES,
      visibility: {},
      order: [],
      colors: { ...DASHBOARD_COLORS },
    };
  }
  return {
    ...DEFAULT_DASHBOARD_PREFERENCES,
    ...value,
    visibility: { ...DEFAULT_DASHBOARD_PREFERENCES.visibility, ...value.visibility },
    order: Array.isArray(value.order) ? value.order : [],
    chart_type: value.chart_type === "barras" ? "barras" : "linha",
    chart_days: [7, 14, 30].includes(value.chart_days) ? value.chart_days : 7,
    colors: { ...DASHBOARD_COLORS, ...value.colors },
  };
}
