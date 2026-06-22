'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Info Tooltip fragment (Supabase design-system "Info Tooltip"): an inline label followed by a
 * small info affordance that reveals help text on hover/focus. The label inherits its text color
 * from the wrapper so callers can place it on foreground or muted surfaces.
 *
 * Requires a TooltipProvider ancestor (mounted once in the root layout).
 */
export function InfoTooltip({
  label,
  tip,
  side = 'top',
  className,
}: {
  label: string;
  tip: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="text-sm">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`More info: ${label}`}
            className="shrink-0 rounded-sm text-muted-foreground/40 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[220px] text-xs leading-relaxed">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
