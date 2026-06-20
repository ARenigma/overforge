'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { fadeUp, staggerContainer } from '@/lib/motion';

export function Hero() {
  return (
    <section className="relative mx-auto flex max-w-2xl flex-col items-center px-6 pt-44 pb-28 text-center">
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        <motion.h1
          variants={fadeUp}
          className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl"
        >
          Technical interviews,
          <br />
          run by AI.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-5 max-w-md text-pretty text-base leading-relaxed text-muted-foreground"
        >
          An oral round, then live coding in a sandboxed IDE — scored deterministically.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/auth"
            className="group inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Start free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#product"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-card/50 px-4 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
          >
            See how it works
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
