'use client';

import * as React from 'react';
import { SeamCard } from './seam-card';

/* The pricing device — an INSTANT cost calculator (together.ai's unit-table register: every number
 * has a unit, savings shown in green, updates settle immediately — no spinner, no debounce).
 * Placeholder unit prices consistent with the tier cards; confirm before launch. */

const LADDER = [
  { upTo: 50, unit: 0.9 },
  { upTo: 500, unit: 0.6 },
  { upTo: 5000, unit: 0.45 },
] as const;

// A first-round human screen ≈ 1.5 engineer-hours (interview + notes + calibration) at a ~$100/h
// loaded cost — conservative, sourced in copy below.
const ENG_HOURS_PER_SCREEN = 1.5;
const ENG_HOURLY_USD = 100;

const unitFor = (n: number) => (LADDER.find((l) => n <= l.upTo) ?? LADDER[LADDER.length - 1]).unit;
const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(n < 10 ? 2 : 0)}`;

export function PricingCalculator() {
  const [n, setN] = React.useState(120);
  const unit = unitFor(n);
  const monthly = n * unit;
  const savedHours = n * ENG_HOURS_PER_SCREEN;
  const savedUsd = savedHours * ENG_HOURLY_USD - monthly;

  return (
    <div className="mx-auto max-w-5xl px-6 pt-14">
      <SeamCard innerClassName="p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
            cost, computed — not &ldquo;from $X&rdquo;
          </p>
          <p className="font-mono text-[11px] text-foreground-ghost">
            unit ladder: $0.90 → $0.60 → $0.45 / interview
          </p>
        </div>

        <div className="mt-6 grid items-end gap-8 lg:grid-cols-[1.1fr_1fr_1fr]">
          {/* Input */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Interviews / month</span>
              <span className="font-mono text-2xl font-medium tabular-nums text-foreground">
                {n.toLocaleString('en-US')}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={2000}
              step={10}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              aria-label="Interviews per month"
              className="mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-[hsl(var(--primary))]"
            />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-foreground-ghost">
              <span>10</span>
              <span>2,000</span>
            </div>
          </div>

          {/* Cost */}
          <div className="border-l border-border pl-8">
            <span className="text-sm text-muted-foreground">Your cost</span>
            <div className="mt-1 font-mono text-3xl font-medium tabular-nums text-foreground">
              {money(monthly)}
              <span className="text-sm text-foreground-subtle"> /mo</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-foreground-subtle">
              {money(unit)} per interview at this volume
            </p>
          </div>

          {/* Savings — the green number */}
          <div className="border-l border-border pl-8">
            <span className="text-sm text-muted-foreground">Engineer time returned</span>
            <div className="mt-1 font-mono text-3xl font-medium tabular-nums text-success">
              {Math.round(savedHours).toLocaleString('en-US')}h
            </div>
            <p className="mt-1 font-mono text-[11px] text-success/80">
              ≈ {money(Math.max(0, savedUsd))} /mo vs engineer-led screens
            </p>
          </div>
        </div>

        <p className="mt-6 border-t border-border pt-4 font-mono text-[10px] leading-relaxed text-foreground-ghost">
          assumes a first-round human screen costs ~{ENG_HOURS_PER_SCREEN} engineer-hours (interview
          + writeup + calibration) at ~${ENG_HOURLY_USD}/h loaded — adjust for your team.
          Launch-preview pricing; confirmed at GA.
        </p>
      </SeamCard>
    </div>
  );
}
