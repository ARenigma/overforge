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
        <p className="mb-5 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
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
          <div
            className="flex w-max animate-marquee items-center gap-16 whitespace-nowrap"
            aria-hidden="true"
          >
            {[...BRANDS, ...BRANDS].map((brand, i) =>
              brand.type === 'icon' ? (
                <brand.Icon
                  key={i}
                  className="h-5 w-5 text-muted-foreground/50 transition-colors duration-200 hover:text-muted-foreground"
                />
              ) : (
                <span
                  key={i}
                  className="font-sans text-sm font-semibold text-muted-foreground/40 transition-colors duration-200 hover:text-muted-foreground/70"
                >
                  {brand.name}
                </span>
              )
            )}
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
