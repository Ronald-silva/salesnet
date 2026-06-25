import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { adminApi } from '@/api/admin';
import type { SuggestionResponse } from '@/api/admin';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const DISMISSED_PREFIX = 'salesnet:copilot_dismissed_';
const DISMISS_TTL_MS = 5 * 60 * 1000; // 5 min

export function isCopilotDismissed(conversationId: string): boolean {
  const ts = localStorage.getItem(`${DISMISSED_PREFIX}${conversationId}`);
  if (!ts) return false;
  return Date.now() - Number(ts) < DISMISS_TTL_MS;
}

function setCopilotDismissed(conversationId: string): void {
  localStorage.setItem(`${DISMISSED_PREFIX}${conversationId}`, String(Date.now()));
}

interface CopilotSuggestionProps {
  conversationId: string;
  onUse: (text: string) => void;
  onEdit: (text: string) => void;
  onDismiss: () => void;
}

export function CopilotSuggestion({
  conversationId,
  onUse,
  onEdit,
  onDismiss,
}: CopilotSuggestionProps): React.ReactElement {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<SuggestionResponse>({
    queryKey: ['copilot-suggestion', conversationId],
    queryFn: () => adminApi.getSuggestion(conversationId),
    retry: 1,
    staleTime: 60_000,
  });

  const spinning = isLoading || isFetching;

  return (
    <div className="border-l-2 border-teal-500 bg-[#0d1117] rounded-r-xl p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-teal-400 text-xs font-medium">
          <span aria-hidden="true">✦</span>
          <span>Sofia sugere:</span>
        </span>
        <button
          type="button"
          onClick={() => { void refetch(); }}
          disabled={spinning}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
          title="Nova sugestão"
          aria-label="Recarregar sugestão"
        >
          <RefreshCw className={cn('h-3 w-3', spinning && 'animate-spin')} />
        </button>
      </div>

      {/* Loading skeleton — 3 linhas */}
      {spinning && (
        <div className="space-y-1.5 py-1" role="status" aria-label="Carregando sugestão">
          <Skeleton className="h-3 w-full bg-gray-700/60" />
          <Skeleton className="h-3 w-4/5 bg-gray-700/60" />
          <Skeleton className="h-3 w-3/5 bg-gray-700/60" />
        </div>
      )}

      {/* Erro — não-bloqueante */}
      {isError && !spinning && (
        <p className="text-xs text-gray-500 italic py-1">
          Sofia não conseguiu sugerir agora. Digite sua resposta.
        </p>
      )}

      {/* Sugestão */}
      {data && !spinning && (
        <>
          <p className="text-sm text-gray-200 leading-relaxed">{data.suggestion}</p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onUse(data.suggestion)}
              className="flex-1 bg-teal-800/60 hover:bg-teal-700/60 text-teal-200 text-xs py-1.5 rounded-lg transition-colors font-medium"
            >
              Usar esta resposta
            </button>
            <button
              type="button"
              onClick={() => onEdit(data.suggestion)}
              className="flex-1 bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 text-xs py-1.5 rounded-lg transition-colors"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => {
                setCopilotDismissed(conversationId);
                onDismiss();
              }}
              className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors px-1"
            >
              Ignorar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
