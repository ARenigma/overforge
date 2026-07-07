import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { Modules } from '@/components/marketing/modules';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { CTA } from '@/components/marketing/cta';
import { Section } from '@/components/marketing/section';
import { Reveal } from '@/components/marketing/reveal';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Product — Finite',
  description:
    'The system, module by module: FSM core, voice pipeline, gVisor sandbox, scorer, proctor, telemetry — with the real numbers.',
};

const TINTS = {
  primary: 'bg-[hsl(var(--primary-wash)/0.07)] border-primary/25 text-primary',
  success: 'bg-[hsl(var(--success)/0.08)] border-[hsl(var(--success)/0.3)] text-success',
  neutral: 'bg-surface-inset border-border text-foreground-subtle',
} as const;

const STATS: { tint: keyof typeof TINTS; chip: string; numeral: string; caption: string }[] = [
  {
    tint: 'primary',
    chip: 'the machine',
    numeral: '5',
    caption:
      'auditable states — greeting, oral, coding, score, done. The LLM never picks the next.',
  },
  {
    tint: 'neutral',
    chip: 'sandboxed',
    numeral: '7',
    caption: 'languages, each run in an isolated gVisor container, graded on hidden tests.',
  },
  {
    tint: 'success',
    chip: 'contained',
    numeral: '0',
    caption: 'network egress — candidate code can never phone home or reach the host.',
  },
];

export default function ProductPage() {
  return (
    <main className="relative">
      <SiteNav />

      {/* Editorial hero. */}
      <section data-tone="wash" className="w-full">
        <div className="mx-auto max-w-7xl px-6 pb-16 pt-36 sm:pt-44">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
            <span className="text-primary">product</span> — the system, module by module
          </p>
          <h1 className="max-w-3xl text-balance text-4xl font-medium tracking-[-0.02em] sm:text-6xl">
            <span className="text-foreground">Six modules.</span>{' '}
            <span className="text-foreground-subtle">One deterministic interviewer.</span>
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-muted-foreground sm:text-lg">
            Everything below is the shipped system — spec values are measured in production, not
            projected.
          </p>
        </div>
      </section>

      {/* Headline system numbers — pastel stat cards (together.ai platform register). */}
      <Section className="!pt-4">
        <Reveal className="grid gap-4 md:grid-cols-3">
          {STATS.map((s) => (
            <div
              key={s.chip}
              className={cn(
                'flex min-h-[13rem] flex-col justify-between rounded-lg border p-6',
                TINTS[s.tint]
              )}
            >
              <span className="inline-flex w-fit items-center rounded-md border border-current/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                {s.chip}
              </span>
              <div className="mt-6 font-mono text-6xl font-medium leading-none tracking-tight text-foreground">
                {s.numeral}
              </div>
              <p className="mt-auto pt-6 text-sm leading-relaxed text-muted-foreground">
                {s.caption}
              </p>
            </div>
          ))}
        </Reveal>
      </Section>

      {/* The system map — six numbered modules (Modules provides its own container). */}
      <div data-tone="raised" className="py-24 sm:py-28">
        <Modules />
      </div>

      {/* Language rail on the contrast feature band. */}
      <div data-tone="contrast">
        <LanguageMatrix />
      </div>

      <div data-tone="sunken">
        <CTA />
      </div>
      <Footer />
    </main>
  );
}
