'use client';

import * as React from 'react';
import { SeamCard } from './seam-card';

/* The pricing device — an INSTANT savings calculator (together.ai's unit-table register: every
 * number has a unit, updates settle immediately — no spinner, no debounce). The NARRATIVE leads
 * with what you save; what Finite costs is the supporting figure. The unit ladder still drives
 * the math but is not displayed. Placeholder unit prices consistent with the tier cards. */

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
    <div className="mx-auto max-w-7xl px-6 pt-14">
      <SeamCard innerClassName="p-6 sm:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-subtle">
          savings, computed &mdash; not promised
        </p>

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

          {/* Savings — THE number. The narrative leads with what you get back. */}
          <div className="border-l border-border pl-8">
            <span className="text-sm text-muted-foreground">You save</span>
            <div className="mt-1 font-mono text-4xl font-bold tabular-nums text-success">
              {money(Math.max(0, savedUsd))}
              <span className="text-sm font-medium text-success/80"> /mo</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-success/80">
              ≈ {Math.round(savedHours).toLocaleString('en-US')}h of engineer time returned
            </p>
          </div>

          {/* What it costs — the supporting figure. */}
          <div className="border-l border-border pl-8">
            <span className="text-sm text-muted-foreground">What Finite costs</span>
            <div className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
              {money(monthly)}
              <span className="text-sm text-foreground-subtle"> /mo</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-foreground-subtle">
              {money(unit)} per interview at this volume
            </p>
          </div>
        </div>
      </SeamCard>
    </div>
  );
}
