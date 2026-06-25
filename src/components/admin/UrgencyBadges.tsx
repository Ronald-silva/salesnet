// src/components/admin/UrgencyBadges.tsx
import { cn } from '@/lib/utils';

interface UrgencyBadgesProps {
  reasons: string[];
  score: number;
}

function pillColor(score: number): string {
  if (score >= 100) return 'bg-red-900/60 text-red-300';
  if (score >= 50) return 'bg-amber-900/60 text-amber-300';
  return 'bg-blue-900/60 text-blue-300';
}

export function UrgencyBadges({ reasons, score }: UrgencyBadgesProps) {
  if (reasons.length === 0) return null;
  const color = pillColor(score);
  const visible = reasons.slice(0, 2);
  const extra = reasons.length - 2;

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {visible.map((r) => (
        <span key={r} className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', color)}>
          {r}
        </span>
      ))}
      {extra > 0 && (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', color)}>
          +{extra}
        </span>
      )}
    </div>
  );
}
