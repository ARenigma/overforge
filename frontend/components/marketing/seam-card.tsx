'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Seam card — the anti-box. A 1px gradient border layer with a cursor-tracked radial highlight
 *  painted ON THE SEAM (Supabase's recipe: light lives in the border, never a glow blob over
 *  content). The inner surface stays flat; on hover the seam warms toward the trace color where
 *  the pointer is. CSS-vars + one mousemove handler — no animation library, settles instantly. */
export function SeamCard({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--seam-x', `${e.clientX - r.left}px`);
    el.style.setProperty('--seam-y', `${e.clientY - r.top}px`);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={cn('group relative rounded-lg p-px', className)}
      style={{
        background: 'linear-gradient(to bottom, hsl(var(--border)), hsl(var(--border) / 0.55))',
      }}
    >
      {/* Cursor-tracked highlight, clipped to the 1px seam by the p-px stacking. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-slow ease-out-cubic group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(18rem circle at var(--seam-x, 50%) var(--seam-y, 0%), hsl(var(--primary) / 0.55), transparent 70%)',
        }}
      />
      <div className={cn('relative h-full rounded-[7px] bg-card', innerClassName)}>{children}</div>
    </div>
  );
}
