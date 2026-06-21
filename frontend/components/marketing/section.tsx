'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/marketing/reveal';

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

/**
 * Faded hairline between sections — solid in the middle, fades to transparent at
 * both ends with the same edge mask as the marquee, so every separator reads identically.
 */
export function SectionDivider() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6" aria-hidden="true">
      <div
        className="h-px w-full bg-border"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
          maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
        }}
      />
    </div>
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
    <Reveal className={cn(align === 'center' && 'text-center')}>
      <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {lead} {tail && <span className="text-muted-foreground">{tail}</span>}
      </h2>
      {sub && (
        <p
          className={cn(
            'mt-3 max-w-xl text-pretty text-muted-foreground',
            align === 'center' && 'mx-auto'
          )}
        >
          {sub}
        </p>
      )}
    </Reveal>
  );
}
