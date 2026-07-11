'use client';

import * as React from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* The hero 3D system — the finite-state machine, rendered. A translucent glass loop (the brand's
 * clipped loop) holds a deterministic PATH of glossy state nodes; a bright pulse walks the path and
 * SETTLES into the accepting node (the "settle, don't float" law in 3D), then replays. Real WebGL,
 * lazy-loaded off the critical path, capability-gated by the wrapper. Colors read from brand tokens
 * so it tracks light/dark. together.ai's glossy hero centerpiece, told in our own iconography. */

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

// The FSM path in 3D — a gentle S through depth so nodes read fore/aft (together.ai's fan of shapes
// across the center-right). Last point is the accepting state.
const PATH: [number, number, number][] = [
  [-1.95, -0.35, 0.7],
  [-0.95, 0.72, -0.55],
  [0.12, -0.25, 0.5],
  [1.15, 0.58, -0.45],
  [2.0, -0.05, 0.35],
];

export default function HeroGraph3D({ className }: { className?: string }) {
  const mountRef = React.useRef<HTMLDivElement>(null);

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
    camera.position.set(0, 0, 8.4);

    // Studio environment for real reflections on glass + clearcoat (the together.ai gloss).
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const primary = tokenColor('--primary', 'hsl(226, 100%, 62%)');
    const neutral = tokenColor('--muted-foreground', 'hsl(230, 12%, 60%)');

    const group = new THREE.Group();
    scene.add(group);

    // ── The loop — the brand's clipped loop as a polished chrome-blue ring encircling the path
    //    (transmission glass reads as a flat gray saucer on a dark canvas; a glossy metallic ring
    //    catches the studio environment and stays legibly blue in both themes). ──
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.055, 40, 200),
      new THREE.MeshPhysicalMaterial({
        color: primary.clone().multiplyScalar(0.85),
        metalness: 0.65,
        roughness: 0.15,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      })
    );
    ring.rotation.set(1.12, 0.5, 0.18);
    group.add(ring);

    // ── The deterministic path — a thin tube through the state nodes. ──
    const curve = new THREE.CatmullRomCurve3(PATH.map((p) => new THREE.Vector3(...p)));
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 160, 0.016, 12, false),
      new THREE.MeshStandardMaterial({
        color: neutral,
        emissive: primary.clone().multiplyScalar(0.15),
        metalness: 0.3,
        roughness: 0.4,
        transparent: true,
        opacity: 0.55,
      })
    );
    group.add(tube);

    // ── State nodes — glossy clearcoat spheres; the accepting node is brand primary + a halo. ──
    const nodeGeo = new THREE.SphereGeometry(0.2, 48, 48);
    PATH.forEach((p, i) => {
      const accepting = i === PATH.length - 1;
      const mat = new THREE.MeshPhysicalMaterial({
        color: accepting ? primary.clone() : new THREE.Color('#ededed'),
        emissive: accepting
          ? primary.clone().multiplyScalar(0.5)
          : primary.clone().multiplyScalar(0.04),
        metalness: accepting ? 0.1 : 0.15,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      });
      const node = new THREE.Mesh(nodeGeo, mat);
      node.scale.setScalar(accepting ? 1.25 : 0.78 + (i % 2) * 0.16);
      node.position.set(...p);
      group.add(node);

      if (accepting) {
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.34, 0.018, 24, 96),
          new THREE.MeshBasicMaterial({ color: primary.clone(), transparent: true, opacity: 0.7 })
        );
        halo.position.set(...p);
        halo.lookAt(camera.position);
        group.add(halo);
      }
    });

    // ── The pulse — a bright emissive dot that walks the path with a traveling light. ──
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 24, 24),
      new THREE.MeshBasicMaterial({ color: primary.clone() })
    );
    group.add(pulse);
    const pulseLight = new THREE.PointLight(primary.getHex(), 6, 4, 2);
    group.add(pulseLight);

    // ── Lights — a soft key + a brand-tinted rim to lift the emissive path. ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(primary.getHex(), 1.1);
    rim.position.set(-4, -1, 2);
    scene.add(rim);

    // ── Pointer parallax — the group tilts gently toward the cursor (lerped, never jumpy). ──
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

    // Pulse timeline: walk 0→1 (~3.4s), flare + hold on the accepting node, fade, replay.
    const WALK_MS = 3400;
    const HOLD_MS = 1400;
    let t0 = 0;
    let raf = 0;
    const clock = new THREE.Clock();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      const elapsed = clock.getElapsedTime() * 1000;
      if (!t0) t0 = elapsed;
      const cycle = (elapsed - t0) % (WALK_MS + HOLD_MS);
      const walking = cycle < WALK_MS;
      const t = walking ? cycle / WALK_MS : 1;
      const pt = curve.getPointAt(Math.min(t, 1));
      pulse.position.copy(pt);
      pulseLight.position.copy(pt);
      // Flare the pulse as it settles, dim it during the hold.
      const held = walking ? 1 : 1 - (cycle - WALK_MS) / HOLD_MS;
      pulseLight.intensity = 3 + held * 5;
      (pulse.material as THREE.MeshBasicMaterial).opacity = 0.5 + held * 0.5;

      // Gentle continuous drift + pointer parallax (lerped).
      group.rotation.y += (target.x - (group.rotation.y - Math.sin(elapsed / 4200) * 0.18)) * 0.02;
      group.rotation.x += (-target.y - group.rotation.x) * 0.04;
      renderer.render(scene, camera);
    };

    if (reduced) {
      // One settled frame — pulse resting on the accepting node.
      pulse.position.copy(curve.getPointAt(1));
      pulseLight.position.copy(curve.getPointAt(1));
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

  return <div ref={mountRef} aria-hidden="true" className={className} />;
}
