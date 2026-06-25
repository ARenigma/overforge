'use client';

import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { HeroBackdrop } from '@/components/marketing/hero-backdrop';
import { Reveal } from '@/components/marketing/reveal';

export function Hero() {
  return (
    <section className="relative isolate flex h-screen min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <HeroBackdrop />
      {/* Fade the dots out at the bottom for a clean break into the next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-background" />

      <Reveal className="relative z-10 mx-auto max-w-3xl">
        <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          <span className="text-foreground">An AI interviewer</span>
          <br />
          <span className="text-primary">that thinks on its feet.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
          Overforge runs the first-round technical screen end to end — a spoken interview that
          adapts its follow-ups, hints when a candidate is genuinely stuck, and scores everyone
          against the same rubric. No scheduling. No panel.
        </p>

        <div className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/auth"
            className="group inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Start free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex h-11 items-center rounded-md border border-border bg-card/50 px-8 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
          >
            See how it works
          </Link>
        </div>
      </Reveal>

      {/* Scroll cue */}
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2" aria-hidden="true">
        <ChevronDown className="h-5 w-5 animate-bounce text-foreground-ghost" />
      </div>
    </section>
  );
}
