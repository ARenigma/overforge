'use client';

import * as React from 'react';
import Image from 'next/image';
import { EditorialHeader } from './section';
import { ProductFrame } from './frame';
import { cn } from '@/lib/utils';

/* Anatomy of an interview — the state-tab console as a SCROLL-SCRUBBED walkthrough. The console
 * pins (position: sticky) while a tall track scrolls behind it, and scroll progress steps the active
 * state invite → oral → coding → score, so the reader physically passes through every stage and
 * can't scroll past one (the old timer auto-advanced whether or not you were looking). Each panel is
 * a REAL screenshot; the tab bars scrub with scroll. No transformed ancestor (that would break the
 * sticky); the panel is capped in vh units so the whole console fits one viewport at any height. */

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

export function Anatomy() {
  const trackRef = React.useRef<HTMLElement>(null);
  const [active, setActive] = React.useState(0);
  const [frac, setFrac] = React.useState(0); // intra-state scroll progress (0..1) for the active bar

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const dist = track.offsetHeight - window.innerHeight; // distance the console stays pinned
      const p = dist > 0 ? Math.min(Math.max(-track.getBoundingClientRect().top / dist, 0), 1) : 0;
      const scaled = p * STATES.length;
      const idx = Math.min(STATES.length - 1, Math.floor(scaled));
      setActive(idx);
      setFrac(Math.min(Math.max(scaled - idx, 0), 1));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Clicking a tab scrolls to that stage's slice of the pinned track.
  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const dist = track.offsetHeight - window.innerHeight;
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((i + 0.5) / STATES.length) * dist, behavior: 'smooth' });
  };

  return (
    <section
      id="anatomy"
      ref={trackRef}
      className="relative"
      style={{ height: `calc(${STATES.length * 70}vh + 100vh)` }}
    >
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden py-16">
        <div className="mx-auto w-full max-w-7xl px-6">
          <EditorialHeader
            index="03"
            eyebrow="anatomy of an interview"
            lead="Five states."
            tail="No improvisation."
            sub="Scroll the machine — every session walks the same auditable path, state by state."
          />

          {/* State tabs — the linear bar SCRUBS with scroll (past = full, active = scroll frac). */}
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            {STATES.map((s, i) => {
              const fill = i < active ? 1 : i === active ? frac : 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-pressed={i === active}
                  className="group relative pt-3.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="absolute inset-x-0 top-0 h-[2px] overflow-hidden rounded-full bg-border">
                    <span
                      className="block h-full origin-left bg-primary"
                      style={{ transform: `scaleX(${fill})` }}
                    />
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
              );
            })}
          </div>

          {/* Panel — theme-paired real screenshots; width capped in vh so the console fits the pinned
              viewport (large, readable, edges flush to the browser shell). */}
          <div className="mt-5">
            <ProductFrame className="mx-auto w-full max-w-[92vh] p-1">
              <div className="relative aspect-[16/10] w-full">
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
                      className="hidden object-cover object-top dark:block"
                      priority={i === 0}
                    />
                    <Image
                      src={`/shots/${s.shot}-light.png`}
                      alt={s.alt}
                      fill
                      sizes="(max-width: 1280px) 100vw, 1216px"
                      className="object-cover object-top dark:hidden"
                      priority={i === 0}
                    />
                  </div>
                ))}
              </div>
            </ProductFrame>
            <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-muted-foreground">
              {STATES[active].desc}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
