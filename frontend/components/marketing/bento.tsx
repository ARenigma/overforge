'use client';

import type { ReactNode } from 'react';
import { Mic, BarChart3, Code2, ShieldCheck, Terminal, Link2, type LucideIcon } from 'lucide-react';
import { Section, SectionHeading } from './section';
import { Reveal } from '@/components/marketing/reveal';
import { cn } from '@/lib/utils';

/* ── mini-visuals (token-driven; the embedded-demo polish from Supabase) ── */

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
    <div className="rounded-lg border border-border bg-background/60 p-3">
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
    <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
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
    <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
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
  const langs = ['Python', 'JS', 'Java', 'C++', 'Go', 'Ruby'];
  return (
    <div className="flex flex-wrap gap-1.5">
      {langs.map((l) => (
        <span
          key={l}
          className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-muted-foreground"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

function InviteMini() {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <Link2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        overforge.app/i/x7f2k9
      </div>
    </div>
  );
}

/* ── card ── */

function Card({
  icon: Icon,
  title,
  lead,
  tail,
  visual,
  hoverDetail,
  className,
}: {
  icon: LucideIcon;
  title: string;
  lead: string;
  tail: string;
  visual: ReactNode;
  /** Optional short label that slides up from below the card on hover — CSS only, no JS. */
  hoverDetail?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group relative isolate flex flex-col overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-accent/30',
        className
      )}
    >
      {/* Ember glow — lava light blooming from above on hover (CSS opacity fade). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(130% 90% at 50% -20%, hsl(var(--primary) / 0.14), transparent 65%)',
        }}
      />
      {/* Ember sheen — a single diagonal light sweep on hover (motion-safe). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-y-0 -left-1/4 w-1/2 bg-gradient-to-r from-transparent via-primary/15 to-transparent opacity-0 motion-safe:group-hover:animate-ember-sheen" />
      </div>
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed">
        <span className="text-foreground/90">{lead}</span>{' '}
        <span className="text-muted-foreground">{tail}</span>
      </p>
      <div className="mt-4">{visual}</div>

      {/* Hover-reveal-from-below: parked at translateY(100%), slides to translateY(0) on
          group-hover. Pure CSS transition — no JS. backface-visibility + translateZ(0)
          (via transform-gpu) guard against subpixel flicker on webkit. */}
      {hoverDetail && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 transform-gpu',
            'translate-y-full group-hover:translate-y-0',
            'bg-primary/10 px-4 py-2.5',
            'transition-transform duration-300',
            '[backface-visibility:hidden]'
          )}
          style={{ transitionTimingFunction: 'cubic-bezier(.25,.25,0,1)' }}
        >
          <p className="font-mono text-[11px] text-primary">{hoverDetail}</p>
        </div>
      )}
    </div>
  );
}

export function Bento() {
  return (
    <Section id="product">
      <SectionHeading
        lead="Everything a screen needs."
        tail="Nothing it doesn't."
        sub="One deterministic pipeline from invite to scorecard — no agent soup, no flaky tooling."
      />
      <div className="mt-12">
        <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            icon={Mic}
            title="A spoken oral round"
            lead="Two or three conversational questions to open."
            tail="The AI listens, adapts, and follows up — like a real interviewer."
            visual={<Waveform />}
          />
          <Card
            icon={BarChart3}
            title="Deterministic scorecards"
            lead="Fixed rubrics, not vibes."
            tail="The same answer earns the same score — emailed the moment it's ready."
            visual={<Scorecard />}
            hoverDetail="Scores land in your inbox within minutes of session end."
          />
        </Reveal>
        <Reveal className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            icon={Code2}
            title="Sandboxed IDE"
            lead="Split-pane CodeMirror."
            tail="Real code, run for real."
            visual={<CodeMini />}
          />
          <Card
            icon={ShieldCheck}
            title="Isolated runs"
            lead="Network-less, capped."
            tail="No escape."
            visual={<TerminalMini />}
          />
          <Card
            icon={Terminal}
            title="Six languages"
            lead="ARM-native."
            tail="More in a line of config."
            visual={<LangChips />}
          />
          <Card
            icon={Link2}
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
