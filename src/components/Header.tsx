import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Planos", path: "/planos" },
    { name: "Cobertura", path: "/cobertura" },
    { name: "Suporte", path: "/suporte" },
    { name: "Hotspots", path: "/hotspots" },
    { name: "Trabalhe Conosco", path: "/trabalhe-conosco" },
    { name: "Contato", path: "/contato" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-primary/95 backdrop-blur supports-[backdrop-filter]:bg-primary/80">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-2">
          <Wifi className="h-8 w-8 text-accent" />
          <span className="text-xl font-heading font-bold text-foreground">
            SALESNET
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center space-x-1">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive(item.path) ? "secondary" : "ghost"}
                size="sm"
                className="text-foreground"
              >
                {item.name}
              </Button>
            </Link>
          ))}
        </nav>

        {/* CTA Button */}
        <div className="hidden md:block">
          <a
            href="https://wa.me/5527999999999"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="cta" size="sm">
              Fale no WhatsApp
            </Button>
          </a>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="lg:hidden text-foreground"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="lg:hidden border-t border-border animate-slide-in bg-primary">
          <nav className="container mx-auto px-4 py-4 flex flex-col space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
              >
                <Button
                  variant={isActive(item.path) ? "secondary" : "ghost"}
                  className="w-full justify-start text-foreground"
                >
                  {item.name}
                </Button>
              </Link>
            ))}
            <a
              href="https://wa.me/5527999999999"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full"
            >
              <Button variant="cta" className="w-full">
                WhatsApp
              </Button>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
