import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { Modules } from '@/components/marketing/modules';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { CTA } from '@/components/marketing/cta';
import { SectionDivider } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Product — Finite',
  description:
    'The system, module by module: FSM core, voice pipeline, gVisor sandbox, scorer, proctor, telemetry — with the real numbers.',
};

export default function ProductPage() {
  return (
    <main className="relative">
      <SiteNav />

      {/* Editorial page hero — the system map. */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-36 sm:pt-40">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
          <span className="text-primary">product</span> — the system, module by module
        </p>
        <h1 className="max-w-3xl text-balance text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
          <span className="text-foreground">Six modules.</span>{' '}
          <span className="text-foreground-subtle">One deterministic interviewer.</span>
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
          Everything below is the shipped system — spec values are measured in production, not
          projected.
        </p>
      </section>

      <Modules />

      <div className="pt-10">
        <SectionDivider />
      </div>
      <LanguageMatrix />
      <SectionDivider />
      <CTA />
      <Footer />
    </main>
  );
}
