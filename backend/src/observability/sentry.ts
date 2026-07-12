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
