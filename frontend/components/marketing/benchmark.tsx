'use client';

import * as React from 'react';
import { Section, EditorialHeader } from './section';
import { Reveal } from './reveal';
import { cn } from '@/lib/utils';

/* The proof band — named-comparison horizontal bars (together.ai's credibility device: small bars
 * next to huge bars, values in mono, honest footnotes). Finite's bar is the trace; the drama is
 * the scale gap, not decoration. Server component, zero JS. */

interface Bar {
  label: string;
  value: string;
  /** Width as a fraction of the group max (min floor keeps tiny winners visible). */
  frac: number;
  finite?: boolean;
}

const GROUPS: { title: string; unit: string; bars: Bar[] }[] = [
  {
    title: 'Interviewer response, mid-conversation',
    unit: 'seconds',
    bars: [
      { label: 'finite', value: '~1s', frac: 0.125, finite: true },
      { label: 'generic LLM chat interviewer', value: '~8s', frac: 1 },
    ],
  },
  {
    title: 'Time to scorecard',
    unit: 'hours',
    bars: [
      { label: 'finite', value: '~0.1h', frac: 0.02, finite: true },
      { label: 'take-home review', value: '~72h', frac: 0.6 },
      { label: 'panel + debrief', value: '~120h', frac: 1 },
    ],
  },
  {
    title: 'Engineer-hours per screen',
    unit: 'hours',
    bars: [
      { label: 'finite', value: '0h', frac: 0.02, finite: true },
      { label: 'engineer-led screen', value: '~1.5h', frac: 1 },
    ],
  },
];

export function Benchmark() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Section id="proof">
      <EditorialHeader
        index="05"
        eyebrow="the screen, timed"
        lead="Faster where it counts."
        tail="Honest about the rest."
        sub="Three measures that decide whether a screen respects everyone's time — with sources."
      />
      <Reveal className="mt-10 space-y-9">
        <div ref={ref} className="space-y-9">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-sm font-medium text-foreground">{g.title}</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground-ghost">
                  {g.unit}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {g.bars.map((b, bi) => (
                  <div key={b.label} className="flex items-center gap-4">
                    <span
                      className={cn(
                        'w-56 shrink-0 truncate font-mono text-[12px]',
                        b.finite ? 'text-foreground' : 'text-foreground-subtle'
                      )}
                    >
                      {b.label}
                      {b.finite && <span className="text-primary">.</span>}
                    </span>
                    <div className="relative h-5 min-w-0 flex-1">
                      <div
                        className={cn(
                          'h-full origin-left rounded-sm transition-transform duration-700 ease-out-cubic',
                          b.finite ? 'bg-primary' : 'bg-foreground-ghost/25',
                          inView ? 'scale-x-100' : 'scale-x-0'
                        )}
                        // Stagger each bar so the group visibly grows as it scrolls into view.
                        style={{
                          width: `${Math.max(b.frac * 100, 1.25)}%`,
                          transitionDelay: inView ? `${bi * 110}ms` : '0ms',
                        }}
                      />
                      <span
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[11px] tabular-nums',
                          b.finite ? 'text-primary' : 'text-foreground-subtle'
                        )}
                        // A full-length bar's label sits INSIDE its right edge — hung outside it
                        // widens the page on phones.
                        style={
                          b.frac > 0.9
                            ? { right: '8px' }
                            : { left: `calc(${Math.max(b.frac * 100, 1.25)}% + 10px)` }
                        }
                      >
                        {b.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
