export interface PublicPlan {
  name: string;
  speedMbps: number;
  priceMonthly: number;
  popular?: boolean;
  tagline: string;
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    name: '400 Mega',
    speedMbps: 400,
    priceMonthly: 79.99,
    tagline: 'Streaming e home office',
  },
  {
    name: '500 Mega',
    speedMbps: 500,
    priceMonthly: 89.99,
    popular: true,
    tagline: 'HD, jogos e família',
  },
  {
    name: '700 Mega',
    speedMbps: 700,
    priceMonthly: 109.99,
    tagline: '4K, gaming e vários dispositivos',
  },
];

export const INSTALLATION_FEE = 50;
export const TV_ADDON_PRICE = 30;

export function formatBrl(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function plansListText(): string {
  const lines = PUBLIC_PLANS.map((p) => {
    const badge = p.popular ? ' (Mais Popular)' : '';
    return `📶 **${p.name}** - R$ ${formatBrl(p.priceMonthly)}/mês${badge}`;
  });
  return lines.join('\n');
}
