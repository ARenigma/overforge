import { SiteNav } from '@/components/marketing/nav';
import { Hero } from '@/components/marketing/hero';
import { TranscriptStats } from '@/components/marketing/transcript-stats';
import { Anatomy } from '@/components/marketing/anatomy';
import { Bento } from '@/components/marketing/bento';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { Security } from '@/components/marketing/security';
import { CTA } from '@/components/marketing/cta';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';
import { StateRail } from '@/components/marketing/state-rail';

// ONE canvas, hairline seams — sections never change the page background (depth comes from framed
// blocks, not full-bleed bands). Order: hero → why (transcript stats) → anatomy (state-tab console
// with real product screenshots) → bento → languages → isolation spec → the bookend. Every section
// is its own device; the centered-heading + icon-card recipe is banned.
export default function LandingPage() {
  return (
    <main className="relative">
      <SiteNav />
      <StateRail />
      <Hero />
      <SectionDivider />
      <TranscriptStats />
      <SectionDivider />
      <Anatomy />
      <SectionDivider />
      <Bento />
      <SectionDivider />
      <LanguageMatrix />
      <SectionDivider />
      <Security />
      <SectionDivider />
      <CTA />
      <Footer />
    </main>
  );
}
