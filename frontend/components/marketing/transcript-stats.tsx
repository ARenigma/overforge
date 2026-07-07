import { Section, EditorialHeader } from './section';
import { Reveal } from './reveal';
import { CountUp } from './count-up';
import { SeamCard } from './seam-card';
import { cn } from '@/lib/utils';

/* Transcript stat-cards — metric-first, together.ai register: a mono spec-key on top, ONE giant
 * numeral with the payoff token accented, one short supporting line, then a SHORT readable
 * transcript receipt (no truncation, no noise). 2×2 so every card breathes. The 1px cursor-seam
 * glow (SeamCard) is the only hover behavior. */

function Receipt({
  rows,
}: {
  rows: { t: string; chip: string; chipClass?: string; text: React.ReactNode }[];
}) {
  return (
    <div className="mt-5 space-y-1.5 border-t border-border pt-4 font-mono text-[11.5px] leading-relaxed">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline gap-3">
          <span className="w-12 shrink-0 tabular-nums text-foreground-ghost">{r.t}</span>
          <span className={cn('w-24 shrink-0', r.chipClass ?? 'text-foreground-subtle')}>
            {r.chip}
          </span>
          <span className="min-w-0 flex-1 text-muted-foreground">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label,
  numeral,
  line,
  rows,
}: {
  label: string;
  numeral: React.ReactNode;
  line: React.ReactNode;
  rows: { t: string; chip: string; chipClass?: string; text: React.ReactNode }[];
}) {
  return (
    <SeamCard innerClassName="p-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
        {label}
      </p>
      <div className="mt-3.5 font-mono text-4xl font-medium leading-none tracking-tight tabular-nums text-foreground sm:text-5xl">
        {numeral}
      </div>
      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground">{line}</p>
      <Receipt rows={rows} />
    </SeamCard>
  );
}

export function TranscriptStats() {
  return (
    <Section id="why">
      <EditorialHeader
        index="02"
        eyebrow="why it works"
        lead={
          <>
            Not a coding quiz. A <span className="text-primary">real interview</span>, at scale.
          </>
        }
        sub="It adapts, it probes, it scores fairly — every number below comes with its receipt from the transcript."
      />

      <Reveal className="mt-12 grid gap-4 lg:grid-cols-2">
        <StatCard
          label="response latency"
          numeral={
            <>
              <span className="text-foreground-ghost">~</span>1
              <span className="text-primary">s</span>
            </>
          }
          line={
            <>
              Median spoken response. No dead air, no <em>&ldquo;processing&rdquo;</em> — it answers
              like a person on the call.
            </>
          }
          rows={[
            { t: '12:04', chip: 'candidate', text: '…so I’d use a sliding window.' },
            {
              t: '12:05',
              chip: 'interviewer',
              chipClass: 'text-primary',
              text: 'why a window over a hash map here?',
            },
          ]}
        />

        <StatCard
          label="guided, never given"
          numeral={
            <>
              0<span className="mx-1 text-foreground-ghost">→</span>
              <span className="text-success">8/8</span>
            </>
          }
          line="From failing to green in one session — steered by probes, never handed the fix."
          rows={[
            {
              t: '02:24',
              chip: 'run',
              chipClass: 'text-destructive',
              text: <span className="text-destructive">0 / 8 hidden tests</span>,
            },
            {
              t: '02:38',
              chip: 'probe',
              chipClass: 'text-primary',
              text: 'what happens on an empty input?',
            },
            {
              t: '04:15',
              chip: 'run',
              chipClass: 'text-success',
              text: <span className="text-success">8 / 8 hidden tests</span>,
            },
          ]}
        />

        <StatCard
          label="intervention budget"
          numeral={
            <>
              <span className="text-primary">2</span>
              <span className="text-xl text-foreground-subtle sm:text-2xl"> max</span>
            </>
          }
          line="Hard cap per question — and declining help is respected, never penalised."
          rows={[
            {
              t: '03:29',
              chip: 'offer',
              chipClass: 'text-primary',
              text: 'want a pointer, or keep going?',
            },
            { t: '03:41', chip: 'candidate', text: 'no — let me try once more.' },
            {
              t: '03:42',
              chip: 'interviewer',
              chipClass: 'text-primary',
              text: 'your call. I’m here.',
            },
          ]}
        />

        <StatCard
          label="score reproducibility"
          numeral={
            <>
              <CountUp value={100} />
              <span className="text-primary">%</span>
            </>
          }
          line="Same answers, same rubric, same score — rerun it and the machine lands on the same state."
          rows={[
            {
              t: '05:02',
              chip: 'score',
              chipClass: 'text-primary',
              text: <span className="text-foreground">82 · lean hire</span>,
            },
            { t: 'rerun', chip: 'score', text: '82 · lean hire — identical' },
          ]}
        />
      </Reveal>
    </Section>
  );
}
