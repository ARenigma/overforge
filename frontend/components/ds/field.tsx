import { type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Field fragment (Supabase design-system "Form Item Layout"): a mono-uppercase label,
 * an optional required/optional marker, an optional right-aligned label action, the control
 * slot, and optional description / inline-error lines.
 *
 * Presentational only — works with plain useState forms. For react-hook-form forms use the
 * rhf-backed FormField/FormItem in components/ui/form.tsx instead.
 */
export function Field({
  id,
  label,
  required,
  optional,
  labelAction,
  description,
  error,
  className,
  children,
}: {
  /** htmlFor target; also used to build the description/error element ids. */
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  /** Rendered at the end of the label row (e.g. a "Forgot password?" link). */
  labelAction?: ReactNode;
  description?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          {label}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden="true">
              *
            </span>
          )}
          {optional && (
            <span className="ml-1 font-sans text-xs normal-case tracking-normal text-foreground-subtle">
              (optional)
            </span>
          )}
        </Label>
        {labelAction && <div className="shrink-0">{labelAction}</div>}
      </div>

      {children}

      {description && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
