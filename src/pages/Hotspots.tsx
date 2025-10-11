import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIBotWidget from "@/components/AIBotWidget";
import { Button } from "@/components/ui/button";
import { Wifi, Store, Users, TrendingUp } from "lucide-react";

const Hotspots = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AIBotWidget />

      {/* Hero Section */}
      <section className="bg-gradient-hero text-foreground py-20">
        <div className="container mx-auto px-4 text-center">
          <Wifi className="h-16 w-16 text-accent mx-auto mb-4" />
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 animate-fade-in">
            WiFi Público para Seu Negócio
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in">
            Instale hotspots em seu estabelecimento e atraia mais clientes
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="bg-card rounded-lg p-6 border border-accent/20 hover:shadow-card-hover transition-all">
              <Store className="h-12 w-12 text-accent mb-4" />
              <h3 className="text-xl font-heading font-bold text-card-foreground mb-2">
                Atraia Clientes
              </h3>
              <p className="text-muted-foreground">
                WiFi gratuito aumenta o tempo de permanência e atrai novos visitantes
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 border border-accent/20 hover:shadow-card-hover transition-all">
              <Users className="h-12 w-12 text-accent mb-4" />
              <h3 className="text-xl font-heading font-bold text-card-foreground mb-2">
                Gere Leads
              </h3>
              <p className="text-muted-foreground">
                Sistema de login captura contatos interessados em internet residencial
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 border border-accent/20 hover:shadow-card-hover transition-all">
              <TrendingUp className="h-12 w-12 text-accent mb-4" />
              <h3 className="text-xl font-heading font-bold text-card-foreground mb-2">
                Baixo Custo
              </h3>
              <p className="text-muted-foreground">
                A partir de R$50-100/mês com instalação e manutenção incluídas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Partner Form */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-card-foreground mb-4 text-center">
              Seja um Parceiro Hotspot
            </h2>
            <p className="text-muted-foreground text-center mb-8">
              Preencha o formulário e entraremos em contato para avaliar a instalação
            </p>

            <form className="space-y-6 bg-background p-8 rounded-lg border border-accent/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Tipo de Negócio *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Café, Restaurante, Loja"
                    className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Endereço Completo *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Bairro *
                  </label>
                  <select className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground">
                    <option value="">Selecione</option>
                    <option value="jardim-guanabara">Jardim Guanabara</option>
                    <option value="jardim-iracema">Jardim Iracema</option>
                    <option value="quintino-cunha">Quintino Cunha</option>
                    <option value="vila-velha">Vila Velha</option>
                    <option value="nova-assuncao">Nova Assunção</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Telefone/WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Informações Adicionais
                </label>
                <textarea
                  rows={4}
                  placeholder="Conte-nos mais sobre seu estabelecimento e expectativas"
                  className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                ></textarea>
              </div>

              <Button variant="cta" size="lg" className="w-full">
                Solicitar Parceria
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Ao enviar, você concorda com nossos termos de uso e política de privacidade
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Map Placeholder */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-8 text-center">
            Hotspots Parceiros
          </h2>
          <div className="bg-card rounded-lg p-8 text-center border border-accent/20">
            <p className="text-muted-foreground mb-4">
              Mapa de hotspots será exibido aqui em breve
            </p>
            <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
              <Wifi className="h-16 w-16 text-accent opacity-50" />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Hotspots;
