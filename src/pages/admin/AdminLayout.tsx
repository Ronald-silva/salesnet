import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { MessageSquare, Users, Megaphone, DollarSign, Wifi, Settings, LogOut, Activity, AlertTriangle, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAdminUser, clearAdminSession } from '@/lib/adminAuth';

const items = [
  { to: '/admin/conversas', label: 'Conversas', icon: MessageSquare },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/admin/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/admin/rede', label: 'Rede', icon: Wifi },
  { to: '/admin/metricas', label: 'Métricas', icon: Activity },
  { to: '/admin/churn-risks', label: 'Churn Risks', icon: AlertTriangle },
  { to: '/admin/relatorio-roi', label: 'Relatório ROI', icon: BarChart2 },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getAdminUser();

  function logout() {
    clearAdminSession();
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-border/50 p-4 hidden md:block">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">SalesNet Admin</p>
            <h1 className="text-xl font-bold mt-1">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-2">{user?.email}</p>
          </div>
          <nav className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-accent/20 text-accent' : 'hover:bg-muted/50'}`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <Button onClick={logout} variant="outline" className="w-full mt-8">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </aside>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
