import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Shield, Bot, Zap, MapPin, Star } from "lucide-react";
import heroImage from "@/assets/hero-network.jpg";
import { Link } from "react-router-dom";
import { useAIBot } from "@/contexts/AIBotContext";
import PlanCard from "@/components/PlanCard";
import { formatBrl, INSTALLATION_FEE, PUBLIC_PLANS, TV_ADDON_PRICE } from "@/data/plans";

const Home = () => {
  const { setIsOpen } = useAIBot();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="relative h-[600px] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-primary/85" />
        
        <div className="relative z-10 container mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-7xl font-heading font-bold text-foreground mb-4 animate-fade-in">
            Internet Rápida e Confiável
          </h1>
          <h2 className="text-3xl md:text-4xl text-accent mb-4 animate-fade-in font-bold">
            para Fortaleza
          </h2>
          <p className="text-xl text-muted-foreground mb-8 animate-fade-in max-w-3xl mx-auto">
            Cobertura em Jardim Guanabara, Jardim Iracema, Quintino Cunha, Vila Velha e Nova Assunção. Suporte IA 24h.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in">
            <Button asChild variant="cta" size="lg" className="min-w-[200px]">
              <Link to="/planos">Ver Planos</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-[200px] border-accent text-accent hover:bg-accent/10">
              <Link to="/cobertura">Consultar Cobertura</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-card rounded-lg p-6 border border-accent/20 hover:shadow-card-hover transition-all text-center">
              <Zap className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Velocidade Ilimitada
              </h3>
              <p className="text-sm text-muted-foreground">
                Planos de 400 a 700 Mega para todas as necessidades
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 border border-accent/20 hover:shadow-card-hover transition-all text-center">
              <Bot className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Suporte IA 24h
              </h3>
              <p className="text-sm text-muted-foreground">
                Assistente inteligente para diagnóstico rápido
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 border border-accent/20 hover:shadow-card-hover transition-all text-center">
              <MapPin className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Cobertura Local
              </h3>
              <p className="text-sm text-muted-foreground">
                Atendemos os principais bairros de Fortaleza
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 border border-accent/20 hover:shadow-card-hover transition-all text-center">
              <Shield className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Sem Fidelidade
              </h3>
              <p className="text-sm text-muted-foreground">
                Cancele quando quiser, sem multas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-card-foreground mb-12 text-center">
            Planos Populares
          </h2>

          <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
            Taxa de instalação R$ {formatBrl(INSTALLATION_FEE)} · Canais e filmes adicional R${' '}
            {formatBrl(TV_ADDON_PRICE)}/mês
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PUBLIC_PLANS.map((plan) => (
              <PlanCard
                key={plan.speedMbps}
                plan={plan}
                variant="home"
                onContract={() => setIsOpen(true)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-heading font-bold text-foreground mb-12 text-center">
            O Que Dizem Nossos Clientes
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="bg-card rounded-lg p-6 border border-accent/20">
              <div className="flex mb-3">
                {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 text-accent fill-accent" />)}
              </div>
              <p className="text-muted-foreground mb-4">"Internet estável em Jardim Iracema! Melhor que as concorrentes."</p>
              <p className="text-sm font-semibold text-foreground">- João Silva</p>
            </div>

            <div className="bg-card rounded-lg p-6 border border-accent/20">
              <div className="flex mb-3">
                {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 text-accent fill-accent" />)}
              </div>
              <p className="text-muted-foreground mb-4">"Suporte IA responde rapidinho. Muito prático!"</p>
              <p className="text-sm font-semibold text-foreground">- Maria Santos</p>
            </div>

            <div className="bg-card rounded-lg p-6 border border-accent/20">
              <div className="flex mb-3">
                {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 text-accent fill-accent" />)}
              </div>
              <p className="text-muted-foreground mb-4">"Preço justo e velocidade real. Recomendo!"</p>
              <p className="text-sm font-semibold text-foreground">- Pedro Costa</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 bg-gradient-hero">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
            Pronto para ter a melhor internet?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Fale com nosso assistente IA agora mesmo
          </p>
          <Button variant="cta" size="lg" onClick={() => setIsOpen(true)}>
            Falar com o Bot
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
