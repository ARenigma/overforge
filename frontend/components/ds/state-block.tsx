import { AlertCircle } from 'lucide-react';
import { type ReactNode } from 'react';

function StateBlock({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border px-6 py-16 text-center ${className ?? ''}`}
    >
      {icon}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * Empty State fragment (Supabase design-system "Empty State"):
 * dashed outline, muted icon, optional CTA. Caller supplies the icon.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <StateBlock
      className="border-dashed border-border"
      icon={<span className="text-foreground-ghost">{icon}</span>}
      title={title}
      description={description}
      action={action}
    />
  );
}

/**
 * Error Display fragment (Supabase design-system "Error Display"):
 * destructive outline + tint, fixed alert icon.
 */
export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <StateBlock
      className="border-destructive/40 bg-destructive/10"
      icon={<AlertCircle className="h-8 w-8 text-destructive" />}
      title={title}
      description={description}
    />
  );
}
