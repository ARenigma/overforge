'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/marketing/reveal';

/** Section background band — base sits on the page; recessed/raised create subtle charcoal
 *  depth between adjacent sections (multi-band layering). base = no override. */
const SECTION_TONES = {
  base: '',
  raised: 'bg-surface-200',
  recessed: 'bg-surface-75',
} as const;

/** One spacing + max-width rhythm for every marketing section (coherence). The tonal band is
 *  full-bleed; the content stays capped at max-w-5xl. */
export function Section({
  id,
  className,
  tone = 'base',
  children,
}: {
  id?: string;
  className?: string;
  tone?: keyof typeof SECTION_TONES;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn('w-full', SECTION_TONES[tone])}>
      <div className={cn('mx-auto w-full max-w-5xl px-6 py-24 sm:py-28', className)}>
        {children}
      </div>
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

/** Editorial section header — the anti-template header: LEFT-aligned two-tone title under an
 *  indexed mono eyebrow (`02 — WHY IT WORKS`), with an optional right-hand meta slot (a note or
 *  CTA) that bottom-aligns against the title. Every landing section uses this, center is banned. */
export function EditorialHeader({
  index,
  eyebrow,
  lead,
  tail,
  sub,
  meta,
}: {
  index: string;
  eyebrow: string;
  /** Lead/tail accept nodes so a crucial phrase can carry the trace color (together.ai/supabase
   *  highlight exactly one payoff phrase per headline — never the whole line). */
  lead: ReactNode;
  tail?: ReactNode;
  sub?: string;
  meta?: ReactNode;
}) {
  return (
    <Reveal>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="max-w-3xl">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
            <span className="text-primary">{index}</span> — {eyebrow}
          </p>
          <h2 className="text-balance text-3xl font-medium tracking-[-0.02em] text-foreground sm:text-4xl">
            {lead} {tail && <span className="text-foreground-subtle">{tail}</span>}
          </h2>
          {sub && <p className="mt-3 max-w-xl text-pretty text-muted-foreground">{sub}</p>}
        </div>
        {meta && <div className="shrink-0 pb-1">{meta}</div>}
      </div>
    </Reveal>
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
