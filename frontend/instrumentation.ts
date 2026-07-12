// Next.js instrumentation hook — runs once per runtime (Node.js server, Edge)
// before the application handles any request.  This is the correct place to
// initialise side-effectful SDKs like Sentry so they wrap the full request lifecycle.
//
// No-op when no DSN is resolved (see lib/sentry.ts) — `npm run build`, CI, and local dev all work
// with Sentry silent. Browser errors are handled separately by components/sentry-init.tsx; this
// hook covers the Node.js and Edge runtimes only.
//
// Session replay is intentionally not initialised — candidate video/audio is PII.
//
// Enabled via next.config.mjs experimental.instrumentationHook (required for Next.js 14.0.x).

import { SENTRY_DSN, SENTRY_ENV } from '@/lib/sentry';

export async function register(): Promise<void> {
  if (!SENTRY_DSN) return; // no DSN → Sentry stays uninitialised; build and runtime work as normal

  const options = {
    dsn: SENTRY_DSN,
    // Keep trace volume low by default; raise via SENTRY_TRACES_SAMPLE_RATE in production.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    environment: SENTRY_ENV,
    // Never attach request bodies — they may contain candidate answers, code, or PII.
    sendDefaultPii: false,
  };

  // nodejs: full server SDK (server components, API routes, Server Actions).
  // edge: same options, subset of SDK (middleware, edge routes).
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init(options);
  }
}
