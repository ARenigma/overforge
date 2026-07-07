'use client';

import * as React from 'react';

/* The living FSM field — the hero's ambient layer. A 2D-canvas node graph in the brand trace:
 * faint state nodes, hairline directed edges, and occasional PULSES — a dot travels one edge and
 * settles into its target node (transitions that complete; nothing loops forever in place).
 * Discipline (from reading Supabase's www source): draw on refs via rAF (zero React re-renders),
 * DPR capped at 2, IntersectionObserver pause, ~30fps throttle, and it renders NOTHING when
 * prefers-reduced-motion — the static ASCII <pre> beneath stays as the finished fallback. */

interface Node {
  x: number;
  y: number;
  r: number;
  accepting: boolean;
}
interface Edge {
  a: number;
  b: number;
}
interface Pulse {
  edge: number;
  t: number; // 0..1 along the edge
  speed: number;
}

const NODE_COUNT = 26;
const FPS_MS = 33; // ~30fps is plenty for ambience
const PULSE_EVERY_MS = 900;

export function FsmField({
  className,
  fallback,
}: {
  className?: string;
  /** Server-rendered static field (the ASCII <pre>) — shown at SSR/first paint and kept on
   *  reduced-motion / touch devices; the canvas takes over only on capable desktops. */
  fallback?: React.ReactNode;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    // Capability gate: motion-ok + hover-pointer devices only (mobile keeps the static field).
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!reduced && finePointer) setEnabled(true);
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    let lastPulse = 0;
    let running = true;
    let w = 0;
    let h = 0;

    // Brand colors read once from tokens (theme changes remount via key on <html> class… cheap
    // approach: re-read on visibility flips; ambience tolerates a stale frame).
    const css = getComputedStyle(document.documentElement);
    const trace = `hsl(${css.getPropertyValue('--primary').trim()}`;
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const pulses: Pulse[] = [];

    const seed = () => {
      nodes.length = 0;
      edges.length = 0;
      // Deterministic-ish lattice with jitter — reads as topology, not confetti.
      const cols = Math.max(6, Math.floor(w / 190));
      const rows = Math.max(3, Math.floor(h / 150));
      let n = 0;
      for (let gy = 0; gy < rows && n < NODE_COUNT; gy++) {
        for (let gx = 0; gx < cols && n < NODE_COUNT; gx++) {
          // halton-ish jitter from indices (stable across frames, no Math.random storms)
          const jx = (((gx * 7919 + gy * 104729) % 100) / 100 - 0.5) * 70;
          const jy = (((gx * 15485 + gy * 32452) % 100) / 100 - 0.5) * 50;
          nodes.push({
            x: ((gx + 0.5) / cols) * w + jx,
            y: ((gy + 0.5) / rows) * h + jy,
            r: 2 + ((gx + gy) % 3),
            accepting: (gx * 31 + gy * 17) % 7 === 0,
          });
          n++;
        }
      }
      // Edges: each node points to a near neighbour to the right/down — a flowing DAG.
      nodes.forEach((node, i) => {
        let best = -1;
        let bestD = Infinity;
        nodes.forEach((m, j) => {
          if (j === i) return;
          const dx = m.x - node.x;
          const dy = m.y - node.y;
          if (dx <= 10) return; // forward only — determinism flows rightward
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        });
        if (best >= 0) edges.push({ a: i, b: best });
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!running || now - last < FPS_MS) return;
      last = now;

      ctx.clearRect(0, 0, w, h);

      // Edges — hairlines.
      ctx.lineWidth = 1;
      ctx.strokeStyle = `${trace} / 0.08)`;
      ctx.beginPath();
      for (const e of edges) {
        ctx.moveTo(nodes[e.a].x, nodes[e.a].y);
        ctx.lineTo(nodes[e.b].x, nodes[e.b].y);
      }
      ctx.stroke();

      // Nodes — rings; accepting states get the double circle.
      for (const n of nodes) {
        ctx.strokeStyle = `${trace} / 0.15)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.stroke();
        if (n.accepting) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Spawn a pulse now and then — one transition at a time, never a swarm.
      if (now - lastPulse > PULSE_EVERY_MS && pulses.length < 3 && edges.length) {
        lastPulse = now;
        pulses.push({
          edge: (now | 0) % edges.length,
          t: 0,
          speed: 0.008 + ((now | 0) % 5) * 0.002,
        });
      }

      // Pulses — travel the edge, flare the target node, and SETTLE (remove).
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.speed;
        const e = edges[p.edge];
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (p.t >= 1) {
          ctx.strokeStyle = `${trace} / 0.5)`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
          ctx.stroke();
          pulses.splice(i, 1);
          continue;
        }
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        ctx.fillStyle = `${trace} / ${0.55 * (1 - p.t * 0.4)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        // faint trail on the edge being walked
        ctx.strokeStyle = `${trace} / 0.14)`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    };

    const io = new IntersectionObserver(([e]) => {
      running = e.isIntersecting;
    });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [enabled]);

  if (!enabled) return <>{fallback}</>;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        WebkitMaskImage: 'radial-gradient(70% 60% at 50% 34%, black, transparent 82%)',
        maskImage: 'radial-gradient(70% 60% at 50% 34%, black, transparent 82%)',
      }}
    />
  );
}
