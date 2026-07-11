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
  // A quiet static rendition of the wire-knot sculpture — three interleaved loops + the state
  // marker — for SSR + incapable devices. Same caption register as the live scene.
  return (
    <div className="relative h-full w-full">
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
          cy="200"
          rx="152"
          ry="86"
          transform="rotate(-18 240 200)"
          stroke="hsl(var(--primary) / 0.9)"
          strokeWidth="1.6"
        />
        <ellipse
          cx="240"
          cy="200"
          rx="150"
          ry="88"
          transform="rotate(44 240 200)"
          stroke="hsl(var(--primary) / 0.45)"
          strokeWidth="1.3"
        />
        <ellipse
          cx="240"
          cy="200"
          rx="146"
          ry="84"
          transform="rotate(-80 240 200)"
          stroke="hsl(var(--primary) / 0.25)"
          strokeWidth="1.1"
        />
        <circle cx="380" cy="153" r="5" fill="hsl(var(--foreground) / 0.9)" />
      </svg>
      <div className="pointer-events-none absolute bottom-[4%] left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-subtle">
        state 3 of 5 — <span className="text-primary">coding</span>
      </div>
    </div>
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
