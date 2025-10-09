import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import PlanCard from "@/components/PlanCard";
import ValueCard from "@/components/ValueCard";
import { Button } from "@/components/ui/button";
import { Wifi, Shield, Headphones, Zap, Radio, CheckCircle } from "lucide-react";
import heroImage from "@/assets/hero-network.jpg";

const Home = () => {
  const plans = [
    {
      name: "Plano Básico",
      speed: "20",
      price: "60,00",
      discountPrice: "50,00",
      features: [
        "Internet via Fibra Óptica",
        "Wi-Fi incluso",
        "Suporte técnico",
        "Instalação grátis",
        "Sem fidelidade"
      ],
    },
    {
      name: "Plano Intermediário",
      speed: "30",
      price: "70,00",
      discountPrice: "60,00",
      features: [
        "Internet via Fibra Óptica",
        "Wi-Fi de alta performance",
        "Suporte técnico prioritário",
        "Instalação grátis",
        "Sem fidelidade"
      ],
    },
    {
      name: "Plano Popular",
      speed: "50",
      price: "80,00",
      discountPrice: "70,00",
      features: [
        "Internet via Fibra Óptica",
        "Wi-Fi de alta performance",
        "Suporte técnico prioritário",
        "Instalação grátis",
        "Sem fidelidade",
        "Ideal para streaming"
      ],
      isPopular: true,
    },
    {
      name: "Plano Premium",
      speed: "100",
      price: "100,00",
      discountPrice: "90,00",
      features: [
        "Internet via Fibra Óptica",
        "Wi-Fi de ultra performance",
        "Suporte técnico VIP",
        "Instalação grátis",
        "Sem fidelidade",
        "Ideal para home office",
        "Melhor para jogos online"
      ],
    },
  ];

  const steps = [
    {
      number: "01",
      title: "Verificar Cobertura",
      description: "Confirme se atendemos sua região"
    },
    {
      number: "02",
      title: "Escolher Plano",
      description: "Selecione o melhor para você"
    },
    {
      number: "03",
      title: "Agendar Instalação",
      description: "Instalamos rapidamente"
    },
    {
      number: "04",
      title: "Aproveitar Conexão",
      description: "Internet de qualidade na sua casa"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <FloatingWhatsApp />

      {/* Hero Section */}
      <section className="relative h-[600px] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-primary/80" />
        
        <div className="relative z-10 container mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-heading font-bold text-primary-foreground mb-4 animate-fade-in">
            SALESNET
          </h1>
          <p className="text-2xl md:text-3xl text-primary-foreground/90 mb-2 animate-fade-in">
            PROVEDOR INTERNET
          </p>
          <p className="text-xl md:text-2xl text-primary-foreground/80 mb-8 animate-fade-in">
            Internet via Fibra Óptica e Rádio
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in">
            <a href="https://wa.me/5585996032957" target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="lg" className="min-w-[200px]">
                Verificar Cobertura
              </Button>
            </a>
            <a href="https://wa.me/5585996032957" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg" className="min-w-[200px] border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10">
                Fale com nossa equipe
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="animate-fade-in">
              <ValueCard
                icon={Wifi}
                title="Tecnologia FTTH"
                description="Fibra óptica até sua casa com velocidade e estabilidade incomparáveis"
              />
            </div>
            <div className="animate-fade-in" style={{ animationDelay: "100ms" }}>
              <ValueCard
                icon={Shield}
                title="Estabilidade"
                description="Conexão estável e confiável para trabalhar, estudar e se divertir"
              />
            </div>
            <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
              <ValueCard
                icon={Headphones}
                title="Suporte de Qualidade"
                description="Equipe especializada pronta para atender você quando precisar"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-4">
              Nossos Planos
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Escolha o plano ideal para suas necessidades
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, index) => (
              <div key={index} className="animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
                <PlanCard {...plan} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-4">
              Como Funciona
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Simples e rápido para você começar
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
                <div className="w-20 h-20 bg-gradient-hero rounded-full flex items-center justify-center mb-4 mx-auto">
                  <span className="text-3xl font-heading font-bold text-primary-foreground">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-xl font-heading font-semibold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-4">
              Nossa Tecnologia
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-card rounded-lg p-8 shadow-card hover:shadow-card-hover transition-all duration-300 animate-fade-in">
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6">
                <Zap className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-card-foreground mb-4">
                FTTH - Fibra Óptica
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Velocidade ultra-rápida e estável</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Menor latência para jogos e streaming</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Conexão direta via fibra óptica</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Imune a interferências climáticas</span>
                </li>
              </ul>
            </div>

            <div className="bg-card rounded-lg p-8 shadow-card hover:shadow-card-hover transition-all duration-300 animate-fade-in" style={{ animationDelay: "100ms" }}>
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6">
                <Radio className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-card-foreground mb-4">
                RF - Rádio Frequência
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Cobertura em áreas amplas</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Instalação rápida e prática</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Boa relação custo-benefício</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Tecnologia confiável</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Info Section */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4">
              Fale Conosco
            </h2>
            <p className="text-xl text-primary-foreground/80 max-w-2xl mx-auto">
              Estamos prontos para atendê-lo
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8 text-secondary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-heading font-semibold text-lg mb-2">Endereço</h3>
              <p className="text-primary-foreground/80 text-sm">
                Av. Major Assis, 1275 C<br />
                Fortaleza, CE
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8 text-secondary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="font-heading font-semibold text-lg mb-2">Telefones</h3>
              <p className="text-primary-foreground/80 text-sm">
                (85) 3045-0548<br />
                (85) 99603-2957
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg className="w-8 h-8 text-secondary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-heading font-semibold text-lg mb-2">Horário</h3>
              <p className="text-primary-foreground/80 text-sm">
                Segunda a Sexta<br />
                08:00 às 12:00 e 13:30 às 17:00
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
