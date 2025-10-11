import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIBotWidget from "@/components/AIBotWidget";
import { MapPin, Phone, Clock, Mail, Wifi, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    interest: "Planos",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.phone || !formData.message) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }

    toast.success("Mensagem enviada! Entraremos em contato em breve.");
    
    setFormData({
      name: "",
      email: "",
      phone: "",
      interest: "Planos",
      message: "",
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AIBotWidget />

      <section className="bg-gradient-hero py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-heading font-bold text-foreground mb-4">Entre em Contato</h1>
          <p className="text-xl text-muted-foreground">Estamos prontos para atendê-lo</p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-heading font-bold text-foreground mb-6">Informações de Contato</h2>
                
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-card rounded-lg flex items-center justify-center flex-shrink-0 border border-accent/20">
                      <MapPin className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Endereço</h3>
                      <p className="text-muted-foreground">Vila Velha, ES</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-card rounded-lg flex items-center justify-center flex-shrink-0 border border-accent/20">
                      <Phone className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Telefone</h3>
                      <a href="tel:+552799999999" className="text-muted-foreground hover:text-accent transition-colors">
                        (27) 9 9999-9999
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-card rounded-lg flex items-center justify-center flex-shrink-0 border border-accent/20">
                      <MessageCircle className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">WhatsApp</h3>
                      <a href="https://wa.me/5527999999999" className="text-muted-foreground hover:text-accent transition-colors">
                        Fale Conosco
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-card rounded-lg flex items-center justify-center flex-shrink-0 border border-accent/20">
                      <Clock className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">Horário</h3>
                      <p className="text-muted-foreground">Bot IA: 24h/7</p>
                      <p className="text-muted-foreground">Humano: Seg-Dom 8h-22h</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-heading font-bold text-foreground mb-6">Envie uma Mensagem</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6 bg-card p-8 rounded-lg border border-accent/20">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-card-foreground mb-2">Nome *</label>
                  <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-card-foreground mb-2">Email *</label>
                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-card-foreground mb-2">Telefone *</label>
                    <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} required />
                  </div>
                </div>

                <div>
                  <label htmlFor="interest" className="block text-sm font-medium text-card-foreground mb-2">Interesse em</label>
                  <select id="interest" name="interest" value={formData.interest} onChange={handleChange} className="w-full px-3 py-2 border border-input bg-input rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground">
                    <option value="Planos">Planos</option>
                    <option value="Hotspots">Hotspots</option>
                    <option value="Trabalhe">Trabalhe Conosco</option>
                    <option value="Suporte">Suporte</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-card-foreground mb-2">Mensagem *</label>
                  <Textarea id="message" name="message" value={formData.message} onChange={handleChange} rows={5} required />
                </div>

                <Button type="submit" variant="cta" size="lg" className="w-full">Enviar Mensagem</Button>

                <p className="text-xs text-muted-foreground text-center">
                  Ou converse agora com nosso{" "}
                  <button type="button" className="text-accent hover:underline">assistente IA</button>
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Contact;
