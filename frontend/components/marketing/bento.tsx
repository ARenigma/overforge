import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { Section, EditorialHeader } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { SeamCard } from './seam-card';
import { cn } from '@/lib/utils';

/* The pipeline bento — Supabase card anatomy: copy up top, the DEMO fills the card's bottom
 * edge-to-edge (no visual floating in an inset box). Asymmetric spans, mono spec-keys, and the
 * 1px cursor-seam glow as the only hover behavior. */

/* ── edge-bleed visuals (each fills the card's bottom, clipped by the card radius) ── */

function OralVisual() {
  const bars = [5, 11, 19, 30, 16, 38, 24, 42, 44, 34, 27, 40, 30, 14, 34, 10, 25, 18, 7, 12, 22];
  return (
    <div className="border-t border-border bg-surface-inset/60">
      <div className="flex items-end gap-[3px] px-6 pt-5">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn(
              'w-1.5 origin-bottom rounded-t-full motion-safe:animate-[eq_720ms_ease-in-out_infinite_alternate] motion-safe:[animation-play-state:paused] motion-safe:group-hover:[animation-play-state:running]',
              i === 8 ? 'bg-primary' : 'bg-primary/45'
            )}
            style={{ height: `${h}px`, animationDelay: `${(i % 5) * 90}ms` }}
          />
        ))}
      </div>
      <div className="flex items-baseline gap-3 px-6 pb-5 pt-3 font-mono text-[11px]">
        <span className="text-foreground-ghost">14:22</span>
        <span className="text-primary">interviewer</span>
        <span className="truncate text-muted-foreground">
          you mentioned backpressure — where does it bite first?
        </span>
      </div>
    </div>
  );
}

function ScoreVisual() {
  const rows: [string, number][] = [
    ['Problem solving', 88],
    ['Code quality', 79],
    ['Communication', 92],
  ];
  return (
    <div className="border-t border-border bg-surface-inset/60 px-6 py-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">candidate@acme.com</span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
          82 · hire
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, val]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-[11px] text-muted-foreground">{label}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full origin-left rounded-full bg-primary motion-safe:group-hover:animate-[fill-bar_600ms_var(--ease-out)]"
                style={{ width: `${val}%` }}
              />
            </div>
            <span className="w-6 text-right font-mono text-[10px] tabular-nums text-foreground-subtle">
              {val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorVisual() {
  return (
    <div className="border-t border-border bg-surface-inset/60 px-6 py-5 font-mono text-[11px] leading-relaxed">
      <div className="text-muted-foreground">
        <span className="text-primary">def</span> two_sum(nums, target):
      </div>
      <div className="pl-4 text-muted-foreground">seen = {'{}'}</div>
      <div className="pl-4 text-muted-foreground">
        <span className="text-primary">for</span> i, n <span className="text-primary">in</span>{' '}
        enumerate(nums):
      </div>
      <div className="pl-8 text-foreground-subtle">…</div>
    </div>
  );
}

function ExecVisual() {
  return (
    <div className="border-t border-border bg-surface-inset/60 px-6 py-5 font-mono text-[11px] leading-relaxed">
      <div className="text-muted-foreground">
        <span className="text-primary">▸</span> run · python
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-success">ACCEPTED</span>
        <span className="tabular-nums text-success/80">381ms</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          network: none
        </span>
      </div>
    </div>
  );
}

function InviteVisual() {
  return (
    <div className="border-t border-border bg-surface-inset/60 px-6 py-5">
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        finite.dev/i/x7f2k9
        <span className="ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">
          live
        </span>
      </div>
    </div>
  );
}

/* ── card ── */

function Cell({
  k,
  title,
  lead,
  tail,
  visual,
  className,
}: {
  k: string;
  title: string;
  lead: string;
  tail: string;
  visual: ReactNode;
  className?: string;
}) {
  return (
    <SeamCard className={className} innerClassName="flex h-full flex-col overflow-hidden">
      <div className="p-6 pb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{k}</p>
        <h3 className="mt-2 text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed">
          <span className="text-foreground/90">{lead}</span>{' '}
          <span className="text-muted-foreground">{tail}</span>
        </p>
      </div>
      <div className="mt-auto">{visual}</div>
    </SeamCard>
  );
}

export function Bento() {
  return (
    <Section id="product">
      <EditorialHeader
        index="04"
        eyebrow="the pipeline"
        lead="Everything a screen needs."
        tail="Nothing it doesn't."
        sub="One deterministic pipeline from invite to scorecard — no agent soup, no flaky tooling."
      />
      <Reveal className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Cell
          className="lg:col-span-2"
          k="oral"
          title="A spoken oral round"
          lead="Conversational questions, asked out loud."
          tail="The AI listens, adapts, and presses on the shaky claim — like a real interviewer."
          visual={<OralVisual />}
        />
        <Cell
          k="score"
          title="Deterministic scorecards"
          lead="Fixed rubrics, not vibes."
          tail="Same answer, same score."
          visual={<ScoreVisual />}
        />
        <Cell
          k="editor"
          title="Sandboxed IDE"
          lead="Split-pane CodeMirror."
          tail="Real code, run for real."
          visual={<EditorVisual />}
        />
        <Cell
          k="exec"
          title="Isolated runs"
          lead="gVisor, network-less, capped."
          tail="Cold start to verdict in milliseconds."
          visual={<ExecVisual />}
        />
        <Cell
          k="invite"
          title="Invite by link"
          lead="One tokenized link."
          tail="No candidate account, no scheduling."
          visual={<InviteVisual />}
        />
      </Reveal>
    </Section>
  );
}
