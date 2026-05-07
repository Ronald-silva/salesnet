import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { buildWhatsAppLink } from "@/lib/whatsapp";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function closeMenuThenNavigate(path: string) {
    // Close with animation first, then navigate (avoids "hard cut" feeling).
    const delayMs = prefersReducedMotion ? 0 : 220;
    setIsMenuOpen(false);
    window.setTimeout(() => navigate(path), delayMs);
  }

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
            href={buildWhatsAppLink()}
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
                {isMenuOpen ? (
                  <X size={20} className="transition-transform duration-300 ease-out group-hover:rotate-[6deg]" />
                ) : (
                  <Menu size={20} className="transition-transform duration-300 ease-out group-hover:rotate-[-6deg]" />
                )}
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
                {navItems.map((item, idx) => {
                  const active = isActive(item.path);
                  const enterDelay = prefersReducedMotion ? "0ms" : `${110 + idx * 32}ms`;

                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => closeMenuThenNavigate(item.path)}
                      className="group text-left"
                      aria-current={active ? "page" : undefined}
                    >
                      <div
                        className={[
                          "relative overflow-hidden rounded-md",
                          "transition-transform duration-300 ease-out",
                          "motion-safe:will-change-transform",
                          isMenuOpen ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0",
                        ].join(" ")}
                        style={{ transitionDelay: isMenuOpen ? enterDelay : "0ms" }}
                      >
                        {/* Active pill highlight */}
                        <span
                          className={[
                            "pointer-events-none absolute inset-0 rounded-md",
                            "transition-all duration-300 ease-out",
                            active
                              ? "bg-accent/14 ring-1 ring-accent/25 shadow-[0_0_0_1px_hsl(var(--accent)/0.08),0_14px_40px_hsl(var(--accent)/0.10)]"
                              : "bg-transparent ring-1 ring-transparent",
                          ].join(" ")}
                          aria-hidden="true"
                        />
                        {/* Subtle left glow on hover */}
                        <span
                          className="pointer-events-none absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-accent/20 to-transparent opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
                          aria-hidden="true"
                        />

                        <Button
                          variant={active ? "secondary" : "ghost"}
                          className={[
                            "relative w-full justify-start text-foreground",
                            "transition-all duration-300 ease-out",
                            "hover:translate-x-[2px]",
                            active ? "font-semibold" : "",
                          ].join(" ")}
                        >
                          {item.name}
                        </Button>
                      </div>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-6 grid gap-3">
                <a
                  href={buildWhatsAppLink()}
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
