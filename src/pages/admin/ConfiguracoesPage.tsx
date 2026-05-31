import { useState } from 'react';
import { Settings } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminFilterChips } from '@/components/admin/AdminFilterChips';
import WhatsAppSettings from './settings/WhatsAppSettings';
import BusinessSettings from './settings/BusinessSettings';

type SettingsTab = 'connection' | 'business';

export default function ConfiguracoesPage() {
  const [tab, setTab] = useState<SettingsTab>('connection');

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Configurações"
        description="Gerencie a conexão WhatsApp e os dados de negócio da plataforma."
        icon={<Settings className="h-5 w-5" />}
      />

      <AdminFilterChips<SettingsTab>
        value={tab}
        options={[
          { value: 'connection', label: 'Conexão' },
          { value: 'business', label: 'Negócio' },
        ]}
        onChange={setTab}
      />

      {tab === 'connection' ? <WhatsAppSettings /> : <BusinessSettings />}
    </div>
  );
}
