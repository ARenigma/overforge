import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { Walkthrough } from '@/components/marketing/walkthrough';
import { AuditArtifact } from '@/components/marketing/audit-artifact';
import { CTA } from '@/components/marketing/cta';
import { SectionDivider } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'How it works — Finite',
  description:
    'From invite to scorecard, state by state: how Finite runs an AI technical interview — real latencies, real screenshots, real receipts.',
};

export default function HowItWorksPage() {
  return (
    <main className="relative">
      <SiteNav />

      {/* Editorial page hero — same voice as the landing, never centered-template. */}
      <section className="mx-auto max-w-5xl px-6 pb-6 pt-36 sm:pt-40">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
          <span className="text-primary">how it works</span> — the machine, state by state
        </p>
        <h1 className="max-w-3xl text-balance text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
          <span className="text-foreground">From invite to scorecard,</span>{' '}
          <span className="text-foreground-subtle">one auditable path.</span>
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
          The interview is a finite-state machine. These are its states — with the real screens, the
          real latencies, and the receipt it leaves behind.
        </p>
      </section>

      <Walkthrough />

      <SectionDivider />
      <AuditArtifact />
      <SectionDivider />
      <CTA />
      <Footer />
    </main>
  );
}
