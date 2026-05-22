import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Headphones } from "lucide-react";
import { useAIBot } from "@/contexts/AIBotContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { buildWhatsAppLink, buildNetworkIssueMessage } from "@/lib/whatsapp";

const Suporte = () => {
  const { setIsOpen } = useAIBot();

  const faqs = [
    {
      question: "Minha internet está lenta, o que fazer?",
      answer: "Primeiro, teste a velocidade pelo nosso bot de diagnóstico. Reinicie o roteador, verifique se há muitos dispositivos conectados e certifique-se de estar usando cabo ethernet para testes precisos. Se o problema persistir, entre em contato conosco.",
    },
    {
      question: "Como agendar uma instalação?",
      answer: "Entre em contato via WhatsApp ou através do nosso bot IA. Nossa equipe agendará a visita técnica em até 24h e a instalação é totalmente gratuita.",
    },
    {
      question: "Posso mudar meu plano?",
      answer: "Sim! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. Fale com nosso bot ou WhatsApp para simular o novo plano e valores.",
    },
    {
      question: "Como funciona o suporte 24h?",
      answer: "Nosso bot IA está disponível 24h para diagnósticos rápidos e soluções automáticas. Para suporte humano, nosso horário é de 8h às 22h todos os dias.",
    },
    {
      question: "Qual a política de cancelamento?",
      answer: "Sem fidelidade! Você pode cancelar quando quiser, sem multas. Basta solicitar via WhatsApp com 30 dias de antecedência.",
    },
    {
      question: "Como funciona o sistema de indicação?",
      answer: "Indique amigos e ganhe 1 mês grátis para cada indicação que fechar contrato. O indicado também ganha desconto no primeiro mês. Consulte condições via bot.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="bg-gradient-hero text-foreground py-20">
        <div className="container mx-auto px-4 text-center">
          <Headphones className="h-16 w-16 text-accent mx-auto mb-4" />
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 animate-fade-in">
            Suporte 24h Inteligente
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in">
            Soluções rápidas via IA ou fale com nossa equipe
          </p>
        </div>
      </section>

      {/* Bot CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto bg-card rounded-lg p-8 text-center border border-accent/20 shadow-card">
            <h2 className="text-2xl font-heading font-bold text-card-foreground mb-4">
              Fale Agora com Nossa IA
            </h2>
            <p className="text-muted-foreground mb-6">
              Diagnóstico automático, teste de velocidade, agendamentos e mais
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setIsOpen(true)}
                className="px-8 py-4 bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors font-bold text-lg shadow-lg hover:shadow-[0_0_20px_rgba(0,255,149,0.5)]"
              >
                Abrir Chat IA
              </button>
              <a
                href={buildWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-background border border-accent text-accent rounded-md hover:bg-accent/10 transition-colors font-bold text-lg"
              >
                WhatsApp Direto
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-card-foreground mb-8 text-center">
            Perguntas Frequentes
          </h2>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="bg-background border border-accent/20 rounded-lg px-6"
                >
                  <AccordionTrigger className="text-left hover:text-accent">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Network Status */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-8 text-center">
            Status da Rede
          </h2>

          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: "Jardim Guanabara", speed: "98.5", latency: "8" },
              { name: "Jardim Iracema",   speed: "97.2", latency: "9" },
              { name: "Quintino Cunha",   speed: "99.1", latency: "7" },
              { name: "Vila Velha",       speed: "96.5", latency: "10" },
              { name: "Nova Assunção",    speed: "98.8", latency: "8" },
            ].map((bairro) => (
              <div key={bairro.name} className="bg-card rounded-lg p-6 border border-accent/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-heading font-bold text-card-foreground">
                    {bairro.name}
                  </h3>
                  <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full font-semibold">
                    Operacional
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Velocidade média: {bairro.speed} Mbps | Latência: {bairro.latency}ms
                </p>
                <a
                  href={buildWhatsAppLink(buildNetworkIssueMessage(bairro.name))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  Relatar problema neste bairro →
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-2">
            Última atualização: {new Date().toLocaleString('pt-BR')}
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Suporte;
