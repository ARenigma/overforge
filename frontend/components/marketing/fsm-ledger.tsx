'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* The FSM Transition Ledger — the hero centerpiece. A real DOM table that self-plays one interview,
 * turn by turn: state transitions, a failing run, an adaptive probe, a hint offer, then a clean run
 * and a terminal score. It demos the product's actual brain (the finite-state machine) honestly —
 * no video, no WebGL. Bounded loop: it plays once, settles on the accepting state, holds, replays.
 * IntersectionObserver-paused off-screen; reduced-motion renders the full ledger at rest. */

type Kind = 'transition' | 'probe' | 'offer' | 'run-fail' | 'run-partial' | 'run-pass' | 'terminal';

interface Turn {
  t: string;
  kind: Kind;
  label: string;
  detail: string;
}

const SCRIPT: Turn[] = [
  {
    t: '00:03',
    kind: 'transition',
    label: 'greeting → oral',
    detail: 'tell me about a system you shipped',
  },
  { t: '00:47', kind: 'probe', label: 'probe', detail: 'what would you change if traffic 10×’d?' },
  {
    t: '01:39',
    kind: 'transition',
    label: 'oral → coding',
    detail: 'let’s move to the coding portion',
  },
  { t: '02:24', kind: 'run-fail', label: 'run', detail: '0 / 8 hidden tests' },
  { t: '02:38', kind: 'probe', label: 'probe', detail: 'what happens on an empty input?' },
  { t: '03:11', kind: 'run-partial', label: 'run', detail: '5 / 8 hidden tests' },
  { t: '03:29', kind: 'offer', label: 'hint offered', detail: 'want a pointer, or keep going?' },
  { t: '04:15', kind: 'run-pass', label: 'run', detail: '8 / 8 hidden tests' },
  { t: '04:33', kind: 'transition', label: 'coding → score', detail: 'grading against the rubric' },
  { t: '05:02', kind: 'terminal', label: 'done', detail: '82 · lean hire' },
];

const KIND_STYLES: Record<Kind, { chip: string; dot: string; detail?: string }> = {
  transition: { chip: 'text-foreground-subtle', dot: 'bg-foreground-ghost' },
  probe: { chip: 'text-primary', dot: 'bg-primary' },
  offer: { chip: 'text-primary', dot: 'bg-primary' },
  'run-fail': { chip: 'text-destructive', dot: 'bg-destructive', detail: 'text-destructive/90' },
  'run-partial': { chip: 'text-warning', dot: 'bg-warning', detail: 'text-warning/90' },
  'run-pass': { chip: 'text-success', dot: 'bg-success', detail: 'text-success' },
  terminal: { chip: 'text-primary', dot: 'bg-primary', detail: 'text-foreground' },
};

const STEP_MS = 850; // one turn revealed per beat — clock-like, deterministic
const HOLD_MS = 3600; // settle on the accepting state before replaying
// The ledger must never paint as an empty box: the first rows are pre-seeded at mount and the
// replay resets to them, so there's always visible content while the rest streams in.
const SEED_ROWS = 3;

export function FsmLedger({ progress }: { progress?: number } = {}) {
  const controlled = typeof progress === 'number'; // scroll-driven by the parent scrub
  const prefersReduced = usePrefersReducedMotion();
  const [autoCount, setAutoCount] = React.useState(SEED_ROWS);
  const ref = React.useRef<HTMLDivElement>(null);

  // Controlled → map scroll progress (0..1) to rows revealed (seed → terminal). Uncontrolled → the
  // self-playing loop below drives it.
  const count = controlled
    ? Math.min(
        SCRIPT.length,
        Math.max(
          SEED_ROWS,
          Math.round(SEED_ROWS + (progress as number) * (SCRIPT.length - SEED_ROWS))
        )
      )
    : autoCount;

  // Self-playing loop, DECOUPLED from React re-renders: visibility lives in a mutable local updated
  // by the IntersectionObserver callback (never React state), and the effect depends only on
  // `prefersReduced`. That's the fix for the old freeze — any version that kept the IO's inView state
  // (or a count-derived flag) in the deps re-ran the effect on the first tick and cleared its own
  // pending timer, so the ledger died after one step. Here the timer chain runs uninterrupted: it
  // climbs seed → terminal, holds on the accepting state, then replays; it only PAUSES ticking while
  // off-screen and resumes where it left off.
  React.useEffect(() => {
    if (controlled) return; // scroll-driven by the parent — no self-play
    if (prefersReduced) {
      setAutoCount(SCRIPT.length); // reduced motion: whole ledger at rest
      return;
    }
    const el = ref.current;
    let visible = true;
    const io = el
      ? new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.15 })
      : null;
    if (el && io) io.observe(el);

    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let n = SEED_ROWS;
    const tick = () => {
      if (cancelled) return;
      if (!visible) {
        timer = setTimeout(tick, STEP_MS); // paused off-screen; resume where we left off
        return;
      }
      n = n >= SCRIPT.length ? SEED_ROWS : n + 1; // climb, or wrap to the seed to replay
      setAutoCount(n);
      timer = setTimeout(tick, n >= SCRIPT.length ? HOLD_MS : STEP_MS); // hold on the terminal state
    };
    timer = setTimeout(tick, STEP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      io?.disconnect();
    };
  }, [prefersReduced, controlled]);

  return (
    <div
      ref={ref}
      className="w-full"
      role="img"
      aria-label="A self-playing demo of one interview's transition ledger: oral questions, a failing run, an adaptive probe, a hint offer, a passing run, and the final score."
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground-subtle">
          interview · transition ledger
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-foreground-subtle">
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              count >= SCRIPT.length ? 'bg-success' : 'bg-primary motion-safe:animate-pulse'
            )}
          />
          {count >= SCRIPT.length ? 'accepted' : 'running'}
        </span>
      </div>

      {/* The FULL path is always rendered — future transitions sit as ghosts and LIGHT UP as the
          run reaches them (the machine's path is known in advance; that's what deterministic
          means). The frame is never a half-empty box. */}
      <div className="px-2 py-1.5">
        {SCRIPT.map((turn, i) => {
          const s = KIND_STYLES[turn.kind];
          const played = i < count;
          const isNewest = !prefersReduced && played && i === count - 1;
          return (
            <div
              key={turn.t}
              className={cn(
                'flex items-baseline gap-3 rounded-md px-2 py-1.5 font-mono text-[12px] leading-relaxed transition-opacity duration-slow ease-out-cubic sm:text-[13px]',
                played ? 'opacity-100' : 'opacity-[0.28]',
                isNewest &&
                  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300'
              )}
            >
              <span className="w-11 shrink-0 tabular-nums text-foreground-subtle">{turn.t}</span>
              <span className="flex w-[9.5rem] shrink-0 items-center gap-1.5 sm:w-44">
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                    played ? s.dot : 'bg-foreground-ghost'
                  )}
                />
                <span className={cn('truncate', played ? s.chip : 'text-foreground-subtle')}>
                  {turn.label}
                </span>
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  played ? cn('text-foreground-subtle', s.detail) : 'text-foreground-subtle'
                )}
              >
                {turn.detail}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
