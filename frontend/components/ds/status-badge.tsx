import { type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * StatusBadge fragment: one place for the status/score/recommendation colour convention.
 * Callers map their domain value to an `intent`; the token classes live here only.
 */
export type BadgeIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const INTENT: Record<BadgeIntent, string> = {
  neutral: 'border-border bg-transparent text-muted-foreground',
  info: 'border-primary/40 bg-primary/10 text-primary',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning-foreground',
  danger: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function StatusBadge({
  intent,
  children,
  className,
}: {
  intent: BadgeIntent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn('w-fit text-xs', INTENT[intent], className)}>
      {children}
    </Badge>
  );
}
