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

export function FsmLedger() {
  const prefersReduced = usePrefersReducedMotion();
  const [count, setCount] = React.useState(prefersReduced ? SCRIPT.length : 0);
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const atStart = count === 0; // re-arm the play loop each time it resets to the start

  React.useEffect(() => {
    if (prefersReduced || !inView || !atStart) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setCount((c) => {
        if (c >= SCRIPT.length) {
          timer = setTimeout(() => setCount(0), HOLD_MS); // hold on terminal, then reset
          return c;
        }
        timer = setTimeout(tick, STEP_MS);
        return c + 1;
      });
    };
    timer = setTimeout(tick, STEP_MS);
    return () => clearTimeout(timer);
  }, [inView, prefersReduced, atStart]);

  return (
    <div ref={ref} className="w-full">
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

      <div
        className="relative min-h-[340px] px-2 py-1.5 sm:min-h-[360px]"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, black 88%, transparent)',
          maskImage: 'linear-gradient(to bottom, black 88%, transparent)',
        }}
      >
        {SCRIPT.slice(0, count).map((turn, i) => {
          const s = KIND_STYLES[turn.kind];
          const isNewest = !prefersReduced && i === count - 1;
          return (
            <div
              key={turn.t}
              className={cn(
                'flex items-baseline gap-3 rounded-md px-2 py-1.5 font-mono text-[12px] leading-relaxed sm:text-[13px]',
                isNewest &&
                  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300'
              )}
            >
              <span className="w-11 shrink-0 tabular-nums text-foreground-subtle">{turn.t}</span>
              <span className="flex w-[9.5rem] shrink-0 items-center gap-1.5 sm:w-44">
                <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
                <span className={cn('truncate', s.chip)}>{turn.label}</span>
              </span>
              <span className={cn('min-w-0 flex-1 truncate text-foreground-subtle', s.detail)}>
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

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}
