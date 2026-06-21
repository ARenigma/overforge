'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-reveal wrapper — pure-CSS entrance via tailwindcss-animate, no JS animation library.
 * This is the single replacement for Framer Motion fade-ups across the marketing site:
 * it plays one subtle fade + rise the first time the block scrolls into view, then never again.
 * Interaction feedback (hover/active/etc.) is intentionally NOT handled here — that stays
 * instant CSS on each element. Honors prefers-reduced-motion (renders immediately, no motion).
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Optional stagger, in ms, for sibling reveals. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -80px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      className={cn(
        shown
          ? 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 motion-safe:fill-mode-both'
          : 'motion-safe:opacity-0',
        className
      )}
    >
      {children}
    </div>
  );
}
