'use client';

import { motion } from 'framer-motion';
import { Section, SectionHeading } from './section';
import { fadeUp, staggerContainer } from '@/lib/motion';

const LANGUAGES = [
  { name: 'Python', ext: '.py' },
  { name: 'JavaScript', ext: '.js' },
  { name: 'Java', ext: '.java' },
  { name: 'C++', ext: '.cpp' },
  { name: 'Go', ext: '.go' },
  { name: 'Ruby', ext: '.rb' },
] as const;

export function LanguageMatrix() {
  return (
    <Section id="languages">
      <SectionHeading
        lead="Interview in any language."
        tail="Real code, in the candidate's stack."
      />
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
      >
        {LANGUAGES.map((lang) => (
          <motion.div
            key={lang.name}
            variants={fadeUp}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:-translate-y-0.5"
          >
            <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {lang.ext}
            </span>
            <span className="text-sm text-foreground">{lang.name}</span>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}
