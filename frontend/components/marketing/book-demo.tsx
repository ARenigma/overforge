'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* Book-a-demo via Cal.com (the open-source scheduler — on-brand for the auditable-vs-black-box
 * pitch). ZERO scheduler JS on the critical path: the embed script loads only on first click,
 * then opens the popup; if it fails, we fall back to opening cal.com directly. The whole feature
 * is env-gated on NEXT_PUBLIC_CAL_LINK (e.g. "amit/finite-pilot") — unset renders nothing. */

// Accept either the bare path ("finite" / "team/finite/pilot") or a full https://cal.com/… URL —
// whichever form the env was set with, the embed needs only the path.
const CAL_LINK = (process.env.NEXT_PUBLIC_CAL_LINK ?? '')
  .replace(/^https?:\/\/(www\.)?cal\.com\//i, '')
  .replace(/^\/+|\/+$/g, '');

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Cal?: any;
  }
}

// Cal.com's OFFICIAL embed bootstrap, verbatim. Our earlier hand-rolled shim skipped the `loaded`
// flag + `ns` namespace map that embed.js reads on arrival, so the real script threw (an opaque
// cross-origin "Script error.") and the modal span forever. This is the exact queue embed.js expects.
function ensureCalLoaded() {
  const C = window as any;
  if (C.Cal) return;
  const A = 'https://app.cal.com/embed/embed.js';
  const L = 'init';
  const d = C.document;
  const p = (a: any, ar: any) => a.q.push(ar);
  C.Cal = function (...ar: any[]) {
    const cal = C.Cal;
    if (!cal.loaded) {
      cal.ns = {};
      cal.q = cal.q || [];
      d.head.appendChild(d.createElement('script')).src = A;
      cal.loaded = true;
    }
    if (ar[0] === L) {
      const api: any = function (...a: any[]) {
        p(api, a);
      };
      const namespace = ar[1];
      api.q = api.q || [];
      if (typeof namespace === 'string') {
        cal.ns[namespace] = cal.ns[namespace] || api;
        p(cal.ns[namespace], ar);
        p(cal, ['initNamespace', namespace]);
      } else p(cal, ar);
      return;
    }
    p(cal, ar);
  };
}

export function BookDemo({
  children = 'Book a pilot',
  className,
  variant = 'outline',
}: {
  children?: React.ReactNode;
  className?: string;
  variant?: 'outline' | 'ghost';
}) {
  if (!CAL_LINK) return null;

  const open = () => {
    try {
      ensureCalLoaded();
      // init is idempotent; embed.js replays the queue in order once it loads.
      window.Cal('init', { origin: 'https://cal.com' });
      window.Cal('modal', {
        calLink: CAL_LINK,
        config: { theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' },
      });
    } catch {
      // Bulletproof fallback: Cal's hosted booking page in a new tab.
      window.open(`https://cal.com/${CAL_LINK}`, '_blank', 'noopener');
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-md px-6 font-mono text-[12px] font-medium uppercase tracking-[0.08em] transition-colors duration-fast ease-out-cubic',
        variant === 'outline'
          ? 'border border-border text-foreground hover:bg-accent'
          : 'text-foreground-subtle hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}
