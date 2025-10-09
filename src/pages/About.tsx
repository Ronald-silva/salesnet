import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import { Target, Eye, Heart, Award } from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <FloatingWhatsApp />

      {/* Hero Section */}
      <section className="bg-gradient-hero text-primary-foreground py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 animate-fade-in">
            Sobre a SALESNET
          </h1>
          <p className="text-xl text-primary-foreground/80 max-w-2xl mx-auto animate-fade-in">
            Conectando pessoas com qualidade e tecnologia
          </p>
        </div>
      </section>

      {/* Mission, Vision, Values */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-card rounded-lg p-8 shadow-card hover:shadow-card-hover transition-all duration-300 animate-fade-in">
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6 mx-auto">
                <Target className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-center text-card-foreground mb-4">
                MISSÃO
              </h3>
              <p className="text-muted-foreground text-center">
                Fornecer internet de qualidade com tecnologia de ponta, garantindo
                conectividade estável e suporte excepcional para nossos clientes
                em Fortaleza e região.
              </p>
            </div>

            <div className="bg-card rounded-lg p-8 shadow-card hover:shadow-card-hover transition-all duration-300 animate-fade-in" style={{ animationDelay: "100ms" }}>
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6 mx-auto">
                <Eye className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-center text-card-foreground mb-4">
                VISÃO
              </h3>
              <p className="text-muted-foreground text-center">
                Ser reconhecida como a principal provedora de internet em Fortaleza,
                referência em qualidade de serviço, inovação tecnológica e
                satisfação do cliente.
              </p>
            </div>

            <div className="bg-card rounded-lg p-8 shadow-card hover:shadow-card-hover transition-all duration-300 animate-fade-in" style={{ animationDelay: "200ms" }}>
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6 mx-auto">
                <Heart className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-center text-card-foreground mb-4">
                VALORES
              </h3>
              <p className="text-muted-foreground text-center">
                Compromisso com a qualidade, transparência nas relações,
                inovação constante, atendimento humanizado e responsabilidade
                com nossos clientes e comunidade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Certification Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-20 h-20 bg-gradient-card rounded-full flex items-center justify-center mb-6 mx-auto">
              <Award className="w-10 h-10 text-secondary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
              Empresa Autorizada ANATEL
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Somos uma empresa devidamente autorizada pela Agência Nacional de
              Telecomunicações (ANATEL), garantindo que nossos serviços atendem
              aos mais altos padrões de qualidade e segurança estabelecidos pela
              regulamentação brasileira.
            </p>
          </div>
        </div>
      </section>

      {/* Technology Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-center text-foreground mb-12">
            Nossa Tecnologia
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-card rounded-lg p-8 shadow-card">
              <h3 className="text-2xl font-heading font-bold text-card-foreground mb-4">
                FTTH - Fiber to the Home
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Velocidade ultra-rápida e estável</li>
                <li>• Menor latência para jogos e streaming</li>
                <li>• Conexão direta via fibra óptica</li>
                <li>• Imune a interferências climáticas</li>
                <li>• Maior capacidade de dados</li>
              </ul>
            </div>

            <div className="bg-card rounded-lg p-8 shadow-card">
              <h3 className="text-2xl font-heading font-bold text-card-foreground mb-4">
                RF - Rádio Frequência
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Cobertura em áreas amplas</li>
                <li>• Instalação rápida e prática</li>
                <li>• Boa relação custo-benefício</li>
                <li>• Tecnologia confiável</li>
                <li>• Ideal para regiões específicas</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
