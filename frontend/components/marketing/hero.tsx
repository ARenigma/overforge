import { Reveal } from '@/components/marketing/reveal';
import { FsmLedger } from '@/components/marketing/fsm-ledger';
import { CountUp } from '@/components/marketing/count-up';
import { Cta } from '@/components/marketing/controls';
import { ProductFrame } from '@/components/marketing/frame';

// A faint state-machine field — nodes and directed edges as texture (not decoration: the pattern is
// the product's own topology). Static <pre>, ~0 bytes, masked to a whisper. The WebGL upgrade (P5)
// is the same aesthetic animated; this is the finished fallback.
const ASCII_FIELD = `   ○───→○        ·      ○╌╌→◉         ·        ·
   │     ╲      ·        ╲        ·        ·      ○
   ↓      ○───→○───→○     ○            ·      ╱
   ○          ·    ╲       │       ·       ○───→◉
        ·          ○───→○──┘   ·        ╱      ·
   ·        ○           ·       ○───→○      ·    ·
      ·       ╲     ·        ·        ╲        ·
   ○───→◉      ○────────→○       ·      ○╌╌→○───→◉`;

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Ambient trace glow from the top (token-driven ultramarine). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 40% at 50% -6%, hsl(var(--primary) / 0.10), transparent 68%)',
        }}
      />
      {/* Faint FSM ASCII field. */}
      <pre
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-24 -z-10 mx-auto hidden max-w-[1280px] select-none whitespace-pre px-6 font-mono text-[13px] leading-[1.9] text-primary/[0.07] sm:block"
        style={{
          WebkitMaskImage: 'radial-gradient(70% 60% at 50% 30%, black, transparent 80%)',
          maskImage: 'radial-gradient(70% 60% at 50% 30%, black, transparent 80%)',
        }}
      >
        {ASCII_FIELD + '\n' + ASCII_FIELD}
      </pre>

      <div className="mx-auto max-w-[1280px] px-6 pb-20 pt-32 sm:px-8 sm:pt-36">
        {/* Headline (left) + subcopy & CTAs (right, bottom-aligned). */}
        <div className="grid items-end gap-x-10 gap-y-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
              <span className="text-primary">01</span> — autonomous technical interviewer
            </p>
            <h1 className="text-balance text-[2.75rem] font-medium leading-[0.98] tracking-[-0.02em] sm:text-6xl lg:text-[4.25rem]">
              <span className="text-foreground-subtle">Infinite candidates.</span>
              <br />
              <span className="text-foreground">
                Finite answers<span className="text-primary">.</span>
              </span>
            </h1>
          </Reveal>

          <Reveal delay={80} className="lg:col-span-5 lg:pb-3">
            <p className="max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
              A first-round technical screen run end to end by a finite-state machine — it adapts
              its follow-ups, probes when a candidate stalls, runs code in a sandbox, and scores
              everyone against the same rubric. Deterministic. Auditable.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Cta href="/auth" arrow>
                Run an interview
              </Cta>
              <Cta href="/how-it-works" variant="outline">
                How it works
              </Cta>
            </div>
          </Reveal>
        </div>

        {/* The FSM ledger, in a product frame. */}
        <Reveal delay={160} className="mt-14">
          <ProductFrame>
            <FsmLedger />
          </ProductFrame>
        </Reveal>

        {/* 3-stat proof strip. */}
        <Reveal delay={220}>
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
