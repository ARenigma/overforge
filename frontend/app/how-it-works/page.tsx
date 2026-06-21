import type { Metadata } from 'next';
import { PillNav } from '@/components/marketing/pill-nav';
import { Footer } from '@/components/marketing/footer';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { StartInSeconds } from '@/components/marketing/start-in-seconds';
import { EditorShowcase } from '@/components/marketing/editor-showcase';
import { CTA } from '@/components/marketing/cta';
import { SectionDivider } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'How it works — Overforge',
  description: 'From invite to scorecard: how Overforge runs an AI technical interview end to end.',
};

export default function HowItWorksPage() {
  return (
    <main className="relative">
      <PillNav />

      <section className="mx-auto max-w-3xl px-6 pb-4 pt-36 text-center sm:pt-40">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-foreground">From invite</span>{' '}
          <span className="text-muted-foreground">to scorecard.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Overforge runs the entire technical interview — the conversation, the coding, and the
          scoring — so your team only meets the people worth meeting.
        </p>
      </section>

      <HowItWorks />
      <StartInSeconds />
      <EditorShowcase />

      <CTA />
      <SectionDivider />
      <Footer />
    </main>
  );
}
