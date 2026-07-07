import { Reveal } from '@/components/marketing/reveal';
import { FsmLedger } from '@/components/marketing/fsm-ledger';
import { CountUp } from '@/components/marketing/count-up';
import { Cta } from '@/components/marketing/controls';
import { ProductFrame } from '@/components/marketing/frame';
import { HeroVisual } from '@/components/marketing/hero-visual';

export function Hero() {
  return (
    <section id="hero" data-tone="wash" className="relative isolate overflow-hidden">
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

          {/* The 3D system — WebGL on capable desktops, static SVG otherwise. */}
          <Reveal delay={120} className="order-1 lg:order-2">
            <HeroVisual className="mx-auto aspect-square w-full max-w-[420px] lg:max-w-[540px]" />
          </Reveal>
        </div>

        {/* Below the fold — the FSM ledger in a product frame, then the proof strip. */}
        <div className="pb-24">
          <Reveal className="mt-4">
            <ProductFrame>
              <FsmLedger />
            </ProductFrame>
          </Reveal>

          <Reveal delay={80}>
            <dl className="mt-12 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
