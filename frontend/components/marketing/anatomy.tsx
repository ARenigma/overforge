'use client';

import * as React from 'react';
import Image from 'next/image';
import { Section, EditorialHeader } from './section';
import { ProductFrame } from './frame';
import { Reveal } from './reveal';
import { cn } from '@/lib/utils';

/* Anatomy of an interview — the state-tab console. Tabs are the FSM's states; each panel is a REAL
 * screenshot of the product in that state (the product is the imagery). Tabs auto-advance on a
 * LINEAR progress bar — deterministic, clock-like, the brand's motion signature — and any click
 * takes over. IO-paused off-screen; reduced-motion disables auto-advance. Plain stills — no staged
 * hover theater. */

const STATES = [
  {
    key: 'invite',
    label: 'state: invite',
    title: 'One link, no scheduling',
    desc: 'Create the interview, send the link. The machine handles the rest — any hour, any timezone.',
    shot: 'invite',
    alt: 'The Finite dashboard with interviews and their statuses',
  },
  {
    key: 'oral',
    label: 'state: oral',
    title: 'A spoken conversation',
    desc: 'Role-specific questions asked out loud. Every follow-up adapts to the answer just given — no script.',
    shot: 'oral',
    alt: 'The interview room during the spoken round',
  },
  {
    key: 'coding',
    label: 'state: coding',
    title: 'Real code, really run',
    desc: 'A sandboxed IDE graded against hidden tests. When a run fails twice, the interviewer probes — it never hands over the fix.',
    shot: 'coding',
    alt: 'The interview room in the coding phase with a probe from the interviewer',
  },
  {
    key: 'score',
    label: 'state: score',
    title: 'A deterministic scorecard',
    desc: 'Fixed rubric, per-dimension notes, delivered minutes after the session ends. Same answers, same score — every run.',
    shot: 'score',
    alt: 'A scored interview with rubric dimensions',
  },
] as const;

const ADVANCE_MS = 7000;

export function Anatomy() {
  const [active, setActive] = React.useState(0);
  const [cycle, setCycle] = React.useState(0); // bumps to restart the bar animation on manual select
  const ref = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    if (!inView || reduced) return;
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % STATES.length);
      setCycle((c) => c + 1);
    }, ADVANCE_MS);
    return () => clearTimeout(t);
  }, [inView, reduced, active, cycle]);

  const select = (i: number) => {
    setActive(i);
    setCycle((c) => c + 1);
  };

  return (
    <Section id="anatomy">
      <EditorialHeader
        index="03"
        eyebrow="anatomy of an interview"
        lead="Five states."
        tail="No improvisation."
        sub="The interview is a finite-state machine — every session walks the same auditable path."
      />

      <Reveal className="mt-8">
        <div ref={ref}>
          {/* State tabs — story-tab register: the linear progress bar rides the TOP of each tab
              (deterministic, clock-like); active = emphasis, never a box. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            {STATES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => select(i)}
                aria-pressed={i === active}
                className="group relative pt-3.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="absolute inset-x-0 top-0 h-[2px] overflow-hidden rounded-full bg-border">
                  {i === active && inView && !reduced && (
                    <span
                      key={cycle}
                      className="block h-full origin-left bg-primary"
                      style={{ animation: `anatomy-bar ${ADVANCE_MS}ms linear forwards` }}
                    />
                  )}
                  {i === active && (reduced || !inView) && (
                    <span className="block h-full bg-primary" />
                  )}
                </span>
                <span
                  className={cn(
                    'block font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-fast ease-out-cubic',
                    i === active
                      ? 'text-primary'
                      : 'text-foreground-subtle group-hover:text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
                <span
                  className={cn(
                    'mt-1 block text-sm transition-colors duration-fast ease-out-cubic',
                    i === active
                      ? 'text-foreground'
                      : 'text-muted-foreground group-hover:text-foreground'
                  )}
                >
                  {s.title}
                </span>
              </button>
            ))}
          </div>

          {/* Panel — theme-paired real screenshots. Height is capped so the whole console (header +
              tabs + panel) stays within one viewport. */}
          <div className="mt-6">
            <ProductFrame>
              <div className="relative mx-auto aspect-[16/10] max-h-[66vh] w-full">
                {STATES.map((s, i) => (
                  <div
                    key={s.key}
                    aria-hidden={i !== active}
                    className={cn(
                      'absolute inset-0 transition-opacity duration-slow ease-out-cubic',
                      i === active ? 'opacity-100' : 'pointer-events-none opacity-0'
                    )}
                  >
                    <Image
                      src={`/shots/${s.shot}-dark.png`}
                      alt={s.alt}
                      fill
                      sizes="(max-width: 1280px) 100vw, 1216px"
                      className="hidden object-contain object-top dark:block"
                      priority={i === 0}
                    />
                    <Image
                      src={`/shots/${s.shot}-light.png`}
                      alt={s.alt}
                      fill
                      sizes="(max-width: 1280px) 100vw, 1216px"
                      className="object-contain object-top dark:hidden"
                      priority={i === 0}
                    />
                  </div>
                ))}
              </div>
            </ProductFrame>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{STATES[active].desc}</p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
