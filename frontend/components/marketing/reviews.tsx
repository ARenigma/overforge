'use client';

// Placeholder testimonials — replace with real quotes before production.

import { Section, SectionHeading } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { ReviewsMarquee } from './marquee';

export function Reviews() {
  return (
    <Section>
      <SectionHeading lead="Built for teams that" tail="take hiring seriously." />
      <Reveal className="mt-12">
        <ReviewsMarquee />
      </Reveal>
    </Section>
  );
}
