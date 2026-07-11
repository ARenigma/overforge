import { Reveal } from '@/components/marketing/reveal';
import { CountUp } from '@/components/marketing/count-up';
import { Cta } from '@/components/marketing/controls';
import { HeroVisual } from '@/components/marketing/hero-visual';
import { HeroLedger } from '@/components/marketing/hero-ledger';

export function Hero() {
  return (
    // NOTE: no `overflow-hidden` here — it would break the HeroLedger's position: sticky scrub.
    <section id="hero" data-tone="wash" className="relative isolate">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        {/* FIRST VIEWPORT — together.ai structure: brand headline + one-liner + CTAs on the left,
            the live 3D state-machine system on the right. The ledger + proof strip live below the
            fold and arrive on scroll. */}
        <div className="grid min-h-[calc(100svh-4rem)] items-center gap-x-12 gap-y-10 pt-16 lg:grid-cols-[1.05fr_1fr]">
          <div className="order-2 lg:order-1">
            <Reveal>
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
                <span className="text-primary">01</span> — autonomous technical interviewer
              </p>
              <h1 className="text-balance text-[2.9rem] font-medium leading-[0.98] tracking-[-0.02em] sm:text-6xl lg:text-[4.25rem]">
                <span className="text-foreground-subtle">Infinite candidates.</span>
                <br />
                <span className="text-foreground">
                  Finite answers<span className="text-primary">.</span>
                </span>
              </h1>
              <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                A first-round technical screen, run end to end by a finite-state machine.
                Deterministic, sandboxed, auditable.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Cta href="/auth" arrow>
                  Run an interview
                </Cta>
                <Cta href="/how-it-works" variant="outline">
                  How it works
                </Cta>
              </div>
            </Reveal>
          </div>

          {/* The 3D system — WebGL on capable desktops, static SVG otherwise — on a Supabase-style
              dotted drafting mat that fades radially into the canvas. */}
          <Reveal delay={120} className="order-1 lg:order-2">
            <div className="relative">
              <div
                aria-hidden="true"
                className="bg-dot-grid pointer-events-none absolute -inset-10 [mask-image:radial-gradient(62%_62%_at_50%_50%,black,transparent)]"
              />
              <HeroVisual className="relative mx-auto aspect-square w-full max-w-[420px] lg:max-w-[540px]" />
            </div>
          </Reveal>
        </div>
      </div>

      {/* Below the fold — the FSM ledger, scroll-scrubbed: it pins and plays the run transition-by-
          transition as you scroll (a sibling of the max-w wrapper so nothing clips its sticky). */}
      <HeroLedger />

      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <div className="pb-24">
          <Reveal>
            <dl className="grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Stat
                value={
                  <>
                    <span className="text-foreground-subtle">~</span>
                    <CountUp value={1} suffix="s" />
                  </>
                }
                label="median response latency"
              />
              <Stat
                value={
                  <>
                    <CountUp value={97} />
                    /97
                  </>
                }
                label="hidden tests graded per run"
              />
              <Stat
                value={
                  <>
                    <CountUp value={100} suffix="%" />
                  </>
                }
                label="score reproducibility"
              />
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-2 py-5 text-center sm:py-6">
      <div className="font-mono text-3xl font-medium tabular-nums text-foreground sm:text-4xl">
        {value}
      </div>
      <div className="mt-1.5 text-xs text-foreground-subtle">{label}</div>
    </div>
  );
}
