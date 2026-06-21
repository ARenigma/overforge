'use client';

// Placeholder testimonials — replace with real quotes before production.

import { motion } from 'framer-motion';
import { Section, SectionHeading } from './section';
import { fadeUp } from '@/lib/motion';
import { ReviewsMarquee } from './marquee';

export function Reviews() {
  return (
    <Section>
      <SectionHeading lead="Built for teams that" tail="take hiring seriously." />
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12"
      >
        <ReviewsMarquee />
      </motion.div>
    </Section>
  );
}
