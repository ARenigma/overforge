import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { Section, EditorialHeader } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { SeamCard } from './seam-card';

/* The pipeline bento — every card is a mono spec-key + an embedded product mini-visual (the
 * Supabase register: the demo IS the card). No icons standing in for substance, no hover
 * translate/sheen — the SeamCard's 1px cursor glow is the only hover behavior. */

/* ── mini-visuals (token-driven) ── */

function Waveform() {
  const bars = [6, 13, 22, 34, 18, 42, 26, 44, 30, 16, 38, 12, 28, 20, 8];
  return (
    <div className="flex h-14 items-center gap-[3px]">
      {bars.map((h, i) => (
        <div key={i} className="w-1 rounded-full bg-primary/60" style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}

function Scorecard() {
  const rows: [string, number][] = [
    ['Problem solving', 88],
    ['Code quality', 79],
    ['Communication', 92],
  ];
  return (
    <div className="rounded-lg border border-border bg-surface-inset p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">candidate@acme.com</span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
          82 · Hire
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, val]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${val}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeMini() {
  return (
    <div className="rounded-lg border border-border bg-surface-inset p-3 font-mono text-[11px] leading-relaxed">
      <div className="text-muted-foreground">
        <span className="text-primary">def</span> two_sum(nums, target):
      </div>
      <div className="pl-3 text-muted-foreground">seen = {'{}'}</div>
      <div className="pl-3 text-muted-foreground">
        <span className="text-primary">return</span> seen
      </div>
    </div>
  );
}

function TerminalMini() {
  return (
    <div className="rounded-lg border border-border bg-surface-inset p-3 font-mono text-[11px] leading-relaxed">
      <div className="text-muted-foreground">
        <span className="text-primary">▸</span> python main.py
      </div>
      <div className="text-foreground">42</div>
      <div className="mt-1.5 inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        network: none
      </div>
    </div>
  );
}

function LangChips() {
  const langs = ['Python', 'JS', 'TS', 'Java', 'C++', 'Go', 'Ruby'];
  return (
    <div className="flex flex-wrap gap-1.5">
      {langs.map((l) => (
        <span
          key={l}
          className="rounded-md border border-border bg-surface-inset px-2 py-1 font-mono text-[11px] text-muted-foreground"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

function InviteMini() {
  return (
    <div className="rounded-lg border border-border bg-surface-inset p-3">
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <Link2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        finite.dev/i/x7f2k9
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
}: {
  /** Mono spec-key, e.g. "oral" — the card's machine label. */
  k: string;
  title: string;
  lead: string;
  tail: string;
  visual: ReactNode;
}) {
  return (
    <SeamCard innerClassName="flex h-full flex-col p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{k}</p>
      <h3 className="mt-2 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed">
        <span className="text-foreground/90">{lead}</span>{' '}
        <span className="text-muted-foreground">{tail}</span>
      </p>
      <div className="mt-auto pt-4">{visual}</div>
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
      <div className="mt-12">
        <Reveal className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Cell
            k="oral"
            title="A spoken oral round"
            lead="Two or three conversational questions to open."
            tail="The AI listens, adapts, and follows up — like a real interviewer."
            visual={<Waveform />}
          />
          <Cell
            k="score"
            title="Deterministic scorecards"
            lead="Fixed rubrics, not vibes."
            tail="The same answer earns the same score — emailed the moment it's ready."
            visual={<Scorecard />}
          />
        </Reveal>
        <Reveal className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cell
            k="editor"
            title="Sandboxed IDE"
            lead="Split-pane CodeMirror."
            tail="Real code, run for real."
            visual={<CodeMini />}
          />
          <Cell
            k="exec"
            title="Isolated runs"
            lead="Network-less, capped."
            tail="No escape."
            visual={<TerminalMini />}
          />
          <Cell
            k="langs"
            title="Seven languages"
            lead="ARM-native."
            tail="More in a line of config."
            visual={<LangChips />}
          />
          <Cell
            k="invite"
            title="Invite by link"
            lead="One tokenized link."
            tail="No candidate account."
            visual={<InviteMini />}
          />
        </Reveal>
      </div>
    </Section>
  );
}
