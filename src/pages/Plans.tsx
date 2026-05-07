import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Wifi, Check } from "lucide-react";
import { useAIBot } from "@/contexts/AIBotContext";

const Plans = () => {
  const { setIsOpen } = useAIBot();
  const plans = [
    {
      name: "20 Mbps",
      speed: 20,
      price: "60,00",
      discountPrice: "50,00",
      features: ["FTTX Ilimitado", "WiFi incluso", "Suporte IA 24h", "Instalação grátis", "Sem fidelidade"],
    },
    {
      name: "30 Mbps",
      speed: 30,
      price: "70,00",
      discountPrice: "60,00",
      features: ["FTTX Ilimitado", "WiFi incluso", "Suporte IA 24h", "Instalação grátis", "Sem fidelidade"],
    },
    {
      name: "50 Mbps",
      speed: 50,
      price: "80,00",
      discountPrice: "70,00",
      features: ["FTTX Ilimitado", "WiFi incluso", "Suporte prioritário", "Instalação grátis", "Streaming HD"],
      popular: true,
    },
    {
      name: "100 Mbps",
      speed: 100,
      price: "100,00",
      discountPrice: "90,00",
      features: ["FTTX Ilimitado", "WiFi premium", "Suporte VIP", "Instalação grátis", "Home office e 4K"],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="bg-gradient-hero py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-heading font-bold text-foreground mb-4">Internet Rápida e Confiável</h1>
          <p className="text-xl text-muted-foreground mb-6">de Fortaleza</p>
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            {['Jardim Guanabara', 'Jardim Iracema', 'Quintino Cunha', 'Vila Velha', 'Nova Assunção'].map((location, i) => (
              <div key={i} className="flex items-center gap-2 bg-accent/10 px-4 py-2 rounded-full">
                <Wifi className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">{location}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <p className="text-lg text-accent font-semibold">💰 Desconto de R$ 10,00 pagando até o vencimento!</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
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
                  <div className="text-4xl font-bold text-accent mb-1">R$ {plan.discountPrice}</div>
                  <p className="text-sm text-muted-foreground line-through">R$ {plan.price}</p>
                  <p className="text-xs text-accent mt-1">Pagando até o vencimento</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-accent flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button variant={plan.popular ? "cta" : "outline"} className="w-full" onClick={() => setIsOpen(true)}>
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
            <Button variant="cta" size="lg" className="mt-8" onClick={() => setIsOpen(true)}>Simular Upgrade via Bot</Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Plans;
