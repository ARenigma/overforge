import { Section, EditorialHeader } from './section';
import { Reveal } from './reveal';
import { CountUp } from './count-up';
import { cn } from '@/lib/utils';

/* Transcript stat-cards — the anti-icon-card. Each card is a display-sized mono numeral doing the
 * emotional work, grounded by a REAL transcript fragment beneath it (the product's own material as
 * imagery — no lucide icons, no stock anything). */

function Fragment({
  rows,
}: {
  rows: { t: string; chip: string; chipClass: string; text: string; textClass?: string }[];
}) {
  return (
    <div className="mt-6 space-y-1 border-t border-border pt-4 font-mono text-[11px] leading-relaxed">
      {rows.map((r) => (
        <div key={r.t + r.chip} className="flex items-baseline gap-2.5">
          <span className="shrink-0 tabular-nums text-foreground-ghost">{r.t}</span>
          <span className={cn('shrink-0', r.chipClass)}>{r.chip}</span>
          <span className={cn('min-w-0 truncate text-foreground-subtle', r.textClass)}>
            {r.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TranscriptStats() {
  return (
    <Section id="why">
      <EditorialHeader
        index="02"
        eyebrow="why it works"
        lead="Not a coding quiz."
        tail="A real interview, at scale."
        sub="It adapts, it probes, it scores fairly — and every claim below is drawn from the transcript it leaves behind."
      />

      <Reveal className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {/* ~1s — latency */}
        <div className="bg-card p-6">
          <div className="font-mono text-5xl font-medium tabular-nums text-foreground">
            <span className="text-foreground-subtle">~</span>
            <CountUp value={1} suffix="s" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            median response, spoken. No dead air, no &ldquo;processing&rdquo;.
          </p>
          <Fragment
            rows={[
              {
                t: '12:04.2',
                chip: 'candidate',
                chipClass: 'text-foreground-subtle',
                text: '…so I’d use a sliding window.',
              },
              {
                t: '12:05.1',
                chip: 'interviewer',
                chipClass: 'text-primary',
                text: 'why a window over a hash map here?',
              },
            ]}
          />
        </div>

        {/* 0 → 8/8 — guided not given */}
        <div className="bg-card p-6">
          <div className="font-mono text-5xl font-medium tabular-nums text-foreground">
            0<span className="text-foreground-subtle">→</span>8
            <span className="text-foreground-subtle">/8</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            from failing to green — guided by probes, never handed the fix.
          </p>
          <Fragment
            rows={[
              {
                t: '02:24',
                chip: 'run',
                chipClass: 'text-destructive',
                text: '0 / 8 hidden tests',
                textClass: 'text-destructive/90',
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
                text: '8 / 8 hidden tests',
                textClass: 'text-success',
              },
            ]}
          />
        </div>

        {/* max 2 — never nags */}
        <div className="bg-card p-6">
          <div className="font-mono text-5xl font-medium tabular-nums text-foreground">
            max <CountUp value={2} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            interventions per question. Declining help is respected, not penalised.
          </p>
          <Fragment
            rows={[
              {
                t: '03:29',
                chip: 'offer',
                chipClass: 'text-primary',
                text: 'want a pointer, or keep going?',
              },
              {
                t: '03:41',
                chip: 'candidate',
                chipClass: 'text-foreground-subtle',
                text: 'no — let me try once more.',
              },
              {
                t: '03:42',
                chip: 'interviewer',
                chipClass: 'text-primary',
                text: 'your call. I’m here.',
              },
            ]}
          />
        </div>

        {/* 100% — reproducible */}
        <div className="bg-card p-6">
          <div className="font-mono text-5xl font-medium tabular-nums text-foreground">
            <CountUp value={100} suffix="%" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            score reproducibility — same answers, same rubric, same result.
          </p>
          <Fragment
            rows={[
              {
                t: '05:02',
                chip: 'score',
                chipClass: 'text-primary',
                text: '82 · lean hire',
                textClass: 'text-foreground',
              },
              {
                t: '—',
                chip: 'rerun',
                chipClass: 'text-foreground-subtle',
                text: '82 · lean hire (identical)',
              },
            ]}
          />
        </div>
      </Reveal>
    </Section>
  );
}
