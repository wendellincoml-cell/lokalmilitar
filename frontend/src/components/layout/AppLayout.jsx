import React, { useState } from "react";
import { Outlet, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import BrandMark from "@/components/BrandMark";
import {
  LayoutDashboard, Package, Boxes, ShoppingCart, Repeat, Users, Tag, Truck,
  Wrench, Fuel, DollarSign, Settings, LogOut, Menu, X, Car
} from "lucide-react";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/pedidos", label: "Pedidos & PDV", icon: ShoppingCart },
  { to: "/trocas", label: "Trocas/Devoluções", icon: Repeat },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/categorias", label: "Categorias", icon: Tag },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck },
  { to: "/veiculos", label: "Veículos", icon: Car },
  { to: "/comissoes", label: "Comissões", icon: DollarSign },
  { to: "/insumos", label: "Insumos", icon: Package },
  { to: "/viagens", label: "Viagens & Rotas", icon: Fuel },
  { to: "/manutencao", label: "Manutenção Veículo", icon: Wrench },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (user === undefined) return <div className="p-8 font-mono">Carregando...</div>;
  if (user === null) return <Navigate to="/login" replace />;

  return (
    <div className="App flex" style={{ minHeight: "100vh" }}>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[#111] text-white flex items-center justify-between px-3 h-12 no-print">
        <button onClick={()=>setOpen(!open)} data-testid="mobile-menu-toggle">
          {open ? <X size={20}/> : <Menu size={20}/>}
        </button>
        <div className="lokal-stencil text-sm">LOKAL MILITAR</div>
        <button onClick={logout} aria-label="Sair"><LogOut size={18}/></button>
      </div>

      <aside className={`lokal-sidebar no-print ${open ? "block" : "hidden"} md:block fixed md:static z-30 top-12 md:top-0 left-0 w-64 md:min-h-screen`}>
        <div className="hidden md:block px-4 py-4 border-b border-neutral-800" data-testid="sidebar-logo">
          <div className="flex items-center justify-center">
            <BrandMark align="center" compact />
          </div>
        </div>
        <nav className="py-2">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              onClick={()=>setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium ${isActive ? "active" : "text-neutral-300"}`
              }
              data-testid={`nav-${it.to.replace("/", "") || "dashboard"}`}>
              <it.icon size={16} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-neutral-800 mt-4">
          <div className="text-[11px] font-mono text-neutral-400">{user?.name}</div>
          <div className="text-[10px] text-neutral-600 uppercase">{user?.role}</div>
          <button onClick={logout} className="mt-3 text-xs font-mono text-neutral-400 hover:text-white flex items-center gap-1" data-testid="btn-logout">
            <LogOut size={12}/> SAIR
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 pt-16 md:pt-6" style={{ background: "var(--system-bg-color)" }}>
        <Outlet />
      </main>
    </div>
  );
}
