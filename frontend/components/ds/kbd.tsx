import { cn } from '@/lib/utils';

/**
 * Kbd fragment (Supabase design-system "Keyboard Shortcut"): renders a key-cap. When `label` is
 * provided, wraps the cap + trailing text in a muted hint line (e.g. "⌘ ↵ to send").
 */
export function Kbd({
  keys,
  label,
  className,
}: {
  keys: string;
  label?: string;
  className?: string;
}) {
  const cap = (
    <kbd className="inline-flex items-center rounded-sm border border-border bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground">
      {keys}
    </kbd>
  );

  if (!label) return cap;

  return (
    <p className={cn('text-[10px] text-muted-foreground/60', className)}>
      {cap} {label}
    </p>
  );
}
