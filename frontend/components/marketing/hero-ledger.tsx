'use client';

import * as React from 'react';
import { ProductFrame } from './frame';
import { FsmLedger } from './fsm-ledger';

/* The hero ledger, scroll-scrubbed. Same behaviour as the Anatomy walkthrough: the ledger PINS
 * (position: sticky) while a short track scrolls behind it, and scroll progress reveals the run
 * transition-by-transition (seed → terminal) — the machine plays as you scroll, so no transition is
 * missed. Progress drives FsmLedger in controlled mode; reduced-motion reveals it whole at rest.
 * NOTE: no overflow/transform ancestor may sit above this, or the sticky silently stops sticking. */
export function HeroLedger() {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1); // reveal the whole run at rest
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const dist = track.offsetHeight - window.innerHeight; // distance the ledger stays pinned
      const p = dist > 0 ? Math.min(Math.max(-track.getBoundingClientRect().top / dist, 0), 1) : 0;
      setProgress(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={trackRef} className="relative" style={{ height: 'calc(65vh + 100vh)' }}>
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto w-full max-w-7xl px-6 sm:px-8">
          <ProductFrame>
            <FsmLedger progress={progress} />
          </ProductFrame>
        </div>
      </div>
    </div>
  );
}
