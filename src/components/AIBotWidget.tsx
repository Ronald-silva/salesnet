import { MessageCircle, X, Send } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAIBot } from "@/contexts/AIBotContext";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { formatBrl, INSTALLATION_FEE, plansListText, PUBLIC_PLANS, TV_ADDON_PRICE } from "@/data/plans";

interface Message {
  id: number;
  text: string;
  isBot: boolean;
  timestamp: Date;
}

const AIBotWidget = () => {
  const location = useLocation();
  const { isOpen, setIsOpen } = useAIBot();
  const [position, setPosition] = useState({ bottom: '6rem', right: '1.5rem' });
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Olá! 👋 Sou o assistente virtual da SalesNet!\n\nComo posso ajudar você?\n\n• Ver planos e preços\n• Verificar cobertura\n• Agendar instalação\n• Suporte técnico\n• Falar com atendente\n\n💡 Taxa de instalação R$ 50,00",
      isBot: true,
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Scroll automático para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fechar chat ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        chatRef.current &&
        buttonRef.current &&
        !chatRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  // Função para gerar resposta automática
  const generateBotResponse = (userMessage: string): string => {
    const message = userMessage.toLowerCase();
    
    if (message.includes('plano') || message.includes('preço') || message.includes('valor')) {
      return `📋 **Nossos Planos:**\n\n${plansListText()}\n\n✅ Fibra óptica\n✅ Sem fidelidade\n✅ Taxa de instalação R$ ${formatBrl(INSTALLATION_FEE)}\n✅ Canais/filmes adicional R$ ${formatBrl(TV_ADDON_PRICE)}/mês\n✅ Suporte 24h\n\nQual plano te interessa?`;
    }
    
    if (message.includes('cobertura') || message.includes('bairro') || message.includes('atende')) {
      return "📍 **Área de Cobertura:**\n\n• Jardim Guanabara\n• Jardim Iracema\n• Quintino Cunha\n• Vila Velha\n• Nova Assunção\n\nDigite seu CEP ou bairro para verificar disponibilidade!";
    }
    
    if (message.includes('suporte') || message.includes('problema') || message.includes('lenta') || message.includes('não funciona')) {
      return "🔧 **Suporte Técnico:**\n\n1. Reinicie seu roteador (30 segundos)\n2. Teste a velocidade: fast.com\n3. Verifique cabos e conexões\n\nProblema persiste? Fale conosco no WhatsApp: (85) 9 9603-2957";
    }
    
    if (message.includes('whatsapp') || message.includes('atendente') || message.includes('humano')) {
      return `📱 **Atendimento Humano:**\n\nWhatsApp: (85) 9 9603-2957\nHorário: 8h às 22h (todos os dias)\n\nOu clique aqui para falar direto: ${buildWhatsAppLink()}`;
    }
    
    if (message.includes('oi') || message.includes('olá') || message.includes('bom dia') || message.includes('boa tarde') || message.includes('boa noite')) {
      return "Olá! 😊 Bem-vindo à SalesNet!\n\nComo posso ajudar você hoje?\n\n• Ver planos e preços\n• Verificar cobertura\n• Suporte técnico\n• Falar com atendente";
    }
    
    if (message.includes('obrigado') || message.includes('valeu') || message.includes('tchau')) {
      return "Por nada! 😊 Foi um prazer ajudar!\n\nPrecisa de mais alguma coisa? Estou sempre aqui!\n\n📱 WhatsApp: (85) 9 9603-2957";
    }

    if (message.includes('desconto') || message.includes('promoção') || message.includes('promocao')) {
      const popular = PUBLIC_PLANS.find((p) => p.popular);
      return `💰 **Planos atuais:**\n\n${plansListText()}\n\nO mais procurado é o **${popular?.name ?? '500 Mega'}** por R$ ${formatBrl(popular?.priceMonthly ?? 89.99)}/mês.`;
    }

    if (message.includes('instala') || message.includes('agendar') || message.includes('visita')) {
      return `🔧 **Instalação:**\n\n✅ Taxa única de R$ ${formatBrl(INSTALLATION_FEE)}\n✅ Agendamos no melhor horário para você\n✅ Técnico chega em até 48h úteis\n✅ Equipamentos inclusos\n\nPara agendar, me informe:\n1. Seu endereço completo\n2. Melhor dia e horário\n\nOu fale direto no WhatsApp: (85) 9 9603-2957`;
    }

    if (message.includes('pix') || message.includes('pagamento') || message.includes('pagar') || message.includes('boleto')) {
      return "💳 **Formas de Pagamento:**\n\n• **PIX** - Chave enviada todo mês\n• **Boleto** - Vence todo dia 10\n• **Cartão** - Débito automático\n\nDúvidas sobre sua fatura? Fale conosco!";
    }

    if (message.includes('cancelar') || message.includes('cancelamento') || message.includes('sair')) {
      return "📋 **Cancelamento:**\n\n✅ Sem multa - você cancela quando quiser\n✅ Sem fidelidade\n✅ Processo simples e rápido\n\nPara cancelar, entre em contato:\n📱 WhatsApp: (85) 9 9603-2957\n\nPodemos ajudar com algum problema antes?";
    }

    if (message.includes('upgrade') || message.includes('mudar plano') || message.includes('trocar plano') || message.includes('aumentar')) {
      const upgrades = PUBLIC_PLANS.slice(0, -1).map((p, i) => {
        const next = PUBLIC_PLANS[i + 1];
        const diff = next.priceMonthly - p.priceMonthly;
        return `📶 ${p.name} → ${next.name}: +R$ ${formatBrl(diff)}/mês`;
      });
      return `⬆️ **Upgrade de Plano:**\n\nVocê pode mudar de plano a qualquer momento!\n\n${upgrades.join('\n')}\n\n✅ Mudança sem custo adicional\n✅ Ativação imediata\n\nQuer fazer upgrade agora?`;
    }

    if (message.includes('velocidade') || message.includes('lento') || message.includes('rapido') || message.includes('mbps')) {
      const lines = PUBLIC_PLANS.map((p) => `• **${p.name}** - ${p.tagline}`);
      return `🚀 **Sobre Velocidades:**\n\n${lines.join('\n')}\n\n💡 Para família com 3+ pessoas, recomendamos 500 Mega ou mais!\n\nQual seu uso principal?`;
    }

    if (message.includes('tv') || message.includes('canal') || message.includes('filme')) {
      return `📺 **Canais e Filmes:**\n\nPacote adicional por R$ ${formatBrl(TV_ADDON_PRICE)}/mês.\n\nCombine com qualquer plano de fibra. Quer incluir no seu contrato?`;
    }

    if (message.includes('fibra') || message.includes('fttx') || message.includes('cabo')) {
      return "🔌 **Tecnologia FTTX:**\n\nUsamos cabos de fibra óptica, que garantem:\n\n✅ Velocidade real (upload e download)\n✅ Mais estabilidade\n✅ Menor latência para jogos\n✅ Resistente a interferências\n\nSua conexão vai ficar muito mais rápida e estável!";
    }

    if (message.includes('contrato') || message.includes('fidelidade') || message.includes('multa')) {
      return "📝 **Sobre Contrato:**\n\n✅ **SEM FIDELIDADE** - cancele quando quiser\n✅ **SEM MULTA** - liberdade total\n✅ Contrato mensal simples\n\nVocê só fica se estiver satisfeito! 😊";
    }

    // Resposta padrão
    return "🤖 Desculpe, não entendi sua pergunta.\n\nPosso ajudar com:\n• **Planos** e preços\n• **Cobertura** na sua região\n• **Instalação** e agendamento\n• **Pagamento** e faturas\n• **Suporte** técnico\n• **Upgrade** de velocidade\n• Falar com **atendente**\n\nOu digite sua dúvida de forma diferente!";
  };

  // Função para enviar mensagem
  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      text: inputMessage,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsTyping(true);

    // Simula delay de digitação do bot
    setTimeout(() => {
      const botResponse: Message = {
        id: Date.now() + 1,
        text: generateBotResponse(inputMessage),
        isBot: true,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000); // 1-2 segundos
  };

  // Função para lidar com Enter
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Função para calcular posição ideal do modal
  useEffect(() => {
    const calculatePosition = () => {
      if (isOpen && chatRef.current) {
        const isMobile = window.innerWidth < 640;
        const chatHeight = 500; // altura aproximada do chat
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        if (isMobile) {
          // Em mobile, centraliza horizontalmente e posiciona próximo ao bottom
          setPosition({ 
            bottom: '6rem', 
            right: '1rem' 
          });
        } else {
          // Desktop: verifica se há espaço suficiente
          const buttonBottom = 96; // 6rem em pixels
          const spaceAbove = viewportHeight - buttonBottom;
          
          if (spaceAbove < chatHeight) {
            // Se não há espaço, posiciona mais para baixo
            const newBottom = Math.max(20, viewportHeight - chatHeight - 20);
            setPosition({ 
              bottom: `${newBottom}px`, 
              right: '1.5rem' 
            });
          } else {
            setPosition({ 
              bottom: '6rem', 
              right: '1.5rem' 
            });
          }
        }
      }
    };

    calculatePosition();
    
    // Recalcula quando a janela é redimensionada
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [isOpen]);

  if (location.pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 bg-accent text-accent-foreground p-4 rounded-full shadow-lg hover:scale-110 transition-transform duration-300 hover:shadow-[0_0_20px_rgba(0,255,149,0.5)]"
        aria-label="Assistente Virtual"
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
      </button>

      {/* Overlay para mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Chat Widget */}
      {isOpen && (
        <div 
          ref={chatRef}
          className="fixed z-50 bg-card border border-accent/30 rounded-lg shadow-2xl shadow-accent/20 animate-fade-in
                     w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] left-4 right-4
                     sm:w-96 sm:max-w-[calc(100vw-3rem)] sm:left-auto sm:right-6
                     md:w-96"
          style={{ 
            bottom: position.bottom, 
            right: position.right,
            maxHeight: 'calc(100vh - 140px)', // Garante espaço para header e botão
            top: 'auto'
          }}
        >
          <div className="bg-gradient-hero p-4 rounded-t-lg border-b border-accent/30 relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-3 right-3 p-1 hover:bg-black/10 rounded-full transition-colors"
              aria-label="Fechar chat"
            >
              <X size={20} className="text-foreground/70 hover:text-foreground" />
            </button>
            <h3 className="text-lg font-heading font-bold text-foreground flex items-center gap-2 pr-8">
              <MessageCircle className="h-5 w-5 text-accent" />
              Assistente Virtual IA
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Suporte e vendas 24h
            </p>
          </div>
          
          <div className="p-4 overflow-y-auto bg-card" style={{ height: 'min(384px, calc(100vh - 200px))' }}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`rounded-lg p-3 max-w-[80%] ${
                      message.isBot
                        ? 'bg-muted text-card-foreground'
                        : 'bg-accent text-accent-foreground'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-line">{message.text}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-accent rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </div>
          
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem..."
                className="flex-1 px-3 py-2 bg-input border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                disabled={isTyping}
              />
              <button 
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isTyping}
                className="px-4 py-2 bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Send size={16} />
                Enviar
              </button>
            </div>
            
            {/* Sugestões rápidas */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => setInputMessage("Ver planos")}
                className="px-3 py-1 bg-accent/10 text-accent text-xs rounded-full hover:bg-accent/20 transition-colors"
              >
                📋 Planos
              </button>
              <button
                onClick={() => setInputMessage("Verificar cobertura")}
                className="px-3 py-1 bg-accent/10 text-accent text-xs rounded-full hover:bg-accent/20 transition-colors"
              >
                📍 Cobertura
              </button>
              <button
                onClick={() => setInputMessage("Agendar instalação")}
                className="px-3 py-1 bg-accent/10 text-accent text-xs rounded-full hover:bg-accent/20 transition-colors"
              >
                🔧 Instalação
              </button>
              <button
                onClick={() => setInputMessage("Formas de pagamento")}
                className="px-3 py-1 bg-accent/10 text-accent text-xs rounded-full hover:bg-accent/20 transition-colors"
              >
                💳 Pagamento
              </button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Ou fale conosco no{" "}
              <a
                href={buildWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                WhatsApp: (85) 9 9603-2957
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AIBotWidget;
