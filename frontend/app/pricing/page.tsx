import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';
import { PricingTiers } from '@/components/marketing/pricing';
import { PricingComparison } from '@/components/marketing/pricing-comparison';
import { PricingCalculator } from '@/components/marketing/pricing-calculator';

export const metadata: Metadata = {
  title: 'Pricing — Finite',
  description:
    'Predictable pricing for AI-run technical interviews. Start free, scale as you hire.',
};

export default function PricingPage() {
  return (
    <main className="relative">
      <SiteNav />

      {/* Editorial page hero — same register as /product: left-aligned, mono eyebrow, two-tone. */}
      <section className="mx-auto max-w-7xl px-6 pb-10 pt-36 sm:pt-40">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
          <span className="text-primary">pricing</span> — per interview, not per seat
        </p>
        <h1 className="max-w-3xl text-balance text-4xl font-medium tracking-[-0.02em] sm:text-5xl">
          <span className="text-foreground">Predictable pricing,</span>{' '}
          <span className="text-foreground-subtle">designed to scale.</span>
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-muted-foreground">
          Start free, screen your first candidates, and upgrade as your hiring volume grows — no
          surprises.
        </p>
      </section>

      <PricingTiers />
      <PricingCalculator />
      <PricingComparison />

      <SectionDivider />
      <Footer />
    </main>
  );
}
