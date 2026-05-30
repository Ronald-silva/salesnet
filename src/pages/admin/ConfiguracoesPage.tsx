import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WhatsAppSettings from './settings/WhatsAppSettings';
import BusinessSettings from './settings/BusinessSettings';

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie a conexão WhatsApp e os dados de negócio da plataforma.
        </p>
      </div>

      <Tabs defaultValue="connection" className="w-full">
        <TabsList>
          <TabsTrigger value="connection">Conexão</TabsTrigger>
          <TabsTrigger value="business">Negócio</TabsTrigger>
        </TabsList>
        <TabsContent value="connection" className="mt-4">
          <WhatsAppSettings />
        </TabsContent>
        <TabsContent value="business" className="mt-4">
          <BusinessSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
