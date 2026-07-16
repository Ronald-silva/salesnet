import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AIBotContext } from "./contexts/AIBotContext";
import AIBotWidget from "./components/AIBotWidget";
import { getAdminToken } from "./lib/adminAuth";

const Home = lazy(() => import("./pages/Home"));
const Plans = lazy(() => import("./pages/Plans"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Cobertura = lazy(() => import("./pages/Cobertura"));
const Suporte = lazy(() => import("./pages/Suporte"));
const Hotspots = lazy(() => import("./pages/Hotspots"));
const TrabalheConosco = lazy(() => import("./pages/TrabalheConosco"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ClientLogin = lazy(() => import("./pages/ClientLogin"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const Conversations = lazy(() => import("./pages/admin/Conversations"));
const Metrics = lazy(() => import("./pages/admin/Metrics"));
const CampaignManager = lazy(() => import("./pages/admin/CampaignManager"));
const ChurnRiskList = lazy(() => import("./pages/admin/ChurnRiskList"));
const Alerts = lazy(() => import("./pages/admin/Alerts"));
const ClientesPage = lazy(() => import("./pages/admin/Placeholders").then((module) => ({ default: module.ClientesPage })));
const FinanceiroPage = lazy(() => import("./pages/admin/Placeholders").then((module) => ({ default: module.FinanceiroPage })));
const RedePage = lazy(() => import("./pages/admin/Placeholders").then((module) => ({ default: module.RedePage })));
const ConfiguracoesPage = lazy(() => import("./pages/admin/ConfiguracoesPage"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const SchedulesPage = lazy(() => import("./pages/admin/Schedules"));
const Leads = lazy(() => import("./pages/admin/Leads"));
const Tickets = lazy(() => import("./pages/admin/Tickets"));
const Nps = lazy(() => import("./pages/admin/Nps"));
const BillingQueue = lazy(() => import("./pages/admin/BillingQueue"));

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
            <Suspense fallback={<div className="min-h-screen bg-background" aria-label="Carregando página" />}>
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
                <Route path="regua-cobranca" element={<BillingQueue />} />
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
            </Suspense>
            <AIBotWidget />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </AIBotContext.Provider>
  );
};

export default App;
