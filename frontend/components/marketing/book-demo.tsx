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

declare global {
  interface Window {
    Cal?: ((...args: unknown[]) => void) & { loaded?: boolean; ns?: Record<string, unknown> };
  }
}

let loading: Promise<void> | null = null;
function loadCal(): Promise<void> {
  if (window.Cal?.loaded) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    // Official Cal.com embed bootstrap (queues calls until embed.js arrives).
    const w = window as Window;
    const cal = function (...args: unknown[]) {
      (cal.q = cal.q || ([] as unknown[])).push(args);
    } as unknown as NonNullable<Window['Cal']> & { q?: unknown[] };
    w.Cal = w.Cal || cal;
    const s = document.createElement('script');
    s.src = 'https://app.cal.com/embed/embed.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('cal embed failed'));
    document.head.appendChild(s);
    w.Cal('init', { origin: 'https://cal.com' });
  });
  return loading;
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
  const [busy, setBusy] = React.useState(false);
  if (!CAL_LINK) return null;

  const open = async () => {
    setBusy(true);
    try {
      await loadCal();
      window.Cal?.('modal', {
        calLink: CAL_LINK,
        config: { theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' },
      });
    } catch {
      window.open(`https://cal.com/${CAL_LINK}`, '_blank', 'noopener');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-md px-6 font-mono text-[12px] font-medium uppercase tracking-[0.08em] transition-colors duration-fast ease-out-cubic disabled:opacity-60',
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
