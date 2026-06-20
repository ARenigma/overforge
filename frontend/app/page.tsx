import { PillNav } from '@/components/marketing/pill-nav';
import { Hero } from '@/components/marketing/hero';
import { LanguageStrip } from '@/components/marketing/language-strip';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Bento } from '@/components/marketing/bento';
import { CTA } from '@/components/marketing/cta';
import { Footer } from '@/components/marketing/footer';

export default function LandingPage() {
  return (
    <main className="relative">
      <PillNav />
      <Hero />
      <LanguageStrip />
      <HowItWorks />
      <Bento />
      <CTA />
      <Footer />
    </main>
  );
}
