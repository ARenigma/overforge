'use client';

import * as React from 'react';
import * as THREE from 'three';

/* The hero 3D system — "Five states. No improvisation." made kinetic. An ultramarine wireframe
 * knot with exactly FIVE fixed configurations, one per interview state (invite → oral → coding →
 * score → end). It never tweens freely: every few seconds it SNAPS to the next configuration with
 * a fast spring settle — the "settle, don't float" law, and determinism made visible. Pure line
 * rendering (no lights, no env map), so it's substantially lighter than the old glossy scene.
 * Colors read from brand tokens so it tracks both themes; the wrapper capability-gates it. */

function tokenColor(name: string, fallback: string): THREE.Color {
  if (typeof window === 'undefined') return new THREE.Color(fallback);
  const css = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!css) return new THREE.Color(fallback);
  const [h, s, l] = css.split(/\s+/);
  const c = new THREE.Color();
  try {
    c.setStyle(`hsl(${h}, ${s}, ${l})`);
  } catch {
    c.setStyle(fallback);
  }
  return c;
}

const STATES = ['invite', 'oral', 'coding', 'score', 'end'] as const;

// One torus knot per state — coprime (p,q) windings keep each a SINGLE closed curve (a different,
// equally finite shape every time), with a silhouette + resting pose of its own.
const CONFIGS: ReadonlyArray<{
  p: number;
  q: number;
  R: number;
  r: number;
  z: number;
  rot: readonly [number, number];
}> = [
  { p: 2, q: 3, R: 1.0, r: 0.42, z: 1.0, rot: [0.35, 0.0] },
  { p: 3, q: 2, R: 0.95, r: 0.5, z: 1.15, rot: [0.12, 0.9] },
  { p: 2, q: 5, R: 1.05, r: 0.34, z: 0.9, rot: [0.55, 1.8] },
  { p: 3, q: 4, R: 0.9, r: 0.44, z: 1.05, rot: [0.08, 2.7] },
  { p: 5, q: 2, R: 1.0, r: 0.48, z: 0.85, rot: [0.45, 3.6] },
];

const N = 720; // samples along the curve — smooth at hero size, trivial for a line draw
const SIZE = 2.3; // world radius each knot is normalized to (uniform visual mass across states)
const SNAP_EVERY_MS = 3000;
const MORPH_MS = 650;

function knotPositions(cfg: (typeof CONFIGS)[number]): Float32Array {
  const raw: number[] = new Array(N * 3);
  let max = 0;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const w = cfg.R + cfg.r * Math.cos(cfg.q * t);
    const x = w * Math.cos(cfg.p * t);
    const y = w * Math.sin(cfg.p * t);
    const z = cfg.r * Math.sin(cfg.q * t) * cfg.z;
    raw[i * 3] = x;
    raw[i * 3 + 1] = y;
    raw[i * 3 + 2] = z;
    max = Math.max(max, Math.hypot(x, y, z));
  }
  const s = SIZE / max;
  const out = new Float32Array(N * 3);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] * s;
  return out;
}

// easeOutBack — fast attack, a slight overshoot, then a decisive settle: the SNAP.
function snapEase(u: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const v = u - 1;
  return 1 + c3 * v * v * v + c1 * v * v;
}

export default function HeroGraph3D({ className }: { className?: string }) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [stateIdx, setStateIdx] = React.useState(0);

  React.useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    const primary = tokenColor('--primary', 'hsl(226, 100%, 62%)');

    const group = new THREE.Group();
    scene.add(group);

    // Pre-compute all five configurations once; morph between them by lerping ONE position buffer.
    const targets = CONFIGS.map(knotPositions);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(targets[0].slice(), 3));
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const cur = posAttr.array as Float32Array;

    // Three nested passes of the same curve — a bright core wire and two dimmer echoes — read as a
    // drawn glow without any postprocessing.
    const passes: Array<{ scale: number; color: THREE.Color; opacity: number }> = [
      { scale: 1, color: primary.clone(), opacity: 0.95 },
      { scale: 0.9, color: primary.clone().multiplyScalar(0.7), opacity: 0.4 },
      { scale: 0.8, color: primary.clone().multiplyScalar(0.45), opacity: 0.22 },
    ];
    const materials: THREE.LineBasicMaterial[] = [];
    for (const p of passes) {
      const mat = new THREE.LineBasicMaterial({
        color: p.color,
        transparent: true,
        opacity: p.opacity,
      });
      materials.push(mat);
      const line = new THREE.LineLoop(geometry, mat);
      line.scale.setScalar(p.scale);
      line.frustumCulled = false; // the buffer morphs in place — skip stale bounding-sphere culls
      group.add(line);
    }

    // The state marker — a small bright bead pinned to the curve's origin sample.
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 20, 20),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ededed') })
    );
    group.add(marker);

    // Pointer parallax — the sculpture tilts gently toward the cursor (lerped, never jumpy).
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
    };
    window.addEventListener('pointermove', onPointer);

    const resize = () => {
      const r = mount.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let running = true;
    const io = new IntersectionObserver(([e]) => (running = e.isIntersecting));
    io.observe(mount);

    // Snap machinery: discrete state index, one in-flight morph at a time.
    let idx = 0;
    let lastSnap = 0;
    let morphStart: number | null = null;
    const from = new Float32Array(cur.length);
    let raf = 0;
    const clock = new THREE.Clock();

    const applyMarker = () => marker.position.set(cur[0], cur[1], cur[2]);
    applyMarker();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      const elapsed = clock.getElapsedTime() * 1000;

      if (morphStart === null && elapsed - lastSnap > SNAP_EVERY_MS) {
        idx = (idx + 1) % CONFIGS.length;
        setStateIdx(idx);
        from.set(cur);
        morphStart = elapsed;
      }
      if (morphStart !== null) {
        const u = Math.min(1, (elapsed - morphStart) / MORPH_MS);
        const k = snapEase(u);
        const to = targets[idx];
        for (let j = 0; j < cur.length; j++) cur[j] = from[j] + (to[j] - from[j]) * k;
        posAttr.needsUpdate = true;
        applyMarker();
        if (u >= 1) {
          morphStart = null;
          lastSnap = elapsed;
        }
      }

      // Drift toward the state's resting pose + pointer parallax + a slow breath.
      const cfg = CONFIGS[idx];
      const ty = cfg.rot[1] * 0.22 + Math.sin(elapsed / 5200) * 0.14 + target.x;
      const tx = cfg.rot[0] * 0.5 - target.y;
      group.rotation.y += (ty - group.rotation.y) * 0.05;
      group.rotation.x += (tx - group.rotation.x) * 0.05;
      renderer.render(scene, camera);
    };

    if (reduced) {
      // One settled frame — the coding configuration, no snapping.
      idx = 2;
      setStateIdx(2);
      cur.set(targets[2]);
      posAttr.needsUpdate = true;
      applyMarker();
      group.rotation.set(CONFIGS[2].rot[0] * 0.5, CONFIGS[2].rot[1] * 0.22, 0);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointer);
      ro.disconnect();
      io.disconnect();
      renderer.dispose();
      geometry.dispose();
      materials.forEach((m) => m.dispose());
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={mountRef} aria-hidden="true" className="h-full w-full" />
      {/* The state readout — the snap made legible. Same mono-caps register as the annotations. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[4%] left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-subtle"
      >
        state {stateIdx + 1} of 5 — <span className="text-primary">{STATES[stateIdx]}</span>
      </div>
    </div>
  );
}
