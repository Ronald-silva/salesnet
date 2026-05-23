import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/api/admin';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';

type Status = 'loading' | 'connected' | 'disconnected' | 'error';

export default function ConfiguracoesPage() {
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
    } catch (err) {
      setQrError('QR code indisponível. Tente novamente.');
    } finally {
      setQrLoading(false);
    }
  }, []);

  // Verifica status ao montar e a cada 10s
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Quando desconectado, busca QR automaticamente
  useEffect(() => {
    if (status === 'disconnected') {
      fetchQR();
    }
  }, [status, fetchQR]);

  // Countdown + auto-refresh do QR a cada 30s
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie a conexão WhatsApp da plataforma</p>
      </div>

      {/* Card de status */}
      <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium flex items-center gap-2">
            {status === 'connected' ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            WhatsApp
          </h2>

          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            status === 'connected'
              ? 'bg-green-500/10 text-green-400'
              : status === 'loading'
              ? 'bg-muted text-muted-foreground'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {status === 'connected' ? 'Conectado' :
             status === 'loading' ? 'Verificando...' :
             status === 'error' ? 'Erro' : 'Desconectado'}
          </span>
        </div>

        {/* Conectado */}
        {status === 'connected' && (
          <div className="flex items-center gap-3 bg-green-500/10 rounded-lg p-4">
            <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />
            <div>
              <p className="font-medium text-green-400">WhatsApp conectado</p>
              {phoneNumber && (
                <p className="text-sm text-muted-foreground mt-0.5">{phoneNumber}</p>
              )}
            </div>
          </div>
        )}

        {/* Desconectado — mostra QR */}
        {status === 'disconnected' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escaneie o QR code abaixo com o WhatsApp:
              <br />
              <span className="font-medium text-foreground">Menu → Dispositivos vinculados → Vincular dispositivo</span>
            </p>

            <div className="flex flex-col items-center gap-4">
              {qrLoading && (
                <div className="w-64 h-64 flex items-center justify-center bg-white rounded-xl">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {!qrLoading && qrCode && (
                <div className="bg-white p-3 rounded-xl">
                  <img
                    src={qrCode}
                    alt="QR Code WhatsApp"
                    className="w-64 h-64 block"
                  />
                </div>
              )}

              {!qrLoading && qrError && (
                <div className="w-64 h-64 flex items-center justify-center bg-card border border-border rounded-xl text-center p-4">
                  <p className="text-sm text-muted-foreground">{qrError}</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Atualiza em {countdown}s
                </span>
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
    </div>
  );
}
