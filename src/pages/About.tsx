import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIBotWidget from "@/components/AIBotWidget";
import { Target, Eye, Heart, Award, Zap, Radio } from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AIBotWidget />

      <section className="bg-gradient-hero py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-heading font-bold text-foreground mb-4">Sobre a SALESNET</h1>
          <p className="text-xl text-muted-foreground">Conectando Vila Velha com tecnologia e qualidade</p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-card rounded-lg p-8 border border-accent/20 hover:shadow-card-hover transition-all">
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6 mx-auto">
                <Target className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-center text-card-foreground mb-4">MISSÃO</h3>
              <p className="text-muted-foreground text-center">
                Fornecer internet FTTH de qualidade em Vila Velha/ES com suporte inteligente 24h,
                garantindo conectividade estável para residências e negócios.
              </p>
            </div>

            <div className="bg-card rounded-lg p-8 border border-accent/20 hover:shadow-card-hover transition-all">
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6 mx-auto">
                <Eye className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-center text-card-foreground mb-4">VISÃO</h3>
              <p className="text-muted-foreground text-center">
                Ser referência em internet fibra ótica em Vila Velha, com mais de 1000 clientes ativos
                e expansão contínua para novos bairros.
              </p>
            </div>

            <div className="bg-card rounded-lg p-8 border border-accent/20 hover:shadow-card-hover transition-all">
              <div className="w-16 h-16 bg-gradient-card rounded-lg flex items-center justify-center mb-6 mx-auto">
                <Heart className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-center text-card-foreground mb-4">VALORES</h3>
              <p className="text-muted-foreground text-center">
                Compromisso com qualidade, transparência, inovação tecnológica (IA),
                atendimento humanizado e responsabilidade com a comunidade.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mb-6 mx-auto border-2 border-accent">
              <Award className="w-10 h-10 text-accent" />
            </div>
            <h2 className="text-4xl font-heading font-bold text-card-foreground mb-4">Empresa Autorizada ANATEL</h2>
            <p className="text-xl text-muted-foreground">
              Somos devidamente autorizados pela Agência Nacional de Telecomunicações,
              garantindo serviços que atendem aos padrões de qualidade e segurança regulamentados.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-heading font-bold text-center text-foreground mb-12">Nossa Tecnologia</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-card rounded-lg p-8 border border-accent/20">
              <Zap className="h-12 w-12 text-accent mb-4" />
              <h3 className="text-2xl font-heading font-bold text-card-foreground mb-4">FTTH - Fiber to the Home</h3>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li>• Velocidade ultra-rápida e estável</li>
                <li>• Menor latência para jogos e streaming</li>
                <li>• Conexão direta via fibra óptica</li>
                <li>• Imune a interferências climáticas</li>
                <li>• Maior capacidade de dados</li>
              </ul>
            </div>

            <div className="bg-card rounded-lg p-8 border border-accent/20">
              <Radio className="h-12 w-12 text-accent mb-4" />
              <h3 className="text-2xl font-heading font-bold text-card-foreground mb-4">RF - Rádio Frequência</h3>
              <ul className="space-y-2 text-muted-foreground text-sm">
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
