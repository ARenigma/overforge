import type { ReactNode } from 'react';
import { Section, EditorialHeader } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { CountUp } from '@/components/marketing/count-up';
import { cn } from '@/lib/utils';

/* The platform section — together.ai's "The Together AI Platform" register: a row of tall tinted
 * stat cards (mono-caps chip on top, one GIANT numeral, a caption at the foot), then a compact
 * capability strip on hairlines. Color differentiates the cards (our own semantic tints, never
 * off-palette pastels); the numbers carry the weight. */

// together.ai's `.metric-card:hover` deepens the tint background AND reveals a hidden detail that
// slides up from the foot — we mirror that exactly: bg + border deepen, a mono proof line rises in.
const TINTS = {
  primary:
    'border-primary/25 bg-[hsl(var(--primary-wash)/0.07)] hover:border-primary/50 hover:bg-[hsl(var(--primary-wash)/0.13)]',
  success:
    'border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.08)] hover:border-[hsl(var(--success)/0.55)] hover:bg-[hsl(var(--success)/0.14)]',
  neutral: 'border-border bg-surface-inset hover:border-primary/30 hover:bg-accent',
} as const;

const CHIP = {
  primary: 'text-primary',
  success: 'text-success',
  neutral: 'text-foreground-subtle',
} as const;

function StatCard({
  tint,
  chip,
  numeral,
  caption,
  reveal,
}: {
  tint: keyof typeof TINTS;
  chip: string;
  numeral: ReactNode;
  caption: string;
  reveal: string;
}) {
  return (
    <div
      className={cn(
        'group flex min-h-[15rem] flex-col rounded-lg border p-6 transition-[background-color,border-color] duration-300 ease-out-cubic',
        TINTS[tint]
      )}
    >
      <span
        className={cn(
          'inline-flex w-fit items-center rounded-md border border-current/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
          CHIP[tint]
        )}
      >
        {chip}
      </span>
      <div className="mt-6 font-mono text-6xl font-medium leading-none tracking-tight tabular-nums text-foreground">
        {numeral}
      </div>
      <div className="mt-auto pt-6">
        <p className="text-sm leading-relaxed text-muted-foreground">{caption}</p>
        {/* Hidden proof line — rises + fades in on hover (the together.ai metric-card reveal). */}
        <span className="mt-3 flex translate-y-1 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary opacity-0 transition-all duration-300 ease-out-cubic group-hover:translate-y-0 group-hover:opacity-100">
          {reveal}
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </div>
  );
}

const CAPABILITIES = [
  { k: 'invite', title: 'Invite by link', line: 'One tokenized link — no account, no scheduling.' },
  { k: 'oral', title: 'Spoken oral round', line: 'Adaptive questions, asked out loud.' },
  { k: 'editor', title: 'Sandboxed IDE', line: 'Split-pane CodeMirror, real code.' },
  { k: 'exec', title: 'Isolated runs', line: 'gVisor, network-less, graded on hidden tests.' },
  {
    k: 'score',
    title: 'Deterministic scorecard',
    line: 'Fixed rubric, same answers → same score.',
  },
] as const;

export function Bento() {
  return (
    <Section id="product">
      <EditorialHeader
        index="04"
        eyebrow="the platform"
        lead="Everything a screen needs."
        tail="Nothing it doesn't."
        sub="One deterministic pipeline from invite to scorecard — no agent soup, no flaky tooling."
      />

      <Reveal className="mt-10 grid gap-4 md:grid-cols-3">
        <StatCard
          tint="primary"
          chip="↓ no dead air"
          numeral={
            <>
              <span className="text-foreground-subtle">~</span>
              <CountUp value={1} />s
            </>
          }
          caption="Median spoken response, mid-conversation — it answers like a person on the call."
          reveal="voice in → voice out"
        />
        <StatCard
          tint="success"
          chip="✓ graded for real"
          numeral={
            <>
              <CountUp value={97} />
              <span className="text-foreground-subtle">/97</span>
            </>
          }
          caption="Hidden tests executed per run, in an isolated sandbox — not eyeballed."
          reveal="server-injected stdin"
        />
        <StatCard
          tint="neutral"
          chip="= same score"
          numeral={
            <>
              <CountUp value={100} />%
            </>
          }
          caption="Reproducible: rerun the same session and the machine lands on the same score."
          reveal="same inputs → same state"
        />
      </Reveal>

      {/* Capability strip — the pipeline, compact, on hairlines (no oversized demo boxes). */}
      <Reveal className="mt-4">
        <div className="grid divide-y divide-border rounded-lg border border-border md:grid-cols-5 md:divide-x md:divide-y-0">
          {CAPABILITIES.map((c) => (
            <div
              key={c.k}
              className="p-5 transition-colors duration-300 ease-out-cubic hover:bg-[hsl(var(--primary-wash)/0.05)]"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                {c.k}
              </p>
              <h3 className="mt-2 text-sm font-medium text-foreground">{c.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{c.line}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
