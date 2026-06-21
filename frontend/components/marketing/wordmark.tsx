import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

/** Overforge wordmark — a brand-token mark + Geist name. No logo asset needed. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11.5 8 3l5 8.5" />
          <path d="M5.5 11.5h5" />
        </svg>
      </span>
      <span className="text-xl font-bold tracking-tight text-foreground">{SITE.brandName}</span>
    </span>
  );
}
