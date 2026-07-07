import { Section, EditorialHeader } from './section';
import { Reveal } from '@/components/marketing/reveal';

/* Security as a SPEC SHEET, not icon cards — mono keys, factual values, a kernel string as the
 * proof artifact. Every claim here is defensible and reads like documentation, because it is. */

const SPECS: { key: string; value: string; note?: string }[] = [
  {
    key: 'runtime',
    value: 'gVisor (runsc) user-space kernel',
    note: 'candidate code sees 4.19.0-gvisor, never the host',
  },
  {
    key: 'network',
    value: 'disabled inside every run',
    note: 'no egress — code can’t phone home or reach internal systems',
  },
  {
    key: 'lifecycle',
    value: 'one container per run, destroyed on exit',
    note: 'nothing persists between executions',
  },
  {
    key: 'limits',
    value: 'cpu · memory · pids · output — all bounded',
    note: 'fork bombs and output floods die at the cgroup',
  },
  {
    key: 'data',
    value: 'scoped to a single interview',
    note: 'encrypted in transit and at rest; isolated per candidate',
  },
  {
    key: 'proctoring',
    value: 'in-browser only, flags not footage',
    note: 'no video is recorded or uploaded — numeric signals only',
  },
];

export function Security() {
  return (
    <Section id="security">
      <EditorialHeader
        index="06"
        eyebrow="isolation spec"
        lead="Candidate code never touches"
        tail="your infrastructure."
        sub="The sandbox is a spec, not a promise — this is the actual configuration every run executes under."
      />

      <Reveal className="mt-10 overflow-hidden rounded-lg border border-border">
        {SPECS.map((s, i) => (
          <div
            key={s.key}
            className={
              'grid gap-x-8 gap-y-1 bg-card px-5 py-4 sm:grid-cols-[10rem_1fr_1.2fr] ' +
              (i > 0 ? 'border-t border-border' : '')
            }
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
              {s.key}
            </span>
            <span className="font-mono text-[13px] text-foreground">{s.value}</span>
            <span className="text-[13px] text-muted-foreground">{s.note}</span>
          </div>
        ))}
        <div className="border-t border-border bg-surface-inset px-5 py-3 font-mono text-[11px] text-foreground-subtle">
          $ uname -r <span className="mx-2 text-foreground-ghost">→</span>
          <span className="text-foreground">4.19.0-gvisor</span>
          <span className="ml-3 text-foreground-ghost">— what submitted code actually sees</span>
        </div>
      </Reveal>
    </Section>
  );
}
