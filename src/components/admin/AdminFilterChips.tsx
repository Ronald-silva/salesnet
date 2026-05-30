interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface AdminFilterChipsProps<T extends string> {
  label?: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}

export function AdminFilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: AdminFilterChipsProps<T>) {
  return (
    <div className="space-y-1.5 min-w-0">
      {label && <span className="text-xs font-medium text-muted-foreground px-0.5">{label}</span>}
      <div className="-mx-1 px-1 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 w-max min-w-full pb-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors min-h-[40px] ${
                value === opt.value
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
