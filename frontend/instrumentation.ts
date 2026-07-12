// Next.js instrumentation hook — runs once per runtime (Node.js server, Edge)
// before the application handles any request.  This is the correct place to
// initialise side-effectful SDKs like Sentry so they wrap the full request lifecycle.
//
// The entire function is a no-op when NEXT_PUBLIC_SENTRY_DSN is unset, which means
// `npm run build` and runtime work correctly with no DSN configured (CI, local dev).
//
// Session replay is intentionally not initialised — candidate video/audio is PII.
//
// Enabled via next.config.mjs experimental.instrumentationHook (required for Next.js 14.0.x).

export async function register(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // no DSN → Sentry stays uninitialised; build and runtime work as normal

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Full Node.js SDK for server components, API routes, and Server Actions.
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      // Keep trace volume low by default; raise via SENTRY_TRACES_SAMPLE_RATE in production.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      environment: process.env.NODE_ENV ?? 'production',
      // Never attach request bodies — they may contain candidate answers, code, or PII.
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime (middleware, edge API routes): same init options, subset of SDK.
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      environment: process.env.NODE_ENV ?? 'production',
      sendDefaultPii: false,
    });
  }
}
