import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Menu, MoreHorizontal, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getAdminUser, clearAdminSession } from '@/lib/adminAuth';
import { adminApi } from '@/api/admin';
import {
  ADMIN_MOBILE_QUICK_NAV,
  ADMIN_NAV_GROUPS,
  getAdminPageTitle,
} from '@/components/admin/admin-config';
import { cn } from '@/lib/utils';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface SidebarContentProps {
  email?: string;
  onNavigate?: () => void;
  onLogout: () => void;
  alertCount: number;
  soundEnabled: boolean;
  toggleSound: () => void;
}

function NavItem({
  to,
  label,
  icon: Icon,
  onNavigate,
  alertCount,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  onNavigate?: () => void;
  alertCount: number;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors min-h-[44px]',
          isActive
            ? 'bg-accent/20 text-accent border border-accent/25'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent',
        )
      }
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {to === '/admin/alertas' && alertCount > 0 && (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
          {alertCount}
        </span>
      )}
    </NavLink>
  );
}

function SidebarContent({ email, onNavigate, onLogout, alertCount, soundEnabled, toggleSound }: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 shrink-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          SalesNet Admin
        </p>
        <h2 className="text-lg font-bold mt-1">Menu</h2>
        {email && <p className="text-xs text-muted-foreground mt-1 truncate">{email}</p>}
      </div>

      <nav className="flex-1 overflow-y-auto space-y-6 pr-1 -mr-1">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  onNavigate={onNavigate}
                  alertCount={alertCount}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 shrink-0 space-y-2">
        <button
          type="button"
          onClick={toggleSound}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
            soundEnabled
              ? 'border-blue-700/40 text-blue-400 bg-blue-950/30 hover:bg-blue-950/50'
              : 'border-gray-700 text-gray-500 bg-gray-800/30 hover:bg-gray-800/50',
          )}
        >
          {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          Notificações sonoras: {soundEnabled ? 'ativadas' : 'desativadas'}
        </button>
        <Button onClick={onLogout} variant="outline" className="w-full min-h-[44px]">
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getAdminUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { soundEnabled, toggleSound } = useNotificationSound();

  const pageTitle = getAdminPageTitle(location.pathname);

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
        <aside className="w-64 border-r border-border/50 p-4 hidden lg:block shrink-0">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">SalesNet Admin</p>
            <h1 className="text-xl font-bold mt-1">Dashboard</h1>
            {user?.email && <p className="text-xs text-muted-foreground mt-2 truncate">{user.email}</p>}
          </div>
          <nav className="space-y-6">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                      alertCount={alertCount}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-8 space-y-2">
            <button
              type="button"
              onClick={toggleSound}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                soundEnabled
                  ? 'border-blue-700/40 text-blue-400 bg-blue-950/30 hover:bg-blue-950/50'
                  : 'border-gray-700 text-gray-500 bg-gray-800/30 hover:bg-gray-800/50',
              )}
            >
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              Som: {soundEnabled ? 'ativado' : 'desativado'}
            </button>
            <Button onClick={logout} variant="outline" className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </aside>

        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 safe-top">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  SalesNet
                </p>
                <h1 className="text-lg font-bold leading-tight truncate">{pageTitle}</h1>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 h-11 w-11"
                aria-label="Abrir menu"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 py-4 sm:px-5 sm:py-5 lg:p-6 pb-24 lg:pb-6 max-w-6xl mx-auto w-full overflow-x-hidden">
            <Outlet />
          </main>

          <nav
            className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] lg:hidden"
            aria-label="Navegação principal"
          >
            <div className="grid grid-cols-5 h-16">
              {ADMIN_MOBILE_QUICK_NAV.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium min-h-[44px] transition-colors',
                      isActive ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    <span className="relative">
                      <Icon className="h-5 w-5" />
                      {item.to === '/admin/alertas' && alertCount > 0 && (
                        <span className="absolute -top-1 -right-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                          {alertCount > 9 ? '9+' : alertCount}
                        </span>
                      )}
                    </span>
                    <span className="truncate max-w-[4.5rem]">{item.shortLabel ?? item.label}</span>
                  </NavLink>
                );
              })}
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground min-h-[44px]"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span>Mais</span>
              </button>
            </div>
          </nav>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-[min(100vw-2rem,20rem)] p-0 flex flex-col">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu de navegação</SheetTitle>
                <SheetDescription>Acesso às seções do painel administrativo</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col p-5 pt-12 overflow-hidden">
                <SidebarContent
                  email={user?.email}
                  onNavigate={() => setMobileOpen(false)}
                  onLogout={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                  alertCount={alertCount}
                  soundEnabled={soundEnabled}
                  toggleSound={toggleSound}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
