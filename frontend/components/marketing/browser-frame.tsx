import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A browser-window chrome to frame product visuals on the landing page — traffic-light dots
 * + a centered secure-URL pill. Token-driven (sharp corners via the global rounded-xl→0 rule,
 * --success for the lock). Reusable for any "this is the real product, in a browser" shot.
 */
export function BrowserFrame({
  url,
  children,
  className,
}: {
  url?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-3 border-b border-border bg-surface-200 px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-muted" />
          <span className="h-3 w-3 rounded-full bg-muted" />
          <span className="h-3 w-3 rounded-full bg-muted" />
        </div>
        {url && (
          <div className="mx-auto flex min-w-0 max-w-sm items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-0.5 font-mono text-xs text-foreground-subtle">
            <Lock className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
            <span className="truncate">{url}</span>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
