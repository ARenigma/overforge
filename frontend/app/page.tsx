import { PillNav } from '@/components/marketing/pill-nav';
import { Hero } from '@/components/marketing/hero';
import { Marquee } from '@/components/marketing/marquee';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { StartInSeconds } from '@/components/marketing/start-in-seconds';
import { EditorShowcase } from '@/components/marketing/editor-showcase';
import { Bento } from '@/components/marketing/bento';
import { Reviews } from '@/components/marketing/reviews';
import { CTA } from '@/components/marketing/cta';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';

export default function LandingPage() {
  return (
    <main className="relative">
      <PillNav />
      <Hero />
      <SectionDivider />
      <Marquee />
      <SectionDivider />
      <LanguageMatrix />
      <SectionDivider />
      <StartInSeconds />
      <SectionDivider />
      <EditorShowcase />
      <SectionDivider />
      <Bento />
      <SectionDivider />
      <Reviews />
      <SectionDivider />
      <CTA />
      <Footer />
    </main>
  );
}
