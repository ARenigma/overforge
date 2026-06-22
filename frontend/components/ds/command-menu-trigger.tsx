'use client';

import { Search } from 'lucide-react';
import { Kbd } from '@/components/ds/kbd';
import { cn } from '@/lib/utils';

/** Event name the CommandMenuProvider listens for to open the ⌘K palette. */
export const OPEN_COMMAND_MENU_EVENT = 'overforge:open-command-menu';

/**
 * Visible affordance for the global ⌘K Command Menu. Decoupled from the provider via a custom
 * window event, so it can live anywhere without prop-drilling open state.
 */
export function CommandMenuTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_MENU_EVENT))}
      aria-label="Open command menu"
      className={cn(
        'inline-flex h-9 items-center gap-2 border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className
      )}
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Search</span>
      <Kbd keys="⌘K" />
    </button>
  );
}
