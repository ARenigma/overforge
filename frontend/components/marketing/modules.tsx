import { Reveal } from './reveal';
import { SeamCard } from './seam-card';
import { cn } from '@/lib/utils';

/* The product as a SYSTEM MAP — six numbered modules (together.ai's module-index register), each a
 * seam card with the claim on the left and its spec sheet on the right. Every value is a real,
 * defensible fact; measured ones are green. */

interface Spec {
  k: string;
  v: React.ReactNode;
  green?: boolean;
}

const MODULES: {
  n: string;
  name: string;
  title: string;
  desc: string;
  specs: Spec[];
}[] = [
  {
    n: '01',
    name: 'fsm core',
    title: 'The machine owns the interview',
    desc: 'Control flow is a finite-state machine — greeting to scorecard in bounded, auditable transitions. The language model words utterances and judges answers; it can never choose the next state.',
    specs: [
      { k: 'states', v: 'greeting → oral → coding → score → done' },
      { k: 'control', v: 'machine decides, LLM words' },
      { k: 'replay', v: 'same inputs → same path' },
      { k: 'caps', v: 'follow-ups, hints, clarifies — all bounded' },
    ],
  },
  {
    n: '02',
    name: 'voice pipeline',
    title: 'A spoken loop that keeps up',
    desc: 'Streaming speech-to-text, a fast reasoning model, and streamed synthesis — rebuilt from a 23-second naive chain into a pipeline that answers like a person.',
    specs: [
      { k: 'mic → text', v: '~180ms', green: true },
      { k: 'brain', v: '~420ms', green: true },
      { k: 'text → voice', v: '~300ms', green: true },
      { k: 'telemetry', v: 'per-turn stage latencies logged' },
    ],
  },
  {
    n: '03',
    name: 'sandbox',
    title: 'Candidate code, contained',
    desc: 'Every run executes in an isolated gVisor container — user-space kernel, no network, hard resource caps, destroyed on exit. Seven languages, cold start to verdict in milliseconds.',
    specs: [
      { k: 'kernel', v: '4.19.0-gvisor' },
      { k: 'network', v: 'none' },
      { k: 'run verdict', v: '▸ 381ms python median', green: true },
      { k: 'languages', v: 'py · js · ts · go · c++ · java · rb' },
    ],
  },
  {
    n: '04',
    name: 'scorer',
    title: 'Scores you can defend',
    desc: 'A fixed rubric grades every dimension with notes, weighted by how much guidance was needed. Hidden tests give factual correctness; the scorecard lands minutes after the session.',
    specs: [
      { k: 'hidden tests', v: '97/97 bank-verified' },
      { k: 'hint-aware', v: 'a hinted solve ≠ a clean solve' },
      { k: 'reproducibility', v: '100%', green: true },
      { k: 'delivery', v: 'emailed in minutes' },
    ],
  },
  {
    n: '05',
    name: 'proctor',
    title: 'Integrity without surveillance',
    desc: 'Face presence, extra people, and gaze are analyzed entirely in the browser. No video is recorded or uploaded — only numeric signals reach the scorecard, as advisories.',
    specs: [
      { k: 'processing', v: 'in-browser only' },
      { k: 'uploads', v: 'flags, never footage' },
      { k: 'signals', v: 'presence · multi-face · gaze' },
      { k: 'paste guard', v: 'on for real interviews' },
    ],
  },
  {
    n: '06',
    name: 'telemetry',
    title: 'Every run, accounted for',
    desc: 'Per-turn latency ledger, per-interview cost rollup, provider comparisons — the operational truth of every session, visible to admins in big plain numbers.',
    specs: [
      { k: 'latency', v: 'per-stage, per-turn' },
      { k: 'cost', v: 'per-interview rollup' },
      { k: 'providers', v: 'A/B cost + latency race' },
      { k: 'access', v: 'admin-only, RLS-enforced' },
    ],
  },
];

export function Modules() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6">
      {MODULES.map((m, i) => (
        <Reveal key={m.n} delay={i * 40}>
          <SeamCard innerClassName="grid gap-x-10 gap-y-5 p-7 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
                <span className="text-primary">{m.n}</span> — {m.name}
              </p>
              <h2 className="mt-3 text-xl font-medium tracking-[-0.01em] text-foreground sm:text-2xl">
                {m.title}
              </h2>
              <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                {m.desc}
              </p>
            </div>
            <div className="space-y-2.5 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1">
              {m.specs.map((s) => (
                <div key={s.k} className="flex items-baseline gap-3 font-mono text-[12px]">
                  <span className="w-36 shrink-0 uppercase tracking-[0.08em] text-foreground-subtle">
                    {s.k}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 tabular-nums',
                      s.green ? 'text-success' : 'text-foreground'
                    )}
                  >
                    {s.v}
                  </span>
                </div>
              ))}
            </div>
          </SeamCard>
        </Reveal>
      ))}
    </div>
  );
}
