import { PillNav } from '@/components/marketing/pill-nav';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { LanguageMatrix } from '@/components/marketing/language-matrix';
import { StartInSeconds } from '@/components/marketing/start-in-seconds';
import { EditorShowcase } from '@/components/marketing/editor-showcase';
import { Bento } from '@/components/marketing/bento';
import { Security } from '@/components/marketing/security';
import { CTA } from '@/components/marketing/cta';
import { Footer } from '@/components/marketing/footer';
import { SectionDivider } from '@/components/marketing/section';

export default function LandingPage() {
  return (
    <main className="relative">
      <PillNav />
      <Hero />
      <HowItWorks />
      <LanguageMatrix />
      <StartInSeconds />
      <EditorShowcase />
      <Bento />
      <Security />
      <CTA />
      <SectionDivider />
      <Footer />
    </main>
  );
}
