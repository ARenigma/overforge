'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { fadeUp, staggerContainer } from '@/lib/motion';

export function Hero() {
  return (
    <section className="relative mx-auto flex max-w-3xl flex-col items-center px-6 pt-40 pb-24 text-center sm:pt-48">
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        <motion.a
          variants={fadeUp}
          href="#how"
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          AI-led technical interviews
        </motion.a>

        <motion.h1
          variants={fadeUp}
          className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl"
        >
          Live technical interviews,
          <br />
          run by an AI that listens.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          A spoken screening round, then a real coding round in a sandboxed IDE — isolated,
          multi-language, and scored deterministically. You review the scorecard, not the recording.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/auth"
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:scale-[0.98]"
          >
            Start free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-5 py-3 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
          >
            See how it works
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
