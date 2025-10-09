import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center px-4">
        <div className="mb-8">
          <h1 className="text-9xl font-heading font-bold text-primary mb-4">404</h1>
          <h2 className="text-3xl font-heading font-semibold text-foreground mb-2">
            Página Não Encontrada
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Desculpe, a página que você está procurando não existe.
          </p>
        </div>
        
        <Link to="/">
          <Button variant="secondary" size="lg">
            <Home className="mr-2 h-5 w-5" />
            Voltar para o Início
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
