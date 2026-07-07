import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Metric Card fragment (modeled on the Supabase design-system "Metric Card"):
 * a mono label, a large tabular value, and an optional hint / trailing icon.
 * `size="lg"` is the admin-analytics register — one big plain number that reads
 * from across the room (mono, 5xl), for dashboards that lead with totals.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon,
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card', size === 'lg' ? 'p-5' : 'p-4')}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon && <span className="shrink-0 text-foreground-ghost">{icon}</span>}
      </div>
      <p
        className={cn(
          'tabular-nums text-foreground',
          size === 'lg'
            ? 'mt-3 font-mono text-4xl font-medium tracking-tight sm:text-5xl'
            : 'mt-2 text-2xl font-semibold tracking-tight'
        )}
      >
        {value}
      </p>
      {hint && (
        <p
          className={cn(
            'text-muted-foreground',
            size === 'lg' ? 'mt-1.5 text-xs' : 'mt-0.5 text-xs'
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
