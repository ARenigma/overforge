'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useTheme } from '@/components/theme-provider';
import { brandAccentCss } from '@/lib/brand';
import { cn } from '@/lib/utils';

type DottedSurfaceProps = Omit<React.ComponentProps<'div'>, 'ref'>;

/**
 * Ambient animated dotted wave (WebGL). Landing-only and lazy-loaded — three.js
 * never enters the app/dashboard bundle. Dots use the brand token (lib/brand.ts),
 * so they track light/dark and any future brand change with zero hardcoded hex.
 * Honors prefers-reduced-motion (renders a single static frame instead of looping).
 */
export function DottedSurface({ className, ...props }: DottedSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const matRef = React.useRef<THREE.PointsMaterial | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SEP = 130;
    const AMOUNT_X = 36;
    const AMOUNT_Y = 48;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      10000
    );
    camera.position.set(0, 355, 1220);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const positions: number[] = [];
    for (let ix = 0; ix < AMOUNT_X; ix++) {
      for (let iy = 0; iy < AMOUNT_Y; iy++) {
        positions.push(ix * SEP - (AMOUNT_X * SEP) / 2, 0, iy * SEP - (AMOUNT_Y * SEP) / 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(brandAccentCss(container)),
      size: 8,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });
    matRef.current = material;

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const pos = geometry.attributes.position.array as Float32Array;
    let count = 0;
    let raf = 0;

    const renderFrame = () => {
      let i = 0;
      for (let ix = 0; ix < AMOUNT_X; ix++) {
        for (let iy = 0; iy < AMOUNT_Y; iy++) {
          pos[i * 3 + 1] = Math.sin((ix + count) * 0.3) * 40 + Math.sin((iy + count) * 0.5) * 40;
          i++;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      count += 0.08;
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      renderFrame();
    };
    if (reduceMotion) renderFrame();
    else loop();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      matRef.current = null;
    };
  }, []);

  // Re-tint to the active theme's --primary without rebuilding the scene.
  React.useEffect(() => {
    if (matRef.current && containerRef.current) {
      matRef.current.color.set(brandAccentCss(containerRef.current));
    }
  }, [resolvedTheme]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0', className)}
      {...props}
    />
  );
}
