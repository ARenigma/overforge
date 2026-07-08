import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

/** The Finite mark — "the clipped loop": an infinity band whose right lobe is severed and
 *  terminates in the accent dot. Infinite input, finite resolution. The loop inherits
 *  currentColor; the terminal dot is the ultramarine trace. On mount the stroke draws itself and
 *  the dot lands, then everything stops (`.finite-mark` keyframes in globals.css — the brand's
 *  "settle, don't float" law as a logo). Pure SVG, token-driven, no asset. */
function FiniteMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('finite-mark h-6 w-6', className)}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 12 12 C 9.6 8.4 4.2 8.4 4.2 12 C 4.2 15.6 9.6 15.6 12 12 C 13.8 9.3 16.8 8.1 18.6 9.3"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="19.9" cy="10.6" r="1.7" fill="hsl(var(--primary))" />
    </svg>
  );
}

/** Finite wordmark — the clipped loop + lowercase name with the accent period as the terminal
 *  state (the sentence ends: "finite."). Weight 500, tight tracking — never bold. */
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
