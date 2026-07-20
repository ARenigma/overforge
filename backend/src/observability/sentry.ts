// Sentry error-tracking bootstrap.
// initSentry() is a no-op when SENTRY_DSN is unset so the process runs cleanly
// without any Sentry configuration.  setupSentryErrorHandler() must be called
// AFTER all route registrations (Express requires error middleware last).

import * as Sentry from '@sentry/node';
import type { Application } from 'express';

/** True only after initSentry() successfully called Sentry.init() with a real DSN. */
let sentryEnabled = false;

/**
 * Initialise Sentry from environment variables.  Safe to call unconditionally at
 * server startup — if SENTRY_DSN is absent it logs one line and returns immediately.
 *
 * Env vars consumed:
 *   SENTRY_DSN               — required to enable (default: disabled)
 *   SENTRY_TRACES_SAMPLE_RATE — 0–1 fraction of transactions traced (default: 0)
 *   SENTRY_RELEASE           — build/deploy tag forwarded as the Sentry release (optional)
 *   NODE_ENV                 — forwarded as Sentry "environment"
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] disabled — SENTRY_DSN unset');
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? undefined,
    // Never send request bodies — they may contain candidate answers, code, or PII.
    sendDefaultPii: false,
    beforeSend(event) {
      // Belt-and-suspenders: strip the `data` field (parsed request body) even if
      // sendDefaultPii is somehow overridden in a future config change.
      if (event.request) {
        const req = event.request as { data?: unknown };
        req.data = undefined;
      }
      return event;
    },
  });

  sentryEnabled = true;
  console.log(`[sentry] enabled (env=${process.env.NODE_ENV ?? 'development'})`);
}

/**
 * Capture an exception in Sentry.  No-op when Sentry is not enabled so all call
 * sites can call this unconditionally without a DSN configured.
 */
export function captureException(err: unknown): void {
  if (!sentryEnabled) return;
  Sentry.captureException(err);
}

/**
 * Flush pending Sentry events with a timeout.  Used before process exit so
 * uncaught-exception events are not dropped. No-op when Sentry is not enabled.
 */
export function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!sentryEnabled) return Promise.resolve(false);
  return Sentry.flush(timeoutMs);
}

/**
 * Attach the Sentry Express error-capturing middleware.  Must be called AFTER all
 * app.use() / app.get() / app.post() route registrations — Express processes
 * error-handling middleware in declaration order.
 *
 * Becomes a no-op if initSentry() was not called with a valid DSN.
 */
export function setupSentryErrorHandler(app: Application): void {
  if (!sentryEnabled) return;
  Sentry.setupExpressErrorHandler(app);
}
