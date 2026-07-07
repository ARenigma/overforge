'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

/* Hero visual wrapper — decides whether to load the WebGL system (capable desktops) or hold the
 * static SVG fallback (touch / reduced-motion / no-WebGL), lazy-imports the heavy three.js scene
 * off the critical path, and overlays the mono-caps annotation labels on leader lines (together.ai's
 * signature callouts) so the composition reads as an annotated system, not a toy. */

const HeroGraph3D = dynamic(() => import('./hero-graph-3d'), { ssr: false });

// Annotations pinned to the composition — mono-caps callouts with hairline leader lines, together's
// "▪ PRODUCTION INFERENCE" register, in our own vocabulary.
const NOTES = [
  { key: 'oral', label: 'adaptive oral', className: 'left-[1%] top-[22%]' },
  { key: 'run', label: 'sandboxed run', className: 'right-[2%] top-[9%] text-right' },
  { key: 'score', label: 'deterministic score', className: 'right-[1%] bottom-[19%] text-right' },
] as const;

function StaticFallback() {
  // A quiet static rendition of the same system — nodes on a loop — for SSR + incapable devices.
  return (
    <svg
      viewBox="0 0 480 420"
      className="h-full w-full"
      fill="none"
      aria-hidden="true"
      style={{
        WebkitMaskImage: 'radial-gradient(72% 72% at 50% 46%, black, transparent 92%)',
        maskImage: 'radial-gradient(72% 72% at 50% 46%, black, transparent 92%)',
      }}
    >
      <ellipse
        cx="240"
        cy="210"
        rx="150"
        ry="120"
        transform="rotate(-16 240 210)"
        stroke="hsl(var(--primary) / 0.28)"
        strokeWidth="1.5"
      />
      <path
        d="M96 250 C 150 150, 210 300, 260 190 S 380 150, 392 214"
        stroke="hsl(var(--primary) / 0.5)"
        strokeWidth="1.5"
      />
      {[
        [96, 250, 5],
        [175, 205, 6],
        [260, 190, 5],
        [330, 172, 6],
        [392, 214, 9],
      ].map(([cx, cy, r], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill="hsl(var(--primary) / 0.85)" />
          {i === 4 && (
            <circle
              cx={cx}
              cy={cy}
              r={r + 7}
              stroke="hsl(var(--primary) / 0.6)"
              strokeWidth="1.5"
            />
          )}
        </g>
      ))}
    </svg>
  );
}

export function HeroVisual({ className }: { className?: string }) {
  const [use3d, setUse3d] = React.useState(false);

  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    // Cheap WebGL support probe.
    let webgl = false;
    try {
      webgl = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      webgl = false;
    }
    if (!reduced && fine && webgl) setUse3d(true);
  }, []);

  return (
    <div className={className}>
      <div className="relative h-full w-full">
        {use3d ? <HeroGraph3D className="h-full w-full" /> : <StaticFallback />}

        {/* Annotation callouts — the together.ai leader-line labels. */}
        {NOTES.map((n) => (
          <div
            key={n.key}
            className={`pointer-events-none absolute ${n.className} flex flex-col gap-1`}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
              <span className="text-primary">▪</span> {n.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
