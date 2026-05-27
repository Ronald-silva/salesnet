import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PlanCard from "@/components/PlanCard";
import { Button } from "@/components/ui/button";
import { Wifi } from "lucide-react";
import { useAIBot } from "@/contexts/AIBotContext";
import { formatBrl, INSTALLATION_FEE, PUBLIC_PLANS, TV_ADDON_PRICE } from "@/data/plans";

const Plans = () => {
  const { setIsOpen } = useAIBot();

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
            <p className="text-lg text-muted-foreground">
              Taxa de instalação R$ {formatBrl(INSTALLATION_FEE)} · Canais e filmes adicional R${' '}
              {formatBrl(TV_ADDON_PRICE)}/mês
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PUBLIC_PLANS.map((plan) => (
              <PlanCard
                key={plan.speedMbps}
                plan={plan}
                variant="page"
                onContract={() => setIsOpen(true)}
              />
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
                  <strong className="text-foreground">Pacote opcional</strong> — Canais e filmes por R${' '}
                  {formatBrl(TV_ADDON_PRICE)}/mês
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
