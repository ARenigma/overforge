'use client';

// Placeholder brands — replace with real customer logos before production.

import {
  SiRazorpay,
  SiPhonepe,
  SiZomato,
  SiSwiggy,
  SiAmericanexpress,
  SiOyo,
} from 'react-icons/si';
import type { IconType } from 'react-icons';

type Brand = { type: 'icon'; name: string; Icon: IconType } | { type: 'wordmark'; name: string };

const BRANDS: Brand[] = [
  { type: 'icon', name: 'OYO', Icon: SiOyo },
  { type: 'wordmark', name: 'Pristyn Care' },
  { type: 'wordmark', name: 'axionix.tech' },
  { type: 'icon', name: 'Amex', Icon: SiAmericanexpress },
  { type: 'icon', name: 'Razorpay', Icon: SiRazorpay },
  { type: 'icon', name: 'PhonePe', Icon: SiPhonepe },
  { type: 'icon', name: 'Zomato', Icon: SiZomato },
  { type: 'icon', name: 'Swiggy', Icon: SiSwiggy },
  { type: 'wordmark', name: 'CRED' },
  { type: 'wordmark', name: 'Groww' },
];

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

/** Infinite CSS marquee strip — "Trusted by high-growth teams". */
export function Marquee() {
  return (
    <div>
      <div className="py-10">
        <p className="mb-5 text-center text-xs font-medium uppercase tracking-[0.2em] text-foreground-subtle">
          Trusted by high-growth teams
        </p>
        <div
          className="overflow-hidden"
          style={{
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
            maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          }}
        >
          {/* Two identical groups + translateX(-50%) keyframe = seamless closed loop. */}
          <div className="flex w-max animate-marquee" aria-hidden="true">
            {[0, 1].map((group) => (
              <ul key={group} className="flex shrink-0 items-center gap-16 pr-16">
                {BRANDS.map((brand, i) => (
                  <li
                    key={`${group}-${i}`}
                    className="flex items-center gap-2 whitespace-nowrap text-foreground-subtle transition-colors duration-200 hover:text-muted-foreground"
                  >
                    {brand.type === 'icon' && (
                      <brand.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="font-sans text-sm font-semibold">{brand.name}</span>
                  </li>
                ))}
              </ul>
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
    <div
      className="overflow-hidden py-2"
      style={{
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
      }}
    >
      <div
        className="flex w-max animate-marquee gap-6"
        style={{ animationDuration: '40s' }}
        aria-hidden="true"
      >
        {doubled.map((r, i) => (
          <div
            key={i}
            className="w-[320px] shrink-0 rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-accent/30"
          >
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
