'use client';

import { useEffect } from 'react';
import { SENTRY_DSN, SENTRY_ENV } from '@/lib/sentry';

/**
 * Browser-side Sentry init. The framework `instrumentation.ts` hook only covers the Node.js and
 * Edge runtimes; unhandled errors and promise rejections in the BROWSER (the interview room, the
 * WebGL hero, the voice pipeline — where failures actually happen) need a client-side init too.
 *
 * The SDK is dynamically imported inside the effect so it lands in a lazy chunk (not the initial
 * bundle) and never runs during SSR/build. No-op when no DSN is configured. Session replay is
 * explicitly disabled — candidate video/audio/keystrokes are PII we must never capture.
 */
export function SentryInit() {
  useEffect(() => {
    if (!SENTRY_DSN) return;
    let cancelled = false;
    void import('@sentry/nextjs').then((Sentry) => {
      // Don't double-init if the framework hook already started a client on this runtime.
      if (cancelled || Sentry.getClient()) return;
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: SENTRY_ENV,
        tracesSampleRate: 0, // errors only — no perf tracing (keeps volume/cost down)
        replaysSessionSampleRate: 0, // NO session replay — candidate PII
        replaysOnErrorSampleRate: 0,
        sendDefaultPii: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
