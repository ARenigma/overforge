import { SiteNav } from '@/components/marketing/nav';
import { Hero } from '@/components/marketing/hero';
import { TranscriptStats } from '@/components/marketing/transcript-stats';
import { Anatomy } from '@/components/marketing/anatomy';
import { Bento } from '@/components/marketing/bento';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { Benchmark } from '@/components/marketing/benchmark';
import { Security } from '@/components/marketing/security';
import { CTA } from '@/components/marketing/cta';
import { Footer } from '@/components/marketing/footer';

// Section bands (together.ai/supabase rhythm) — the page is a SEQUENCE OF BACKGROUNDS, not one flat
// canvas. Tones alternate and one contrast band (dark on our dark site → a paper feature band)
// anchors the proof section; each [data-tone] wrapper re-scopes tokens so children need no changes.
// The band edges ARE the separators — no hairline dividers. Order puts the language rail up high.
export default function LandingPage() {
  return (
    <main className="relative">
      <SiteNav />
      <Hero />
      <TranscriptStats />
      <div data-tone="raised">
        <LanguageMatrix />
      </div>
      <Anatomy />
      <div data-tone="raised">
        <Bento />
      </div>
      <div data-tone="contrast">
        <Benchmark />
      </div>
      <Security />
      <div data-tone="sunken">
        <CTA />
      </div>
      <Footer />
    </main>
  );
}
