import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

/** The Finite mark — a bounded loop (the process) that resolves to an accepting state (the
 *  double-circle terminal node). Arc inherits currentColor (the neutral loop); the node is the
 *  ultramarine trace. Pure SVG, token-driven, no asset. */
export function FiniteMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-6 w-6', className)}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 18.6 A 6.6 6.6 0 1 1 17.05 16.25"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle
        cx="17.05"
        cy="16.25"
        r="2.15"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
      />
      <circle cx="17.05" cy="16.25" r="1" fill="hsl(var(--primary))" />
    </svg>
  );
}

/** Finite wordmark — the mark + lowercase name with the accent period as the accepting state
 *  (the sentence ends: "finite."). Weight 500, tight tracking — the premium tell, never bold. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-foreground', className)}>
      <FiniteMark />
      <span className="text-xl font-medium lowercase tracking-tight">
        {SITE.brandName}
        <span className="text-primary">.</span>
      </span>
    </span>
  );
}
