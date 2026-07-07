import { Section, EditorialHeader } from './section';
import { Reveal } from './reveal';
import { CountUp } from './count-up';
import { SeamCard } from './seam-card';
import { cn } from '@/lib/utils';

/* "Not a coding quiz. A real interview." — an asymmetric bento (together.ai/supabase register): one
 * large card carrying a REAL interview transcript (the proof), three compact stat cards alongside.
 * The 1px cursor-seam glow (SeamCard) is the only hover behavior. */

type Line = { t: string; who: string; whoClass?: string; text: React.ReactNode };

const TRANSCRIPT: Line[] = [
  { t: '12:04', who: 'candidate', text: '…so I’d use a sliding window here.' },
  {
    t: '12:05',
    who: 'interviewer',
    whoClass: 'text-primary',
    text: 'why a window over a hash map?',
  },
  {
    t: '02:24',
    who: 'run',
    whoClass: 'text-destructive',
    text: <span className="text-destructive">0 / 8 hidden tests</span>,
  },
  {
    t: '02:38',
    who: 'probe',
    whoClass: 'text-primary',
    text: 'what happens on an empty input?',
  },
  {
    t: '04:15',
    who: 'run',
    whoClass: 'text-success',
    text: <span className="text-success">8 / 8 hidden tests</span>,
  },
  {
    t: '05:02',
    who: 'score',
    whoClass: 'text-primary',
    text: <span className="text-foreground">82 · lean hire</span>,
  },
];

function StatCard({
  label,
  numeral,
  line,
}: {
  label: string;
  numeral: React.ReactNode;
  line: string;
}) {
  return (
    <SeamCard innerClassName="flex h-full flex-col justify-center p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
        {label}
      </p>
      <div className="mt-2 font-mono text-4xl font-medium leading-none tracking-tight tabular-nums text-foreground">
        {numeral}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{line}</p>
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
        sub="It adapts, it probes, it scores fairly — every number comes with its receipt from the transcript."
      />

      <div className="mt-10 space-y-4">
        {/* Hero card — the transcript itself, the proof the numbers point to. */}
        <Reveal>
          <SeamCard innerClassName="flex h-full flex-col p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-subtle">
                one session · transcript
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-foreground-subtle">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                scored
              </span>
            </div>
            <div className="flex-1 space-y-2 px-5 py-4 font-mono text-[12.5px] leading-relaxed sm:text-[13px]">
              {TRANSCRIPT.map((l, i) => (
                <div key={i} className="flex items-baseline gap-3">
                  <span className="w-12 shrink-0 tabular-nums text-foreground-ghost">{l.t}</span>
                  <span className={cn('w-24 shrink-0', l.whoClass ?? 'text-foreground-subtle')}>
                    {l.who}
                  </span>
                  <span className="min-w-0 flex-1 text-muted-foreground">{l.text}</span>
                </div>
              ))}
            </div>
          </SeamCard>
        </Reveal>

        {/* Three compact stat cards — a row beneath the transcript. */}
        <Reveal delay={80} className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="response latency"
            numeral={
              <>
                <span className="text-foreground-ghost">~</span>1
                <span className="text-primary">s</span>
              </>
            }
            line="Median spoken response — no dead air."
          />
          <StatCard
            label="guided, never given"
            numeral={
              <>
                0<span className="mx-1 text-foreground-ghost">→</span>
                <span className="text-success">8/8</span>
              </>
            }
            line="Steered by probes to green — never handed the fix."
          />
          <StatCard
            label="reproducibility"
            numeral={
              <>
                <CountUp value={100} />
                <span className="text-primary">%</span>
              </>
            }
            line="Rerun the session — identical score."
          />
        </Reveal>
      </div>
    </Section>
  );
}
