import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function AdminPageHeader({ title, description, icon, actions }: AdminPageHeaderProps) {
  return (
    <header className="space-y-3 pb-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl truncate">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 shrink-0 w-full sm:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
