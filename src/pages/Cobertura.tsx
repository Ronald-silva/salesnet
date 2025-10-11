import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIBotWidget from "@/components/AIBotWidget";
import { Button } from "@/components/ui/button";
import { MapPin, CheckCircle } from "lucide-react";
import { useState } from "react";

const Cobertura = () => {
  const [cep, setCep] = useState("");

  const neighborhoods = [
    { name: "Jardim Guanabara", coverage: 95 },
    { name: "Iracema", coverage: 90 },
    { name: "Quintino Cunha", coverage: 85 },
    { name: "Vila Velha Nova Assunção", coverage: 92 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AIBotWidget />

      {/* Hero Section */}
      <section className="bg-gradient-hero text-foreground py-20">
        <div className="container mx-auto px-4 text-center">
          <MapPin className="h-16 w-16 text-accent mx-auto mb-4" />
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 animate-fade-in">
            Cobertura em Vila Velha
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in">
            Verifique se atendemos seu endereço
          </p>
        </div>
      </section>

      {/* CEP Checker */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto bg-card rounded-lg p-8 border border-accent/20 shadow-card">
            <h2 className="text-2xl font-heading font-bold text-card-foreground mb-4 text-center">
              Consulte Seu CEP
            </h2>
            <p className="text-muted-foreground text-center mb-6">
              Digite seu CEP para verificar disponibilidade e planos recomendados
            </p>
            
            <div className="flex gap-3">
              <input
                type="text"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
                className="flex-1 px-4 py-3 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground text-lg"
              />
              <Button variant="cta" size="lg">
                Verificar
              </Button>
            </div>

            <p className="text-sm text-muted-foreground text-center mt-4">
              Ou consulte via{" "}
              <a href="https://wa.me/5527999999999" className="text-accent hover:underline">
                WhatsApp
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Map */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-card-foreground mb-8 text-center">
            Mapa de Cobertura
          </h2>
          
          <div className="bg-muted rounded-lg overflow-hidden border border-accent/20">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d59943.02!2d-40.29!3d-20.33!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMjDCsDE5JzQ4LjAiUyA0MMKwMTcnMjQuMCJX!5e0!3m2!1spt-BR!2sbr!4v1234567890"
              width="100%"
              height="500"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Mapa de Cobertura Vila Velha"
            ></iframe>
          </div>
        </div>
      </section>

      {/* Neighborhoods Coverage */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-8 text-center">
            Bairros Atendidos
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {neighborhoods.map((neighborhood, index) => (
              <div
                key={index}
                className="bg-card rounded-lg p-6 text-center border border-accent/20 hover:shadow-card-hover transition-all animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CheckCircle className="h-12 w-12 text-accent mx-auto mb-4" />
                <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                  {neighborhood.name}
                </h3>
                <div className="mb-3">
                  <div className="bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-accent h-full transition-all duration-1000"
                      style={{ width: `${neighborhood.coverage}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {neighborhood.coverage}% de cobertura
                  </p>
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  Verificar Endereço
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Expansion Section */}
      <section className="py-16 bg-gradient-hero">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
            Estamos em Expansão
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Novos bairros em breve! Cadastre seu email para ser notificado quando chegarmos na sua região
          </p>

          <div className="max-w-md mx-auto flex gap-3">
            <input
              type="email"
              placeholder="Seu melhor email"
              className="flex-1 px-4 py-3 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
            />
            <Button variant="cta" size="lg">
              Inscrever
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Cobertura;
