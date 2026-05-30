import { useEffect, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Status = 'loading' | 'connected' | 'disconnected' | 'error';

function ConnectionCard() {
  const [status, setStatus] = useState<Status>('loading');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await adminApi.getWhatsAppStatus();
      if (data.connected) {
        setStatus('connected');
        setPhoneNumber(data.phoneNumber ?? null);
        setQrCode(null);
      } else {
        setStatus('disconnected');
      }
    } catch {
      setStatus('error');
    }
  }, []);

  const fetchQR = useCallback(async () => {
    setQrLoading(true);
    setQrError(null);
    try {
      const data = await adminApi.getWhatsAppQR();
      setQrCode(data.qrCode);
      setCountdown(30);
    } catch {
      setQrError('QR code indisponível. Tente novamente.');
    } finally {
      setQrLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (status === 'disconnected') fetchQR();
  }, [status, fetchQR]);

  useEffect(() => {
    if (status !== 'disconnected' || !qrCode) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchQR();
          return 30;
        }
        return c - 1;
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [status, qrCode, fetchQR]);

  return (
    <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-medium flex items-center gap-2">
          {status === 'connected' ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-muted-foreground" />
          )}
          WhatsApp (instância principal)
        </h2>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            status === 'connected'
              ? 'bg-green-500/10 text-green-400'
              : status === 'loading'
              ? 'bg-muted text-muted-foreground'
              : 'bg-red-500/10 text-red-400'
          }`}
        >
          {status === 'connected'
            ? 'Conectado'
            : status === 'loading'
            ? 'Verificando...'
            : status === 'error'
            ? 'Erro'
            : 'Desconectado'}
        </span>
      </div>

      {status === 'connected' && (
        <div className="flex items-center gap-3 bg-green-500/10 rounded-lg p-4">
          <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />
          <div>
            <p className="font-medium text-green-400">WhatsApp conectado</p>
            {phoneNumber && <p className="text-sm text-muted-foreground mt-0.5">{phoneNumber}</p>}
          </div>
        </div>
      )}

      {status === 'disconnected' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escaneie o QR code abaixo com o WhatsApp:
            <br />
            <span className="font-medium text-foreground">
              Menu → Dispositivos vinculados → Vincular dispositivo
            </span>
          </p>

          <div className="flex flex-col items-center gap-4">
            {qrLoading && (
              <div className="w-64 h-64 flex items-center justify-center bg-white rounded-xl">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {!qrLoading && qrCode && (
              <div className="bg-white p-3 rounded-xl">
                <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64 block" />
              </div>
            )}
            {!qrLoading && qrError && (
              <div className="w-64 h-64 flex items-center justify-center bg-card border border-border rounded-xl text-center p-4">
                <p className="text-sm text-muted-foreground">{qrError}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Atualiza em {countdown}s</span>
              <button
                onClick={fetchQR}
                disabled={qrLoading}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                Gerar novo QR
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Verificando status...
        </div>
      )}
    </div>
  );
}

function InstancesCard() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');

  const instances = useQuery({
    queryKey: ['admin-instances'],
    queryFn: adminApi.getInstances,
  });

  const create = useMutation({
    mutationFn: (name: string) => adminApi.createInstance(name),
    onSuccess: () => {
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['admin-instances'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteInstance(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-instances'] }),
  });

  const list = instances.data?.instances ?? [];

  return (
    <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4 max-w-2xl">
      <h2 className="font-medium">Instâncias WhatsApp</h2>

      <div className="flex gap-2">
        <Input
          placeholder="Nome da nova instância"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button
          onClick={() => create.mutate(newName)}
          disabled={!newName.trim() || create.isPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          {create.isPending ? 'Criando...' : 'Criar'}
        </Button>
      </div>
      {create.isError && (
        <p className="text-sm text-destructive">
          {(create.error as Error)?.message ?? 'Falha ao criar instância.'}
        </p>
      )}

      <div className="space-y-2">
        {instances.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!instances.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma instância adicional cadastrada.</p>
        )}
        {list.map((inst) => (
          <div
            key={inst.id}
            className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
          >
            <div>
              <p className="font-medium text-sm">{inst.instanceName}</p>
              {inst.status && (
                <Badge variant="outline" className="mt-1 text-xs">
                  {inst.status}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(inst.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WhatsAppSettings() {
  return (
    <div className="space-y-6">
      <ConnectionCard />
      <InstancesCard />
    </div>
  );
}
