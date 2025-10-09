import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import PlanCard from "@/components/PlanCard";

const Plans = () => {
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <FloatingWhatsApp />

      {/* Hero Section */}
      <section className="bg-gradient-hero text-primary-foreground py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 animate-fade-in">
            Nossos Planos de Internet
          </h1>
          <p className="text-xl text-primary-foreground/80 max-w-2xl mx-auto animate-fade-in">
            Escolha o plano perfeito para suas necessidades
          </p>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, index) => (
              <div key={index} className="animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
                <PlanCard {...plan} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coverage Check Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
            Verifique a Cobertura
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Confira se nosso serviço está disponível no seu endereço
          </p>
          <div className="max-w-md mx-auto bg-card p-6 rounded-lg shadow-card">
            <p className="text-card-foreground mb-4">
              Entre em contato pelo WhatsApp para verificar a disponibilidade na sua região.
            </p>
            <a
              href="https://wa.me/5585996032957"
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="bg-secondary text-secondary-foreground px-8 py-3 rounded-lg font-semibold hover:bg-secondary/90 transition-colors w-full">
                Verificar Cobertura
              </button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Plans;
