import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/marketing/reveal';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-6 pt-20 pb-20 sm:pt-28">
      {/* Intentional ember glow from the top — replaces the generic three.js dotted field. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(58% 44% at 50% -4%, hsl(var(--primary) / 0.13), transparent 70%)',
        }}
      />

      <Reveal className="relative z-10 mx-auto max-w-3xl text-center">
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

        <p className="mt-6 font-mono text-xs text-foreground-subtle">
          Python · JavaScript · Go · Java · C++ · Ruby — run sandboxed, scored deterministically.
        </p>
      </Reveal>
    </section>
  );
}
