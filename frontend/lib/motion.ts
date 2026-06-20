/*
 * Centralized motion tokens — one place for easing + durations so every
 * Framer Motion animation feels consistent (no orphan magic numbers).
 */
import type { Variants } from 'framer-motion';

export const EASE = [0.16, 1, 0.3, 1] as const; // easeOutExpo-ish
export const DUR = { fast: 0.2, base: 0.4, slow: 0.6 } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.base, ease: EASE },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
