import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare,
  Calendar,
  Users,
  UserPlus,
  Ticket,
  Megaphone,
  DollarSign,
  Wifi,
  Settings,
  LogOut,
  Activity,
  AlertTriangle,
  Siren,
  BarChart2,
  Star,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { getAdminUser, clearAdminSession } from '@/lib/adminAuth';
import { adminApi } from '@/api/admin';

const items = [
  { to: '/admin/conversas', label: 'Conversas', icon: MessageSquare },
  { to: '/admin/agendamentos', label: 'Agendamentos', icon: Calendar },
  { to: '/admin/chamados', label: 'Chamados', icon: Ticket },
  { to: '/admin/leads', label: 'Leads', icon: UserPlus },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/admin/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/admin/rede', label: 'Rede', icon: Wifi },
  { to: '/admin/metricas', label: 'Métricas', icon: Activity },
  { to: '/admin/alertas', label: 'Alertas', icon: Siren },
  { to: '/admin/churn-risks', label: 'Churn Risks', icon: AlertTriangle },
  { to: '/admin/nps', label: 'NPS', icon: Star },
  { to: '/admin/relatorio-roi', label: 'Relatório ROI', icon: BarChart2 },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];

interface SidebarContentProps {
  email?: string;
  onNavigate?: () => void;
  onLogout: () => void;
  alertCount: number;
}

function SidebarContent({ email, onNavigate, onLogout, alertCount }: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">SalesNet Admin</p>
        <h1 className="text-xl font-bold mt-1">Dashboard</h1>
        {email && <p className="text-xs text-muted-foreground mt-2">{email}</p>}
      </div>
      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-accent/20 text-accent' : 'hover:bg-muted/50'}`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/admin/alertas' && alertCount > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                  {alertCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <Button onClick={onLogout} variant="outline" className="w-full mt-8">
        <LogOut className="h-4 w-4 mr-2" />
        Sair
      </Button>
    </div>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getAdminUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const alerts = useQuery({
    queryKey: ['admin-alerts-count'],
    queryFn: () => adminApi.getAlerts('open'),
    refetchInterval: 5 * 60 * 1000,
  });
  const alertCount = alerts.data?.openCount ?? 0;

  function logout() {
    clearAdminSession();
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        {/* ── Sidebar desktop ──────────────────────────────────────────── */}
        <aside className="w-64 border-r border-border/50 p-4 hidden md:block">
          <SidebarContent email={user?.email} onLogout={logout} alertCount={alertCount} />
        </aside>

        <div className="flex flex-1 flex-col min-w-0">
          {/* ── Header mobile com hambúrguer ───────────────────────────── */}
          <header className="flex items-center justify-between border-b border-border/50 p-4 md:hidden">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">SalesNet Admin</p>
              <h1 className="text-lg font-bold leading-tight">Dashboard</h1>
            </div>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SidebarContent
                  email={user?.email}
                  onNavigate={() => setMobileOpen(false)}
                  onLogout={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                  alertCount={alertCount}
                />
              </SheetContent>
            </Sheet>
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
