import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Stock from "@/pages/Stock";
import Orders from "@/pages/Orders";
import Commissions from "@/pages/Commissions";
import Settings from "@/pages/Settings";
import { Customers, Categories, Suppliers, Insumos, Viagens, Manutencao } from "@/pages/SimplePages";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/produtos" element={<Products />} />
            <Route path="/estoque" element={<Stock />} />
            <Route path="/pedidos" element={<Orders />} />
            <Route path="/trocas" element={<Orders mode="trocas" />} />
            <Route path="/clientes" element={<Customers />} />
            <Route path="/categorias" element={<Categories />} />
            <Route path="/fornecedores" element={<Suppliers />} />
            <Route path="/comissoes" element={<Commissions />} />
            <Route path="/insumos" element={<Insumos />} />
            <Route path="/viagens" element={<Viagens />} />
            <Route path="/manutencao" element={<Manutencao />} />
            <Route path="/configuracoes" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </AuthProvider>
  );
}

export default App;
