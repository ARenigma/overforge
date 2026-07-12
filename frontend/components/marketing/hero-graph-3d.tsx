'use client';

import * as React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* The hero 3D system — the STATE TURBINE. Five machined rings on one axis, one per interview
 * state (invite → oral → coding → score → end, top to bottom); the active ring is lit ultramarine.
 * The rotor never spins freely: every few seconds it CLICKS 72° to the next detent with a spring
 * settle, and the light steps to the next ring. Each ring is a PENTAGONAL torus (5 flat facets),
 * so one click advances exactly one facet — the five-states motif machined into the geometry.
 * Glossy metal needs an environment; colors read from brand tokens so it tracks both themes. */

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

// The rotor: ring radius + height per state, tapered like a turbine stage stack.
const RINGS: ReadonlyArray<{ R: number; y: number }> = [
  { R: 1.28, y: 1.3 },
  { R: 1.54, y: 0.65 },
  { R: 1.7, y: 0 },
  { R: 1.54, y: -0.65 },
  { R: 1.28, y: -1.3 },
];

const CLICK_EVERY_MS = 3000;
const CLICK_MS = 520;
const STEP = (Math.PI * 2) / 5; // 72° — one facet of the pentagonal ring per click

// easeOutBack — fast attack, slight overshoot, decisive settle: the detent CLICK.
function clickEase(u: number): number {
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 8.2);

    // Studio environment — the machined-metal gloss.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const primary = tokenColor('--primary', 'hsl(226, 100%, 62%)');
    const steel = tokenColor('--foreground-ghost', 'hsl(0, 0%, 40%)');

    const group = new THREE.Group();
    group.rotation.x = 0.42; // tilt the stack so the rings read as a 3D rotor
    scene.add(group);

    // ── The rings — pentagonal tori (5 tubular segments = 5 flat facets), machined metal. ──
    const ringMats: THREE.MeshPhysicalMaterial[] = [];
    const rings: THREE.Mesh[] = [];
    RINGS.forEach(({ R, y }, i) => {
      const geo = new THREE.TorusGeometry(R, 0.055, 12, 5);
      const mat = new THREE.MeshPhysicalMaterial({
        color: steel.clone(),
        metalness: 0.75,
        roughness: 0.28,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        flatShading: true,
      });
      ringMats.push(mat);
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2; // lay the ring flat on the axis
      ring.rotation.z = i * 0.22; // stagger the facets per stage, turbine-blade style
      ring.position.y = y;
      rings.push(ring);
      group.add(ring);

      // A detent bead per ring — makes the 72° click legible as the beads sweep.
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 20, 20),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#ededed'),
          metalness: 0.2,
          roughness: 0.15,
          clearcoat: 1,
        })
      );
      bead.position.set(R, 0.09, 0);
      ring.add(bead); // parented to the ring so the stagger + rotor click carry it
    });

    // ── The axis — a thin machined shaft through the stack. ──
    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 3.5, 24),
      new THREE.MeshPhysicalMaterial({
        color: steel.clone().multiplyScalar(0.8),
        metalness: 0.85,
        roughness: 0.3,
      })
    );
    group.add(axis);

    // ── Lights — soft key + a brand rim so the active ring's emissive lifts. ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(primary.getHex(), 0.9);
    rim.position.set(-4, -1, 2);
    scene.add(rim);

    // The active ring lights ultramarine; the rest are steel.
    const setActive = (i: number) => {
      ringMats.forEach((m, j) => {
        const active = j === i;
        m.color.copy(active ? primary.clone() : steel.clone());
        m.emissive.copy(active ? primary.clone().multiplyScalar(0.45) : new THREE.Color(0));
        m.metalness = active ? 0.4 : 0.75;
        rings[j].scale.setScalar(active ? 1.05 : 1);
      });
    };
    setActive(0);

    // Pointer parallax — the rotor tilts gently toward the cursor (lerped, never jumpy).
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.35;
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

    // Click machinery: discrete detents; one in-flight click at a time.
    let idx = 0;
    let lastClick = 0;
    let clickStart: number | null = null;
    let fromRot = 0;
    let toRot = 0;
    let rotorY = 0;
    let raf = 0;
    const clock = new THREE.Clock();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      const elapsed = clock.getElapsedTime() * 1000;

      if (clickStart === null && elapsed - lastClick > CLICK_EVERY_MS) {
        idx = (idx + 1) % STATES.length;
        setStateIdx(idx);
        setActive(idx);
        fromRot = rotorY;
        toRot = rotorY + STEP;
        clickStart = elapsed;
      }
      if (clickStart !== null) {
        const u = Math.min(1, (elapsed - clickStart) / CLICK_MS);
        rotorY = fromRot + (toRot - fromRot) * clickEase(u);
        if (u >= 1) {
          rotorY = toRot;
          clickStart = null;
          lastClick = elapsed;
        }
      }

      // The detent rotation + pointer parallax; NO free spin between clicks (deterministic).
      group.rotation.y = rotorY + target.x;
      group.rotation.x += (0.42 - target.y - group.rotation.x) * 0.05;
      renderer.render(scene, camera);
    };

    if (reduced) {
      // One settled frame — the coding stage lit, rotor at rest.
      idx = 2;
      setStateIdx(2);
      setActive(2);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointer);
      ro.disconnect();
      io.disconnect();
      pmrem.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose();
        }
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={mountRef} aria-hidden="true" className="h-full w-full" />
      {/* The state readout — the click made legible. Same mono-caps register as the annotations. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[4%] left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground-subtle"
      >
        state {stateIdx + 1} of 5 — <span className="text-primary">{STATES[stateIdx]}</span>
      </div>
    </div>
  );
}
