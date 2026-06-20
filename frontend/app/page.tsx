import { HeroBackdrop } from '@/components/marketing/hero-backdrop';
import { PillNav } from '@/components/marketing/pill-nav';
import { Hero } from '@/components/marketing/hero';
import { Bento } from '@/components/marketing/bento';
import { Footer } from '@/components/marketing/footer';

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <HeroBackdrop />
      <PillNav />
      <Hero />
      <Bento />
      <Footer />
    </main>
  );
}
