import { type ReactNode } from 'react';

/**
 * Page Header fragment (modeled on the Supabase design-system "Page Header"):
 * a title + optional description on the left, an actions slot on the right.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 space-y-1">
      {/* Title + action share one center-aligned row; description sits on the next line. */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
