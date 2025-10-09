import { Link } from "react-router-dom";
import { MapPin, Phone, Clock, Mail } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-primary text-primary-foreground mt-20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo e Descrição */}
          <div className="space-y-4">
            <div className="bg-secondary px-4 py-2 rounded inline-block">
              <h2 className="text-2xl font-heading font-bold">SALESNET</h2>
            </div>
            <p className="text-sm text-primary-foreground/80">
              Provedor de Internet com qualidade e tecnologia para sua casa e empresa.
            </p>
          </div>

          {/* Links Rápidos */}
          <div>
            <h3 className="text-lg font-heading font-semibold mb-4">Links Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-primary-foreground/80 hover:text-secondary transition-colors">
                  Página Inicial
                </Link>
              </li>
              <li>
                <Link to="/planos" className="text-primary-foreground/80 hover:text-secondary transition-colors">
                  Planos
                </Link>
              </li>
              <li>
                <Link to="/sobre" className="text-primary-foreground/80 hover:text-secondary transition-colors">
                  Sobre
                </Link>
              </li>
              <li>
                <Link to="/contato" className="text-primary-foreground/80 hover:text-secondary transition-colors">
                  Contato
                </Link>
              </li>
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h3 className="text-lg font-heading font-semibold mb-4">Contato</h3>
            <ul className="space-y-3">
              <li className="flex items-start space-x-2">
                <MapPin className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                <span className="text-sm text-primary-foreground/80">
                  Av. Major Assis, 1275 C<br />
                  Fortaleza, CE
                </span>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="w-5 h-5 text-secondary flex-shrink-0" />
                <a href="tel:+558530450548" className="text-sm text-primary-foreground/80 hover:text-secondary transition-colors">
                  (85) 3045-0548
                </a>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="w-5 h-5 text-secondary flex-shrink-0" />
                <a href="https://wa.me/5585996032957" className="text-sm text-primary-foreground/80 hover:text-secondary transition-colors">
                  (85) 99603-2957
                </a>
              </li>
            </ul>
          </div>

          {/* Horário */}
          <div>
            <h3 className="text-lg font-heading font-semibold mb-4">Horário de Funcionamento</h3>
            <div className="flex items-start space-x-2">
              <Clock className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-primary-foreground/80">
                <p>Segunda a Sexta</p>
                <p>08:00 às 12:00</p>
                <p>13:30 às 17:00</p>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-primary-foreground/10 mt-8 pt-8 text-center">
          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} SALESNET. Todos os direitos reservados.
          </p>
          <p className="text-xs text-primary-foreground/40 mt-2">
            Empresa autorizada ANATEL
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
