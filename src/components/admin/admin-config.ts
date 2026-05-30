import type { LucideIcon } from 'lucide-react';
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
  Activity,
  AlertTriangle,
  Siren,
  BarChart2,
  Star,
} from 'lucide-react';

export interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  shortLabel?: string;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: 'Atendimento',
    items: [
      { to: '/admin/conversas', label: 'Conversas', shortLabel: 'Chat', icon: MessageSquare },
      { to: '/admin/agendamentos', label: 'Agendamentos', shortLabel: 'Agenda', icon: Calendar },
      { to: '/admin/chamados', label: 'Chamados', icon: Ticket },
      { to: '/admin/leads', label: 'Leads', icon: UserPlus },
      { to: '/admin/alertas', label: 'Alertas', icon: Siren },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/admin/clientes', label: 'Clientes', icon: Users },
      { to: '/admin/campanhas', label: 'Campanhas', icon: Megaphone },
      { to: '/admin/financeiro', label: 'Financeiro', icon: DollarSign },
      { to: '/admin/rede', label: 'Rede', icon: Wifi },
      { to: '/admin/churn-risks', label: 'Churn Risks', icon: AlertTriangle },
      { to: '/admin/nps', label: 'NPS', icon: Star },
    ],
  },
  {
    title: 'Análise',
    items: [
      { to: '/admin/metricas', label: 'Métricas', icon: Activity },
      { to: '/admin/relatorio-roi', label: 'Relatório ROI', shortLabel: 'ROI', icon: BarChart2 },
      { to: '/admin/configuracoes', label: 'Configurações', shortLabel: 'Config', icon: Settings },
    ],
  },
];

export const ADMIN_MOBILE_QUICK_NAV: AdminNavItem[] = [
  { to: '/admin/conversas', label: 'Conversas', shortLabel: 'Chat', icon: MessageSquare },
  { to: '/admin/agendamentos', label: 'Agendamentos', shortLabel: 'Agenda', icon: Calendar },
  { to: '/admin/alertas', label: 'Alertas', icon: Siren },
  { to: '/admin/metricas', label: 'Métricas', icon: Activity },
];

const PAGE_TITLES: Record<string, string> = {
  '/admin/conversas': 'Conversas',
  '/admin/agendamentos': 'Agendamentos',
  '/admin/chamados': 'Chamados',
  '/admin/leads': 'Leads',
  '/admin/alertas': 'Alertas',
  '/admin/clientes': 'Clientes',
  '/admin/campanhas': 'Campanhas',
  '/admin/financeiro': 'Financeiro',
  '/admin/rede': 'Rede',
  '/admin/churn-risks': 'Churn Risks',
  '/admin/nps': 'NPS',
  '/admin/metricas': 'Métricas',
  '/admin/relatorio-roi': 'Relatório ROI',
  '/admin/configuracoes': 'Configurações',
};

export function getAdminPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path));
  return match?.[1] ?? 'Dashboard';
}

export const ALL_ADMIN_NAV_ITEMS = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
