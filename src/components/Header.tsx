import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";

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

  useEffect(() => {
    // close mobile menu on route change for a smoother, "app-like" feel
    setIsMenuOpen(false);
  }, [location.pathname]);

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
            href="https://wa.me/5585996032957"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="cta" size="sm">
              Fale no WhatsApp
            </Button>
          </a>
        </div>

        {/* Mobile Menu Toggle */}
        <div className="lg:hidden">
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <button
                className="group inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-background/30 text-foreground shadow-sm shadow-black/20 transition-all duration-300 ease-out hover:border-accent/30 hover:bg-accent/10 hover:shadow-[0_0_0_1px_hsl(var(--accent)/0.15),0_12px_30px_hsl(0_0%_0%/0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
                aria-label="Abrir menu"
              >
                <Menu size={20} className="transition-transform duration-300 ease-out group-hover:rotate-[-6deg]" />
              </button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="border-border/60 bg-gradient-to-b from-card to-background px-5 pt-5"
            >
              <SheetHeader className="space-y-1">
                <SheetTitle className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 ring-1 ring-accent/20">
                    <Wifi className="h-5 w-5 text-accent" />
                  </span>
                  <span className="font-heading tracking-wide">SalesNet</span>
                </SheetTitle>
                <p className="text-sm text-muted-foreground">
                  Navegue rápido pelo site.
                </p>
              </SheetHeader>

              <nav className="mt-6 flex flex-col gap-1">
                {navItems.map((item) => (
                  <SheetClose asChild key={item.path}>
                    <Link to={item.path} className="block">
                      <Button
                        variant={isActive(item.path) ? "secondary" : "ghost"}
                        className="w-full justify-start text-foreground transition-all duration-300 ease-out hover:translate-x-[2px]"
                      >
                        {item.name}
                      </Button>
                    </Link>
                  </SheetClose>
                ))}
              </nav>

              <div className="mt-6 grid gap-3">
                <a
                  href="https://wa.me/5585996032957"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full"
                >
                  <Button variant="cta" className="w-full shadow-[0_0_0_1px_hsl(var(--accent)/0.15),0_14px_40px_hsl(var(--accent)/0.12)]">
                    Fale no WhatsApp
                  </Button>
                </a>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Atendimento humano 8h–22h. Fora do horário, o assistente virtual responde na hora.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
