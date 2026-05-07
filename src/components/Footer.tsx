import { Link } from "react-router-dom";
import { MapPin, Phone, Clock, Mail, Wifi, MessageCircle } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary text-foreground border-t border-border">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Column 1: Brand */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Wifi className="h-6 w-6 text-accent" />
              <h3 className="text-lg font-heading font-bold">SALESNET</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Internet via Fibra Óptica de qualidade em Fortaleza/CE. Suporte IA 24h.
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 className="text-sm font-heading font-bold mb-4">Links Rápidos</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-accent transition-colors">Home</Link></li>
              <li><Link to="/planos" className="hover:text-accent transition-colors">Planos</Link></li>
              <li><Link to="/cobertura" className="hover:text-accent transition-colors">Cobertura</Link></li>
              <li><Link to="/suporte" className="hover:text-accent transition-colors">Suporte</Link></li>
              <li><Link to="/hotspots" className="hover:text-accent transition-colors">Hotspots</Link></li>
              <li><Link to="/trabalhe-conosco" className="hover:text-accent transition-colors">Trabalhe Conosco</Link></li>
              <li><Link to="/contato" className="hover:text-accent transition-colors">Contato</Link></li>
            </ul>
          </div>

          {/* Column 3: Contact */}
          <div>
            <h4 className="text-sm font-heading font-bold mb-4">Contato</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                <span>Fortaleza, Ceará</span>
              </li>
              <li className="flex items-start space-x-2">
                <Phone className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <a href="tel:+5585996032957" className="hover:text-accent transition-colors block">
                    (85) 9 9603-2957
                  </a>
                </div>
              </li>
              <li className="flex items-start space-x-2">
                <MessageCircle className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                <a
                  href="https://wa.me/5585996032957"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors"
                >
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Hours */}
          <div>
            <h4 className="text-sm font-heading font-bold mb-4">Horário</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start space-x-2">
                <Clock className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                <div>
                  <p>Bot IA: 24h/7</p>
                  <p className="mt-1">Atendimento Humano:</p>
                  <p>Seg-Dom: 8h-22h</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Map Section */}
        <div className="mt-8 pt-8 border-t border-border">
          <h4 className="text-sm font-heading font-bold mb-4 text-center">Área de Cobertura</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              <span>Jardim Guanabara</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              <span>Jardim Iracema</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              <span>Quintino Cunha</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              <span>Vila Velha</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              <span>Nova Assunção</span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} SalesNet Telecom. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Empresa autorizada pela ANATEL
          </p>
          <p className="text-xs text-muted-foreground mt-2 opacity-60">
            by Ronald Digital
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
