import { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  action,
  compact,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Tighter spacing for pages where vertical room is scarce (e.g. the AI
   * Assistant's chat frame on mobile) — same content, less chrome above it. */
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${compact ? 'mb-2 sm:mb-6' : 'mb-6'}`}>
      <div>
        <h1 className={`font-bold text-slate-900 dark:text-slate-100 ${compact ? 'text-lg sm:text-2xl' : 'text-xl sm:text-2xl'}`}>{title}</h1>
        {subtitle && (
          <p className={`mt-1 text-sm text-slate-500 dark:text-slate-400 ${compact ? 'hidden sm:block' : ''}`}>{subtitle}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
