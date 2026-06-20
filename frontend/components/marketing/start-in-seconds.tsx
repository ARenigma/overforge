'use client';

import { motion } from 'framer-motion';
import { Section, SectionHeading } from './section';
import { fadeUp, staggerContainer } from '@/lib/motion';

const STEPS = [
  {
    n: '01',
    title: 'Create a role',
    desc: 'Define the position and pick the languages and rubric. Takes under two minutes.',
  },
  {
    n: '02',
    title: 'Send the link',
    desc: 'One tokenized URL — no candidate account, no calendar invite, no back-and-forth.',
  },
  {
    n: '03',
    title: 'Read the scorecard',
    desc: 'Deterministic scores on fixed rubrics land in your inbox the moment the interview ends.',
  },
] as const;

function TerminalCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Titlebar */}
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-muted" />
        <span className="h-3 w-3 rounded-full bg-muted" />
        <span className="h-3 w-3 rounded-full bg-muted" />
      </div>
      {/* Body */}
      <div className="space-y-1.5 px-5 py-5 font-mono text-[13px] leading-relaxed">
        <div className="text-foreground">
          <span className="text-primary">$</span>{' '}
          <span className="text-muted-foreground">overforge create</span>{' '}
          <span className="text-foreground">--role &quot;Senior Frontend&quot;</span>
        </div>
        <div className="text-muted-foreground"># interview ready</div>
        <div className="text-primary">{'→'} overforge.app/i/x7f2k9</div>
      </div>
    </div>
  );
}

export function StartInSeconds() {
  return (
    <Section>
      <div className="grid items-center gap-12 lg:grid-cols-2">
        {/* Left */}
        <div>
          <SectionHeading
            align="left"
            lead="Start interviewing"
            tail="in seconds."
            sub="No scheduling, no setup, no candidate account. Drop the link — the AI handles the rest."
          />
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-10 space-y-6"
          >
            {STEPS.map((s) => (
              <motion.div key={s.n} variants={fadeUp} className="border-t border-border pt-5">
                <span className="font-mono text-sm text-primary">{s.n}</span>
                <h3 className="mt-2 text-base font-medium tracking-tight text-foreground">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Right */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          <TerminalCard />
        </motion.div>
      </div>
    </Section>
  );
}
