import type { Metadata } from 'next';
import { SiteNav } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/footer';
import { Bento } from '@/components/marketing/bento';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { Security } from '@/components/marketing/security';
import { CTA } from '@/components/marketing/cta';
import { SectionDivider } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Product — Finite',
  description:
    'AI-run technical interviews: a spoken oral round, sandboxed live coding, and deterministic scorecards.',
};

export default function ProductPage() {
  return (
    <main className="relative">
      <SiteNav />

      <section className="mx-auto max-w-3xl px-6 pb-4 pt-36 text-center sm:pt-40">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-foreground">One platform</span>{' '}
          <span className="text-muted-foreground">to screen every engineer.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          A spoken oral round, live coding in a sandboxed IDE, and a deterministic scorecard —
          without scheduling a single call.
        </p>
      </section>

      <Bento />
      <LanguageMatrix />
      <Security />

      <CTA />
      <SectionDivider />
      <Footer />
    </main>
  );
}
