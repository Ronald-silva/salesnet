import { Button } from '@/components/ui/button';
import { Wifi, Check } from 'lucide-react';
import { formatBrl, INSTALLATION_FEE, type PublicPlan } from '@/data/plans';

interface PlanCardProps {
  plan: PublicPlan;
  features?: string[];
  onContract: () => void;
  variant?: 'home' | 'page';
}

const PlanCard = ({ plan, features, onContract, variant = 'home' }: PlanCardProps) => {
  const isPage = variant === 'page';
  const defaultFeatures = [
    'Fibra óptica ilimitada',
    'WiFi incluso',
    'Suporte via WhatsApp 24h',
    `Taxa de instalação R$ ${formatBrl(INSTALLATION_FEE)}`,
    plan.tagline,
  ];
  const list = features ?? defaultFeatures;

  return (
    <div
      className={`rounded-lg p-6 ${isPage ? 'bg-card p-8' : 'bg-background'} ${
        plan.popular ? 'border-2 border-accent' : 'border border-accent/20'
      } relative hover:shadow-card-hover transition-all`}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-accent text-accent-foreground rounded-full text-sm font-bold">
          Mais Popular
        </div>
      )}
      <div className="text-center mb-6">
        {isPage && <Wifi className="h-12 w-12 text-accent mx-auto mb-4" />}
        <h3
          className={`font-heading font-bold mb-2 ${
            isPage ? 'text-2xl text-card-foreground' : 'text-2xl text-foreground'
          }`}
        >
          {plan.name}
        </h3>
        <div className={`font-bold text-accent mb-1 ${isPage ? 'text-4xl' : 'text-3xl'}`}>
          R$ {formatBrl(plan.priceMonthly)}
        </div>
        <p className="text-xs text-muted-foreground">/mês</p>
      </div>
      {isPage ? (
        <ul className="space-y-3 mb-8">
          {list.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-accent flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2 mb-6">
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wifi className="h-4 w-4 text-accent" />
            {plan.tagline}
          </li>
        </ul>
      )}
      <Button
        variant={plan.popular ? 'cta' : 'outline'}
        className="w-full"
        onClick={onContract}
      >
        {isPage ? 'Contratar Agora' : 'Contratar via Bot'}
      </Button>
    </div>
  );
};

export default PlanCard;
