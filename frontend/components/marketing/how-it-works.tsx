'use client';

import { motion } from 'framer-motion';
import { Section, SectionHeading } from './section';
import { fadeUp, staggerContainer } from '@/lib/motion';

const STEPS = [
  {
    n: '01',
    title: 'Invite by link',
    desc: 'Send one tokenized link. The candidate joins straight into the room — no account, no setup.',
  },
  {
    n: '02',
    title: 'The AI runs the interview',
    desc: 'A spoken oral round, then live coding in a sandboxed IDE. It listens, adapts, and follows up.',
  },
  {
    n: '03',
    title: 'Get a scorecard',
    desc: 'Deterministic scoring on fixed rubrics, emailed the moment the interview ends.',
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeading lead="From invite to scorecard," tail="in three steps." />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3"
      >
        {STEPS.map((s) => (
          <motion.div key={s.n} variants={fadeUp} className="border-t border-border pt-5">
            <span className="font-mono text-sm text-primary">{s.n}</span>
            <h3 className="mt-3 text-lg font-medium tracking-tight text-foreground">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}
