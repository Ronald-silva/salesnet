import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, Clock, Award } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { buildJobApplicationMessage, buildWhatsAppLink } from "@/lib/whatsapp";

const TrabalheConosco = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    about: "",
    hasNetworkExperience: false,
    hasFlexibleHours: false,
    hasCNH: false,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone || !formData.role || !formData.about) {
      toast.error("Preencha os campos obrigatórios para enviar a candidatura");
      return;
    }

    const message = buildJobApplicationMessage(formData);

    window.open(buildWhatsAppLink(message), "_blank", "noopener,noreferrer");
    toast.success("WhatsApp aberto para envio final da candidatura");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="bg-gradient-hero text-foreground py-20">
        <div className="container mx-auto px-4 text-center">
          <Users className="h-16 w-16 text-accent mx-auto mb-4" />
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4 animate-fade-in">
            Junte-se à SalesNet
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in">
            Faça parte de uma equipe comprometida com excelência em internet de qualidade
          </p>
        </div>
      </section>

      {/* What We Look For */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-8 text-center">
            O Que Valorizamos
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-card rounded-lg p-6 text-center border border-accent/20 hover:shadow-card-hover transition-all">
              <Award className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Compromisso
              </h3>
              <p className="text-sm text-muted-foreground">
                Dedicação e responsabilidade com o trabalho
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 text-center border border-accent/20 hover:shadow-card-hover transition-all">
              <Briefcase className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Experiência
              </h3>
              <p className="text-sm text-muted-foreground">
                Conhecimento em fibra óptica e redes
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 text-center border border-accent/20 hover:shadow-card-hover transition-all">
              <Users className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Comunicação
              </h3>
              <p className="text-sm text-muted-foreground">
                Boa comunicação com clientes e equipe
              </p>
            </div>

            <div className="bg-card rounded-lg p-6 text-center border border-accent/20 hover:shadow-card-hover transition-all">
              <Clock className="h-12 w-12 text-accent mx-auto mb-4" />
              <h3 className="text-lg font-heading font-bold text-card-foreground mb-2">
                Flexibilidade
              </h3>
              <p className="text-sm text-muted-foreground">
                Disponibilidade para horários variados
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-card-foreground mb-8 text-center">
            Vagas Abertas
          </h2>

          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-background rounded-lg p-6 border border-accent/20">
              <h3 className="text-xl font-heading font-bold text-foreground mb-2">
                Técnico de Fibra Óptica
              </h3>
              <p className="text-muted-foreground mb-4">
                Instalação e manutenção de redes FTTH. Experiência com fusão e certificação de fibra.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">Técnico</span>
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">Fortaleza/CE</span>
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">CLT</span>
              </div>
            </div>

            <div className="bg-background rounded-lg p-6 border border-accent/20">
              <h3 className="text-xl font-heading font-bold text-foreground mb-2">
                Atendente de Suporte
              </h3>
              <p className="text-muted-foreground mb-4">
                Atendimento ao cliente via WhatsApp e telefone. Solução de problemas técnicos básicos.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">Suporte</span>
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">Remoto</span>
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">CLT</span>
              </div>
            </div>

            <div className="bg-background rounded-lg p-6 border border-accent/20">
              <h3 className="text-xl font-heading font-bold text-foreground mb-2">
                Vendedor Externo
              </h3>
              <p className="text-muted-foreground mb-4">
                Prospecção de clientes, apresentação de planos e fechamento de contratos.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">Vendas</span>
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">Fortaleza/CE</span>
                <span className="px-3 py-1 bg-accent/20 text-accent text-sm rounded-full">Comissão</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4 text-center">
              Candidate-se Agora
            </h2>
            <p className="text-muted-foreground text-center mb-8">
              Preencha o formulário e envie seu currículo
            </p>

            <form onSubmit={handleSubmit} className="space-y-6 bg-card p-8 rounded-lg border border-accent/20">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-card-foreground mb-2">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-card-foreground mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-card-foreground mb-2">
                    Telefone/WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-card-foreground mb-2">
                    Vaga de Interesse *
                  </label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                  >
                    <option value="">Selecione</option>
                    <option value="Técnico de Fibra Óptica">Técnico de Fibra Óptica</option>
                    <option value="Atendente de Suporte">Atendente de Suporte</option>
                    <option value="Vendedor Externo">Vendedor Externo</option>
                    <option value="Outra vaga">Outra vaga</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-card-foreground mb-2">
                  Currículo (PDF) *
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-card-foreground">
                  Perguntas de Triagem:
                </p>
                
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="hasNetworkExperience"
                    checked={formData.hasNetworkExperience}
                    onChange={handleCheckboxChange}
                    className="mt-1"
                  />
                  <span className="text-sm text-muted-foreground">
                    Tenho experiência com fibra óptica e/ou redes
                  </span>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="hasFlexibleHours"
                    checked={formData.hasFlexibleHours}
                    onChange={handleCheckboxChange}
                    className="mt-1"
                  />
                  <span className="text-sm text-muted-foreground">
                    Tenho disponibilidade para horários flexíveis (incluindo fins de semana)
                  </span>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="hasCNH"
                    checked={formData.hasCNH}
                    onChange={handleCheckboxChange}
                    className="mt-1"
                  />
                  <span className="text-sm text-muted-foreground">
                    Possuo CNH categoria B (para vagas externas)
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-semibold text-card-foreground mb-2">
                  Por que você quer trabalhar na SalesNet? *
                </label>
                <textarea
                  required
                  rows={4}
                  name="about"
                  value={formData.about}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
                ></textarea>
              </div>

              <Button type="submit" variant="cta" size="lg" className="w-full">
                Enviar Candidatura
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Seus dados serão analisados por nossa IA e os candidatos selecionados serão contatados via WhatsApp
              </p>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default TrabalheConosco;
