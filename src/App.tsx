import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AIBotContext } from "./contexts/AIBotContext";
import AIBotWidget from "./components/AIBotWidget";
import Home from "./pages/Home";
import Plans from "./pages/Plans";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Cobertura from "./pages/Cobertura";
import Suporte from "./pages/Suporte";
import Hotspots from "./pages/Hotspots";
import TrabalheConosco from "./pages/TrabalheConosco";
import NotFound from "./pages/NotFound";
import ClientLogin from "./pages/ClientLogin";
import ClientPortal from "./pages/ClientPortal";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import Conversations from "./pages/admin/Conversations";
import Metrics from "./pages/admin/Metrics";
import CampaignManager from "./pages/admin/CampaignManager";
import ChurnRiskList from "./pages/admin/ChurnRiskList";
import Alerts from "./pages/admin/Alerts";
import { ClientesPage, FinanceiroPage, RedePage } from "./pages/admin/Placeholders";
import ConfiguracoesPage from "./pages/admin/ConfiguracoesPage";
import Reports from "./pages/admin/Reports";
import SchedulesPage from "./pages/admin/Schedules";
import Leads from "./pages/admin/Leads";
import Tickets from "./pages/admin/Tickets";
import Nps from "./pages/admin/Nps";
import { getAdminToken } from "./lib/adminAuth";

const queryClient = new QueryClient();

function AdminGuard() {
  return getAdminToken() ? <AdminLayout /> : <Navigate to="/admin/login" replace />;
}

const App = () => {
  const [aiIsOpen, setAiIsOpen] = useState(false);

  return (
    <AIBotContext.Provider value={{ isOpen: aiIsOpen, setIsOpen: setAiIsOpen }}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/planos" element={<Plans />} />
              <Route path="/cobertura" element={<Cobertura />} />
              <Route path="/suporte" element={<Suporte />} />
              <Route path="/hotspots" element={<Hotspots />} />
              <Route path="/trabalhe-conosco" element={<TrabalheConosco />} />
              <Route path="/contato" element={<Contact />} />
              <Route path="/sobre" element={<About />} />
              <Route path="/minha-conta/login" element={<ClientLogin />} />
              <Route path="/minha-conta" element={<ClientPortal />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/*" element={<AdminGuard />}>
                <Route path="conversas" element={<Conversations />} />
                <Route path="clientes" element={<ClientesPage />} />
                <Route path="leads" element={<Leads />} />
                <Route path="chamados" element={<Tickets />} />
                <Route path="campanhas" element={<CampaignManager />} />
                <Route path="financeiro" element={<FinanceiroPage />} />
                <Route path="rede" element={<RedePage />} />
                <Route path="configuracoes" element={<ConfiguracoesPage />} />
                <Route path="churn-risks" element={<ChurnRiskList />} />
                <Route path="alertas" element={<Alerts />} />
                <Route path="nps" element={<Nps />} />
                <Route path="metricas" element={<Metrics />} />
                <Route path="agendamentos" element={<SchedulesPage />} />
                <Route path="relatorio-roi" element={<Reports />} />
                <Route path="" element={<Conversations />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <AIBotWidget />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </AIBotContext.Provider>
  );
};

export default App;
