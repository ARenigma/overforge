'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* The FSM scroll rail — the page IS a state machine. A fixed vertical mini-graph (desktop only):
 * each landing section is a state node; the one in view is the current state (double-circle, the
 * accepting-state motif); edges are the transitions you've already walked. Click a node to
 * transition. Nobody else can claim this honestly — the site's own architecture, drawn on it. */

const NODES = [
  { id: 'hero', n: '01', label: 'start' },
  { id: 'why', n: '02', label: 'why' },
  { id: 'anatomy', n: '03', label: 'anatomy' },
  { id: 'product', n: '04', label: 'pipeline' },
  { id: 'security', n: '05', label: 'isolation' },
  { id: 'end', n: '06', label: 'end' },
] as const;

export function StateRail() {
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const els = NODES.map((n) => document.getElementById(n.id)).filter(
      (e): e is HTMLElement => !!e
    );
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        // The entry nearest the top band of the viewport wins — deterministic, no flicker.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        const idx = NODES.findIndex((n) => n.id === top.target.id);
        if (idx >= 0) setActive(idx);
      },
      { rootMargin: '-20% 0px -55% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <nav
      aria-label="Page states"
      className="fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 xl:block"
    >
      <ol className="flex flex-col items-center">
        {NODES.map((node, i) => (
          <li key={node.id} className="flex flex-col items-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  'my-1 h-6 w-px transition-colors duration-slow ease-out-cubic',
                  i <= active ? 'bg-primary/50' : 'bg-border'
                )}
              />
            )}
            <button
              type="button"
              onClick={() => go(node.id)}
              aria-label={`${node.n} — ${node.label}`}
              aria-current={i === active ? 'true' : undefined}
              className="group relative grid h-5 w-5 place-items-center"
            >
              {/* Node: past = filled dot, current = double circle (accepting state), future = ring. */}
              <span
                className={cn(
                  'absolute inset-0 rounded-full border transition-all duration-slow ease-out-cubic',
                  i === active
                    ? 'scale-100 border-primary'
                    : 'scale-[0.55] border-foreground-ghost group-hover:border-foreground-subtle'
                )}
              />
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors duration-slow ease-out-cubic',
                  i < active && 'bg-foreground-subtle',
                  i === active && 'bg-primary',
                  i > active && 'bg-transparent'
                )}
              />
              {/* Mono label on hover of the rail. */}
              <span className="pointer-events-none absolute left-7 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-foreground-subtle opacity-0 transition-opacity duration-fast ease-out-cubic group-hover:opacity-100">
                {node.n} · {node.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
