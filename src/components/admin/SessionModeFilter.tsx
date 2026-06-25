import { cn } from '@/lib/utils';

const SESSION_MODES = [
  { value: null, label: 'Todos' },
  { value: 'billing', label: 'Cobrança 💰', color: 'border-amber-700/40 text-amber-400 data-[active=true]:bg-amber-900/50 data-[active=true]:border-amber-600 data-[active=true]:text-amber-300' },
  { value: 'support', label: 'Suporte 🔧', color: 'border-red-700/40 text-red-400 data-[active=true]:bg-red-900/50 data-[active=true]:border-red-600 data-[active=true]:text-red-300' },
  { value: 'commercial', label: 'Comercial 📈', color: 'border-green-700/40 text-green-400 data-[active=true]:bg-green-900/50 data-[active=true]:border-green-600 data-[active=true]:text-green-300' },
  { value: 'prospect', label: 'Prospect 🎯', color: 'border-blue-700/40 text-blue-400 data-[active=true]:bg-blue-900/50 data-[active=true]:border-blue-600 data-[active=true]:text-blue-300' },
  { value: 'default', label: 'Geral', color: 'border-gray-600 text-gray-400 data-[active=true]:bg-gray-700 data-[active=true]:border-gray-500 data-[active=true]:text-gray-200' },
] as const;

interface Props {
  activeMode: string | null;
  onChange: (mode: string | null) => void;
}

export function SessionModeFilter({ activeMode, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap px-4 pb-2">
      {SESSION_MODES.map((mode) => {
        const isActive = activeMode === mode.value;
        if (mode.value === null) {
          return (
            <button
              key="all"
              type="button"
              onClick={() => onChange(null)}
              className={cn(
                'px-2.5 py-0.5 rounded-full border text-[11px] font-medium transition-colors',
                isActive
                  ? 'bg-gray-700 border-gray-500 text-gray-200'
                  : 'border-gray-600 text-gray-500 hover:text-gray-300',
              )}
            >
              Todos
            </button>
          );
        }
        return (
          <button
            key={mode.value}
            type="button"
            data-active={isActive}
            onClick={() => onChange(isActive ? null : mode.value)}
            className={cn(
              'px-2.5 py-0.5 rounded-full border text-[11px] font-medium transition-colors',
              mode.color,
              !isActive && 'hover:opacity-80',
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
