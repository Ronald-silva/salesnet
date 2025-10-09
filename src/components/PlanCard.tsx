import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlanCardProps {
  name: string;
  speed: string;
  price: string;
  discountPrice: string;
  features: string[];
  isPopular?: boolean;
}

const PlanCard = ({ name, speed, price, discountPrice, features, isPopular = false }: PlanCardProps) => {
  return (
    <div
      className={cn(
        "relative bg-card rounded-lg p-6 shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1",
        isPopular && "border-2 border-cta"
      )}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cta text-cta-foreground px-4 py-1 rounded-full text-sm font-semibold">
          Mais Procurado
        </div>
      )}

      <div className="text-center mb-6">
        <h3 className="text-2xl font-heading font-bold text-card-foreground mb-2">
          {name}
        </h3>
        <div className="text-5xl font-heading font-bold text-secondary mb-2">
          {speed}
        </div>
        <p className="text-sm text-muted-foreground">Mbps</p>
      </div>

      <div className="text-center mb-6">
        <div className="text-3xl font-bold text-card-foreground mb-1">
          R$ {price}
          <span className="text-base font-normal text-muted-foreground">/mês</span>
        </div>
        <div className="bg-gradient-card rounded-lg p-3 mt-3">
          <p className="text-sm font-semibold text-cta">
            Com desconto: R$ {discountPrice}/mês
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            (pagamento até o vencimento)
          </p>
        </div>
      </div>

      <ul className="space-y-3 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start space-x-2">
            <Check className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
            <span className="text-sm text-card-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      <a href="https://wa.me/5585996032957" target="_blank" rel="noopener noreferrer" className="block">
        <Button
          variant={isPopular ? "cta" : "secondary"}
          className="w-full"
          size="lg"
        >
          Contratar Agora
        </Button>
      </a>
    </div>
  );
};

export default PlanCard;
