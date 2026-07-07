import Image from 'next/image';
import { Reveal } from './reveal';
import { ProductFrame } from './frame';
import { FsmLedger } from './fsm-ledger';
import { cn } from '@/lib/utils';

/* The how-it-works walkthrough — the interview, state by state. Alternating rows (Supabase's
 * feature-page rhythm): mono state label + claim + REAL numbers on one side, a REAL product
 * screenshot (or the live ledger) on the other. Every number carries its source. */

function Shot({ name, alt, priority = false }: { name: string; alt: string; priority?: boolean }) {
  return (
    <ProductFrame>
      <div className="relative aspect-[16/10] w-full">
        <Image
          src={`/shots/${name}-dark.png`}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 600px"
          className="hidden object-cover object-top dark:block"
          priority={priority}
        />
        <Image
          src={`/shots/${name}-light.png`}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 600px"
          className="object-cover object-top dark:hidden"
          priority={priority}
        />
      </div>
    </ProductFrame>
  );
}

/** One mono metric line with its source — the spec-sheet voice. */
function Metric({ k, v, note }: { k: string; v: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[12px]">
      <span className="w-32 shrink-0 uppercase tracking-[0.1em] text-foreground-subtle">{k}</span>
      <span className="whitespace-nowrap tabular-nums text-foreground">{v}</span>
      {note && <span className="min-w-0 text-foreground-ghost">— {note}</span>}
    </div>
  );
}

function WalkRow({
  index,
  state,
  title,
  body,
  metrics,
  device,
  flip = false,
}: {
  index: string;
  state: string;
  title: string;
  body: string;
  metrics?: React.ReactNode;
  device: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <Reveal>
      <div className="grid items-center gap-8 py-14 lg:grid-cols-2 lg:gap-14">
        <div className={cn('min-w-0', flip && 'lg:order-2')}>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
            <span className="text-primary">{index}</span> — {state}
          </p>
          <h2 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-foreground sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 max-w-lg text-pretty leading-relaxed text-muted-foreground">{body}</p>
          {metrics && <div className="mt-6 space-y-2 border-t border-border pt-5">{metrics}</div>}
        </div>
        <div className={cn('min-w-0', flip && 'lg:order-1')}>{device}</div>
      </div>
    </Reveal>
  );
}

/** The spoken loop, drawn as the pipeline it is — stage medians from prod voice telemetry. */
function VoicePipeline() {
  const stages = [
    { k: 'mic → text', v: '~180ms' },
    { k: 'brain', v: '~420ms' },
    { k: 'text → voice', v: '~300ms' },
  ];
  return (
    <div className="mt-6 rounded-lg border border-border bg-surface-inset p-4">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
        {stages.map((s, i) => (
          <span key={s.k} className="flex items-center gap-2">
            <span className="rounded-md border border-border bg-card px-2.5 py-1.5">
              <span className="text-foreground-subtle">{s.k} </span>
              <span className="tabular-nums text-success">{s.v}</span>
            </span>
            {i < stages.length - 1 && <span className="text-foreground-ghost">→</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Walkthrough() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <WalkRow
        index="01"
        state="state: invite"
        title="One link. The machine takes it from there."
        body="Create the interview, pick language and seniority, send the tokenized link. No scheduling, no candidate account, no panel to assemble — the session can start at 2am on a Sunday."
        metrics={
          <>
            <Metric k="setup" v="< 60s" note="create → link copied" />
            <Metric k="scheduling" v="none" note="candidate starts when ready" />
          </>
        }
        device={
          <Shot name="invite" alt="The Finite dashboard with interviews and statuses" priority />
        }
      />

      <WalkRow
        flip
        index="02"
        state="state: oral"
        title="A spoken conversation that actually listens."
        body="Role-specific questions asked out loud. The follow-up is generated from the answer just given — press on the shaky claim, skip what's already proven. A candidate who asks a clarifying question gets an answer, not a state transition."
        metrics={
          <>
            <Metric
              k="median turn"
              v={<span className="text-success">~1s</span>}
              note="voice in → voice out"
            />
            <Metric k="follow-ups" v="adaptive" note="no script, hard caps per question" />
          </>
        }
        device={
          <div>
            <Shot name="oral" alt="The interview room during the spoken round" />
            <VoicePipeline />
          </div>
        }
      />

      <WalkRow
        index="03"
        state="state: coding"
        title="Real code, graded against hidden tests."
        body="A split-pane IDE over an isolated gVisor container — no network, hard resource caps, destroyed on exit. Every run is graded against hidden tests the candidate never sees. Fail twice on the same wall and the interviewer probes; it never hands over the fix."
        metrics={
          <>
            <Metric
              k="run verdict"
              v={<span className="text-success">▸ 381ms</span>}
              note="python median, cold start → verdict"
            />
            <Metric k="hidden tests" v="97/97" note="bank verified offline before serving" />
            <Metric
              k="interventions"
              v="max 2 / question"
              note="probe → offer → hint, decline respected"
            />
          </>
        }
        device={
          <Shot name="coding" alt="The coding phase with a live probe from the interviewer" />
        }
      />

      <WalkRow
        flip
        index="04"
        state="state: score"
        title="A scorecard you can defend."
        body="A fixed rubric scores every dimension with notes, weighted by how much guidance was needed — a hinted solve is not a clean solve. Rerun the same session and the machine lands on the same score."
        metrics={
          <>
            <Metric k="delivery" v="minutes" note="emailed after session end" />
            <Metric
              k="reproducibility"
              v={<span className="text-success">100%</span>}
              note="same answers → same score"
            />
          </>
        }
        device={<Shot name="score" alt="A scored interview with rubric dimensions" />}
      />

      <WalkRow
        index="05"
        state="state: end"
        title="The receipt: a transition ledger."
        body="Every session leaves the same artifact — the full state-by-state ledger: every question, run, probe and score, timestamped. That's what deterministic means: you can audit exactly why the machine did what it did."
        metrics={
          <>
            <Metric k="audit trail" v="complete" note="every transition, timestamped" />
            <Metric k="storage" v="scoped" note="one interview, one candidate, isolated" />
          </>
        }
        device={
          <ProductFrame>
            <FsmLedger />
          </ProductFrame>
        }
      />
    </div>
  );
}
