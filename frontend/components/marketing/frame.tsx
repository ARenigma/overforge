import { cn } from '@/lib/utils';

/** Product frame — the ONE chrome every product visual sits in: monochrome dot rail (never Mac
 *  traffic lights), inset gutter, inner hairline card, deep stacked shadow + ring. Theme-proof. */
export function ProductFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg bg-surface-inset p-2 shadow-[0_1px_1px_rgba(0,0,0,0.04),0_8px_16px_-8px_rgba(0,0,0,0.12),0_40px_80px_-24px_rgba(0,0,0,0.18)] ring-1 ring-border',
        className
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-card">{children}</div>
    </div>
  );
}
