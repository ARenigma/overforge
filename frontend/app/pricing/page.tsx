import type { Metadata } from 'next';
import { PillNav } from '@/components/marketing/pill-nav';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';
import { PricingTiers } from '@/components/marketing/pricing';
import { PricingComparison } from '@/components/marketing/pricing-comparison';

export const metadata: Metadata = {
  title: 'Pricing — Overforge',
  description:
    'Predictable pricing for AI-run technical interviews. Start free, scale as you hire.',
};

export default function PricingPage() {
  return (
    <main className="relative">
      <PillNav />

      {/* Header */}
      <section className="mx-auto max-w-3xl px-6 pb-10 pt-36 text-center sm:pt-40">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-foreground">Predictable pricing,</span>{' '}
          <span className="text-muted-foreground">designed to scale.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Start free, screen your first candidates, and upgrade as your hiring volume grows — no
          surprises.
        </p>
      </section>

      <PricingTiers />
      <PricingComparison />

      <SectionDivider />
      <Footer />
    </main>
  );
}
