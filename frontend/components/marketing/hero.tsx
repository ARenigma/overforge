'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { HeroBackdrop } from '@/components/marketing/hero-backdrop';

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <HeroBackdrop />
      {/* Fade the dots out at the bottom for a clean break into the next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-background" />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto max-w-3xl"
      >
        <motion.h1
          variants={fadeUp}
          className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl"
        >
          <span className="text-foreground">Technical interviews,</span>
          <br />
          <span className="text-primary">run by AI.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-6 max-w-lg text-pretty text-base text-muted-foreground sm:text-lg"
        >
          A spoken oral round, then live coding in a sandboxed IDE — scored deterministically.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/auth"
            className="group inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Start free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how"
            className="inline-flex h-11 items-center rounded-lg border border-border bg-card/50 px-5 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
          >
            See how it works
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
