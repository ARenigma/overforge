'use client';

import { motion } from 'framer-motion';
import { Mic, Code2, ShieldCheck, BarChart3, Terminal, Link2, type LucideIcon } from 'lucide-react';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { cn } from '@/lib/utils';

type Cell = { icon: LucideIcon; title: string; desc: string };

const FEATURED: Cell[] = [
  {
    icon: Mic,
    title: 'A spoken oral round',
    desc: 'Two or three conversational questions to open. The AI listens, adapts, and follows up — like a real interviewer warming up the room, not a form.',
  },
  {
    icon: BarChart3,
    title: 'Deterministic scorecards',
    desc: "Scoring runs on fixed rubrics, not vibes. The same answer earns the same score every time — defensible, comparable, and emailed the moment it's ready.",
  },
];

const SMALL: Cell[] = [
  {
    icon: Code2,
    title: 'Sandboxed IDE',
    desc: 'A split-pane CodeMirror editor. Real code, run for real.',
  },
  {
    icon: ShieldCheck,
    title: 'Isolated runs',
    desc: 'Each execution is a network-less, capped container.',
  },
  { icon: Terminal, title: 'Six languages', desc: 'Python, JS, Java, C++, Go, Ruby — ARM-native.' },
  {
    icon: Link2,
    title: 'Invite by link',
    desc: 'One tokenized link. The candidate joins straight in.',
  },
];

function CellCard({ cell, className }: { cell: Cell; className?: string }) {
  return (
    <motion.div
      variants={fadeUp}
      className={cn(
        'group rounded-xl border border-border bg-card p-5 transition-colors hover:border-border/60 hover:bg-accent/40',
        className
      )}
    >
      <cell.icon className="h-5 w-5 text-primary" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-medium text-foreground">{cell.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{cell.desc}</p>
    </motion.div>
  );
}

export function Bento() {
  return (
    <section id="product" className="relative mx-auto max-w-5xl px-6 py-24">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
      >
        <motion.h2
          variants={fadeUp}
          className="max-w-2xl text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          Everything a screen needs. Nothing it doesn&apos;t.
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-3 max-w-xl text-pretty text-muted-foreground">
          One deterministic pipeline from invite to scorecard — no agent soup, no flaky tooling.
        </motion.p>

        <div className="mt-10 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {FEATURED.map((c) => (
            <CellCard key={c.title} cell={c} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SMALL.map((c) => (
            <CellCard key={c.title} cell={c} />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
