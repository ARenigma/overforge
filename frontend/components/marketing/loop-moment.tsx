'use client';

import * as React from 'react';

/* The loop moment — the clipped-infinity mark at architectural scale behind the closing bookend.
 * Renders only when scrolled into view, draws its stroke ONCE (≤900ms, the motion ceiling), the
 * terminal dot lands, and everything stops. Whisper opacity — texture, not decoration. */

export function LoopMoment() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShow(true); // static — already settled
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
    >
      {show && (
        <svg
          viewBox="0 0 24 24"
          className="finite-mark h-[520px] w-[520px] opacity-[0.06] sm:h-[680px] sm:w-[680px]"
          fill="none"
        >
          <path
            d="M 12 12 C 9.6 8.4 4.2 8.4 4.2 12 C 4.2 15.6 9.6 15.6 12 12 C 13.8 9.3 16.8 8.1 18.6 9.3"
            pathLength={1}
            stroke="hsl(var(--primary))"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <circle cx="19.9" cy="10.6" r="0.9" fill="hsl(var(--primary))" />
        </svg>
      )}
    </div>
  );
}
