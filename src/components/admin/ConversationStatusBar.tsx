import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { cn } from '@/lib/utils';

type ActiveFilter = 'human' | 'bot' | 'waiting' | 'all' | 'starred';

interface Props {
  activeFilter: ActiveFilter;
  onFilter: (filter: ActiveFilter) => void;
}

interface Pill {
  key: ActiveFilter;
  emoji: string;
  label: string;
  countKey: 'human' | 'bot' | 'waiting' | 'closedToday' | 'starred';
  color: string;
  activeColor: string;
  clickable: boolean;
}

const PILLS: Pill[] = [
  {
    key: 'human',
    emoji: '🤝',
    label: 'Humano',
    countKey: 'human',
    color: 'border-orange-700/40 text-orange-400',
    activeColor: 'bg-orange-900/50 border-orange-600 text-orange-300',
    clickable: true,
  },
  {
    key: 'waiting',
    emoji: '⏸',
    label: 'Espera',
    countKey: 'waiting',
    color: 'border-blue-700/40 text-blue-400',
    activeColor: 'bg-blue-900/50 border-blue-600 text-blue-300',
    clickable: true,
  },
  {
    key: 'bot',
    emoji: '🤖',
    label: 'Sofia',
    countKey: 'bot',
    color: 'border-gray-600 text-gray-400',
    activeColor: 'bg-gray-700 border-gray-500 text-gray-200',
    clickable: true,
  },
  {
    key: 'starred',
    emoji: '★',
    label: 'Favoritos',
    countKey: 'starred',
    color: 'border-amber-700/40 text-amber-400',
    activeColor: 'bg-amber-900/50 border-amber-600 text-amber-300',
    clickable: true,
  },
  {
    key: 'all',
    emoji: '✅',
    label: 'Encerrados hoje',
    countKey: 'closedToday',
    color: 'border-green-800/40 text-green-500',
    activeColor: 'bg-green-900/40 border-green-700 text-green-300',
    clickable: false,
  },
];

export function ConversationStatusBar({ activeFilter, onFilter }: Props) {
  const stats = useQuery({
    queryKey: ['admin-conv-stats'],
    queryFn: adminApi.getConversationStats,
    refetchInterval: 10_000,
  });

  const data = stats.data;

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-4 pt-3 pb-1">
      {PILLS.map((pill) => {
        const count = data ? data[pill.countKey] : null;
        const isActive = activeFilter === pill.key && pill.clickable;
        return (
          <button
            key={pill.key}
            type="button"
            disabled={!pill.clickable}
            onClick={() => pill.clickable && onFilter(isActive ? 'all' : pill.key)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors',
              isActive ? pill.activeColor : pill.color,
              pill.clickable
                ? 'cursor-pointer hover:opacity-80'
                : 'cursor-default opacity-70',
            )}
          >
            <span>{pill.emoji}</span>
            <span>{pill.label}</span>
            {count !== null && (
              <span className="ml-0.5 font-bold">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
