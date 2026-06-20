'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeUp, staggerContainer } from '@/lib/motion';

/** One spacing + max-width rhythm for every marketing section (coherence). */
export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn('mx-auto w-full max-w-5xl px-6 py-24 sm:py-28', className)}>
      {children}
    </section>
  );
}

/** Two-tone section heading (foreground lead + muted tail), Supabase-style. */
export function SectionHeading({
  lead,
  tail,
  sub,
  align = 'center',
}: {
  lead: string;
  tail?: string;
  sub?: string;
  align?: 'left' | 'center';
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      className={cn(align === 'center' && 'text-center')}
    >
      <motion.h2
        variants={fadeUp}
        className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {lead} {tail && <span className="text-muted-foreground">{tail}</span>}
      </motion.h2>
      {sub && (
        <motion.p
          variants={fadeUp}
          className={cn(
            'mt-3 max-w-xl text-pretty text-muted-foreground',
            align === 'center' && 'mx-auto'
          )}
        >
          {sub}
        </motion.p>
      )}
    </motion.div>
  );
}
