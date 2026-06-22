import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pagination fragment (Supabase design-system "Pagination"): a prev/next pager with a
 * "Page X of N" readout. Renders nothing when there's a single page.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const canPrev = page > 1;
  const canNext = page < pageCount;

  const btn =
    'inline-flex h-8 items-center gap-1 border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40';

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <p className="text-xs text-muted-foreground">
        Page <span className="font-medium text-foreground">{page}</span> of {pageCount}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          className={btn}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <button
          type="button"
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          className={btn}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
