'use client';

// Placeholder testimonials in ReviewsMarquee — replace with real quotes before production.

const TECH = [
  'Supabase',
  'Docker',
  'Vercel',
  'Postgres',
  'Resend',
  'Next.js',
  'MiniMax',
  'GitHub',
] as const;

interface Review {
  initials: string;
  name: string;
  handle: string;
  quote: string;
}

const REVIEWS: Review[] = [
  {
    initials: 'SR',
    name: 'Sarah R.',
    handle: '@saraheng',
    quote:
      "The scorecard lands in my inbox before I've had a second coffee. Bias gone, time gone, inconsistency gone. First-round scheduling cut by 80%.",
  },
  {
    initials: 'TK',
    name: 'Tom K.',
    handle: '@tomkwrites',
    quote:
      'Fixed rubrics mean the same answer gets the same score every time. I can finally defend a hiring decision with numbers, not gut feel.',
  },
  {
    initials: 'PM',
    name: 'Priya M.',
    handle: '@priyaem',
    quote:
      "We screen four times as many candidates with the same headcount. Overforge runs the repetitive part so engineers only talk to people who've proven themselves.",
  },
  {
    initials: 'JL',
    name: 'James L.',
    handle: '@jlhiring',
    quote:
      "The sandboxed execution sold me — real code, real output, zero infrastructure on our side. Candidates can tell it's a serious tool.",
  },
  {
    initials: 'AW',
    name: 'Anika W.',
    handle: '@anikahire',
    quote:
      "Follow-up questions that actually made sense, scored against a rubric I wrote myself. That's the product.",
  },
  {
    initials: 'RD',
    name: 'Raj D.',
    handle: '@rajdtech',
    quote:
      'Python, Go, Java — Overforge handles all three without any configuration on my end. Multi-language support out of the box was the deciding factor.',
  },
];

/** Infinite CSS marquee strip for the "Built on" tech stack. */
export function Marquee() {
  return (
    <div className="border-y border-border">
      <div className="py-6">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Built on infrastructure you already trust
        </p>
        <div className="overflow-hidden">
          <div className="flex w-max animate-marquee gap-16 whitespace-nowrap" aria-hidden="true">
            {[...TECH, ...TECH].map((name, i) => (
              <span
                key={i}
                className="font-mono text-sm font-medium uppercase tracking-widest text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Infinite horizontal CSS marquee of review cards — "wall of love". */
export function ReviewsMarquee() {
  const doubled = [...REVIEWS, ...REVIEWS];
  return (
    <div className="overflow-hidden py-2">
      <div
        className="flex w-max animate-marquee gap-4"
        style={{ animationDuration: '40s' }}
        aria-hidden="true"
      >
        {doubled.map((r, i) => (
          <div key={i} className="w-[300px] shrink-0 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-foreground">
                {r.initials}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.handle}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.quote}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
