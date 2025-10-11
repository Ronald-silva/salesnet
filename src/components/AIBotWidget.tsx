import { MessageCircle, X } from "lucide-react";
import { useState } from "react";

const AIBotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 bg-accent text-accent-foreground p-4 rounded-full shadow-lg hover:scale-110 transition-transform duration-300 hover:shadow-[0_0_20px_rgba(0,255,149,0.5)]"
        aria-label="Assistente Virtual"
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
      </button>

      {/* Chat Widget */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-card border border-accent/30 rounded-lg shadow-2xl shadow-accent/20 animate-fade-in">
          <div className="bg-gradient-hero p-4 rounded-t-lg border-b border-accent/30">
            <h3 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-accent" />
              Assistente Virtual IA
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Suporte e vendas 24h
            </p>
          </div>
          
          <div className="p-4 h-96 overflow-y-auto bg-card">
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                <p className="text-sm text-card-foreground">
                  Olá! 👋 Como posso ajudar você hoje?
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  • Ver planos disponíveis<br />
                  • Verificar cobertura<br />
                  • Suporte técnico<br />
                  • Falar com atendente
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Digite sua mensagem..."
                className="flex-1 px-3 py-2 bg-input border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
              />
              <button className="px-4 py-2 bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors font-semibold text-sm">
                Enviar
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Ou fale conosco no{" "}
              <a
                href="https://wa.me/5527999999999"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                WhatsApp
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AIBotWidget;
