import { SiteNav } from '@/components/marketing/nav';
import { Hero } from '@/components/marketing/hero';
import { TranscriptStats } from '@/components/marketing/transcript-stats';
import { Anatomy } from '@/components/marketing/anatomy';
import { Bento } from '@/components/marketing/bento';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { Benchmark } from '@/components/marketing/benchmark';
import { Security } from '@/components/marketing/security';

// NOTE: App Router already code-splits 'use client' components per boundary — an explicit
// next/dynamic wrapper from a server page adds nothing (and trips the RSC client manifest).
import { CTA } from '@/components/marketing/cta';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';

// ONE canvas, hairline seams — sections never change the page background (depth comes from framed
// blocks, not full-bleed bands). Order: hero → why (transcript stats) → anatomy (state-tab console
// with real product screenshots) → bento → languages → isolation spec → the bookend. Every section
// is its own device; the centered-heading + icon-card recipe is banned.
export default function LandingPage() {
  return (
    <main className="relative">
      <SiteNav />
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
      <Benchmark />
      <SectionDivider />
      <Security />
      <SectionDivider />
      <CTA />
      <Footer />
    </main>
  );
}
