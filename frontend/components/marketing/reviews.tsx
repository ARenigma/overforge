'use client';

// Placeholder testimonials — replace with real quotes before production.

import { motion } from 'framer-motion';
import { Section, SectionHeading } from './section';
import { fadeUp, staggerContainer } from '@/lib/motion';

interface Testimonial {
  initials: string;
  name: string;
  handle: string;
  quote: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    initials: 'SR',
    name: 'Sarah R.',
    handle: '@saraheng',
    quote:
      "The scorecard lands in my inbox before I've even had a second coffee. Bias gone, time gone, inconsistency gone. We've cut first-round scheduling by 80%.",
  },
  {
    initials: 'TK',
    name: 'Tom K.',
    handle: '@tomkwrites',
    quote:
      'Fixed rubrics mean the same answer gets the same score every time. I can finally defend a hiring decision with numbers, not gut feel.',
  },
  {
    initials: 'PM',
    name: 'Priya M.',
    handle: '@priyaem',
    quote:
      "We screen four times as many candidates with the same headcount. Overforge runs the repetitive part so my engineers only talk to people who've already proven themselves.",
  },
  {
    initials: 'JL',
    name: 'James L.',
    handle: '@jlhiring',
    quote:
      "The sandboxed execution is what sold me — real code, real output, zero infrastructure on our side. Candidates can tell it's a serious tool.",
  },
  {
    initials: 'AW',
    name: 'Anika W.',
    handle: '@anikahire',
    quote:
      "I was skeptical about AI interviews. Then I saw the transcripts — follow-up questions that actually made sense, scored against a rubric I wrote myself. That's the product.",
  },
  {
    initials: 'RD',
    name: 'Raj D.',
    handle: '@rajdtech',
    quote:
      'Multi-language support out of the box was the deciding factor. Our candidates are in Python, Go, or Java — Overforge handles all three without any configuration on my end.',
  },
];

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <motion.div
      variants={fadeUp}
      className="break-inside-avoid rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-foreground">
          {t.initials}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{t.name}</p>
          <p className="text-xs text-muted-foreground">{t.handle}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t.quote}</p>
    </motion.div>
  );
}

export function Reviews() {
  return (
    <Section>
      <SectionHeading lead="Built for teams that" tail="take hiring seriously." />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12 columns-1 gap-4 sm:columns-2 lg:columns-3"
      >
        {TESTIMONIALS.map((t) => (
          <div key={t.handle} className="mb-4">
            <TestimonialCard t={t} />
          </div>
        ))}
      </motion.div>
    </Section>
  );
}
