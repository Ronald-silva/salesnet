import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIBotWidget from "@/components/AIBotWidget";
import { Button } from "@/components/ui/button";
import { Wifi, Check } from "lucide-react";

const Plans = () => {
  const plans = [
    {
      name: "100 Mega",
      speed: 100,
      price: "79,90",
      features: ["FTTH Ilimitado", "WiFi incluso", "Suporte IA 24h", "Instalação grátis", "Sem fidelidade"],
    },
    {
      name: "300 Mega",
      speed: 300,
      price: "99,90",
      features: ["FTTH Ilimitado", "WiFi premium", "Suporte prioritário", "Instalação grátis", "Streaming 4K"],
      popular: true,
    },
    {
      name: "500 Mega",
      speed: 500,
      price: "129,90",
      features: ["FTTH Ilimitado", "WiFi ultra", "Suporte VIP", "Instalação grátis", "Home office Pro"],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AIBotWidget />

      <section className="bg-gradient-hero py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-heading font-bold text-foreground mb-4">Nossos Planos</h1>
          <p className="text-xl text-muted-foreground">Escolha o ideal para você em Vila Velha</p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, i) => (
              <div key={i} className={`bg-card rounded-lg p-8 ${plan.popular ? 'border-2 border-accent' : 'border border-accent/20'} relative hover:shadow-card-hover transition-all`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-accent text-accent-foreground rounded-full text-sm font-bold">
                    Mais Popular
                  </div>
                )}
                <div className="text-center mb-6">
                  <Wifi className="h-12 w-12 text-accent mx-auto mb-4" />
                  <h3 className="text-2xl font-heading font-bold text-card-foreground mb-2">{plan.name}</h3>
                  <div className="text-5xl font-bold text-accent mb-2">R$ {plan.price}</div>
                  <p className="text-sm text-muted-foreground">por mês</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-accent flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button variant={plan.popular ? "cta" : "outline"} className="w-full">
                  Contratar Agora
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center max-w-3xl mx-auto bg-card rounded-lg p-8 border border-accent/20">
            <h3 className="text-2xl font-heading font-bold text-card-foreground mb-4">Como Comprar?</h3>
            <ol className="space-y-4 text-left text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold text-sm">1</span>
                <div>
                  <strong className="text-foreground">Consulte seu CEP</strong> via bot ou WhatsApp
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold text-sm">2</span>
                <div>
                  <strong className="text-foreground">Escolha seu plano</strong> e receba upgrade automático via IA
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold text-sm">3</span>
                <div>
                  <strong className="text-foreground">Upsell opcional</strong> - Adicione TV, telefone etc
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold text-sm">4</span>
                <div>
                  <strong className="text-foreground">Pagamento fácil</strong> via Pix ou cartão
                </div>
              </li>
            </ol>
            <Button variant="cta" size="lg" className="mt-8">Simular Upgrade via Bot</Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Plans;
