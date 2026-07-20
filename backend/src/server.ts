// TS entrypoint for the Overforge backend.
// REST + outbox drain; no WebSockets in M1.

import 'dotenv/config';
import {
  initSentry,
  setupSentryErrorHandler,
  captureException,
  flushSentry,
} from './observability/sentry';

// Sentry must be initialised before any other imports so its instrumentation
// can wrap modules as they are loaded.
initSentry();

import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import { interviewsRouter } from './http/interviews';
import { requireInterviewer, isDevEmail } from './http/middleware';
import { SUPPORTED_LANGUAGES } from './execution/docker';
import { drainOutbox } from './notify/outbox';
import { makeOutboxStore } from './db/interviews';
import { createServiceClient } from './db/supabase';
import { closeStaleInterviews, purgeExpiredData } from './interview/orchestrator';
import { createEmailSender } from './notify/resend';
import { requestLogMiddleware } from './observability/request-log';

const app = express();

// ─────────────────────── Middleware ───────────────────────

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

// Refuse to boot a production process pointed at localhost — that would open CORS to
// localhost instead of the real origin (silent misconfiguration).
if (process.env.NODE_ENV === 'production' && frontendUrl.includes('localhost')) {
  throw new Error('FRONTEND_URL must be the production origin in production (got localhost)');
}

// Email deliverability guard (loud, NOT fatal — a healthy API must not go down over email config).
// Resend rejects free-mail sender domains with HTTP 403, which silently dead-letters every
// scorecard/no-show email. Surface it unmissably at boot instead of discovering it per-interview.
if (process.env.RESEND_API_KEY) {
  const from = process.env.RESEND_FROM ?? '';
  const domain = from.split('@')[1]?.toLowerCase() ?? '';
  const freeMail = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'icloud.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
  ];
  if (!from || freeMail.includes(domain)) {
    console.error(
      `[email] ⚠️  RESEND_FROM="${from || '(unset)'}" uses a free-mail/unset domain — Resend will 403 and ALL result emails will silently fail to send. ` +
        `Set RESEND_FROM to a domain verified in Resend (SPF/DKIM). Results remain visible in the dashboard until fixed.`
    );
  }
}

// Behind Caddy: trust the proxy so req.ip reflects the real client (used for rate limiting).
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Minimal security headers for a JSON API (no helmet dependency required).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});

// Opt-in preview allowance. When CORS_PREVIEW_REGEX is unset (prod default) only FRONTEND_URL is
// allowed — byte-for-byte the previous static behavior. When set, an origin ALSO matching the
// (anchored) regex is allowed, so per-deploy Vercel preview origins can reach this single backend
// during MR E2E. credentials:true is preserved; the candidate token rides in the request body (not
// a cookie), so an allowed preview origin gains no ambient cross-origin secret.
// FORCE-ANCHOR the pattern: RegExp.test matches anywhere in the string, so an unanchored
// `overforge-.*\.vercel\.app` would also match `https://overforge-x.vercel.app.attacker.com`.
// Wrapping in ^(?:…)$ makes a loose env value safe by construction (existing anchors stripped
// first, so an already-anchored pattern is unchanged in meaning).
const previewRe: RegExp | null = process.env.CORS_PREVIEW_REGEX
  ? new RegExp(`^(?:${process.env.CORS_PREVIEW_REGEX.replace(/^\^/, '').replace(/\$$/, '')})$`)
  : null;
if (process.env.NODE_ENV === 'production' && previewRe) {
  console.warn(
    `[cors] CORS_PREVIEW_REGEX is ACTIVE in production: ${previewRe.source} — preview origins may call this backend`
  );
}

app.use(
  cors({
    origin: (origin, cb) => {
      // No Origin header (same-origin, curl, health checks, server-to-server) → allow.
      if (!origin) return cb(null, true);
      if (origin === frontendUrl) return cb(null, true);
      if (previewRe && previewRe.test(origin)) return cb(null, true);
      // Silent-deny: the cors package omits the ACAO header and the browser blocks — matching the
      // old static-origin behavior. Throwing here would surface denied origins as 500s (log noise).
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '2mb' }));

// Structured per-request logging: assigns/echoes x-request-id, logs {reqId,method,path,status,ms}.
// Mounted after JSON parsing so headers are normalised; skips /health (high-frequency, low value).
app.use(requestLogMiddleware);

// ─────────────────────── Health ───────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─────────────────────── Deep health check ───────────────────────
// GET /health/deep — checks DB reachability and Docker socket liveness.
// Cached for 10 s so hammering it cannot DOS the DB or Docker daemon.
// Returns 200 {status:'ok', checks:{db:'ok', docker:'ok'}} or
//         503 {status:'degraded', checks:{db:..., docker:...}} with failing component detail.

interface DeepCheckResult {
  db: string;
  docker: string;
}
interface DeepHealthCache {
  result: DeepCheckResult;
  ts: number;
}
let deepHealthCache: DeepHealthCache | null = null;
const DEEP_HEALTH_CACHE_MS = 10_000;
const DEEP_HEALTH_PROBE_TIMEOUT_MS = 2500;

async function checkDb(): Promise<string> {
  const db = createServiceClient();
  const race = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('DB probe timed out')), DEEP_HEALTH_PROBE_TIMEOUT_MS)
  );
  try {
    await Promise.race([db.from('interviews').select('id').limit(1), race]);
    return 'ok';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function checkDocker(): Promise<string> {
  const race = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('Docker probe timed out')), DEEP_HEALTH_PROBE_TIMEOUT_MS)
  );
  const probe = new Promise<string>((resolve, reject) => {
    execFile('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 2400 }, (err) => {
      if (err) reject(err);
      else resolve('ok');
    });
  });
  try {
    return await Promise.race([probe, race]);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

app.get('/health/deep', async (_req, res) => {
  const now = Date.now();
  if (deepHealthCache && now - deepHealthCache.ts < DEEP_HEALTH_CACHE_MS) {
    const { result } = deepHealthCache;
    const allOk = result.db === 'ok' && result.docker === 'ok';
    res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', checks: result });
    return;
  }

  const [db, docker] = await Promise.all([checkDb(), checkDocker()]);
  const result: DeepCheckResult = { db, docker };
  deepHealthCache = { result, ts: now };
  const allOk = db === 'ok' && docker === 'ok';
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', checks: result });
});

// ─────────────────────── Languages ───────────────────────

app.get('/api/languages', (_req, res) => {
  res.json({ languages: SUPPORTED_LANGUAGES });
});

// ─────────────────────── Current interviewer ───────────────────────
// Whether the signed-in interviewer is a dev account (gates the dev-mode toggle in the UI).

app.get('/api/me', requireInterviewer, (req, res) => {
  res.json({ isDev: isDevEmail(req.userEmail) });
});

// ─────────────────────── Interview routes ───────────────────────

app.use('/api/interviews', interviewsRouter);

// ─────────────────────── 404 fallback ───────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Sentry error handler — must come AFTER all routes and BEFORE any other error middleware.
// Captures unhandled route errors and forwards them to Sentry (no-op if DSN is unset).
setupSentryErrorHandler(app);

// ─────────────────────── Process-level error handlers ───────────────────────

// Unhandled promise rejections: log + capture to Sentry; do NOT exit — a single async hiccup
// (e.g. a failed background DB write) must not take down the server.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
  captureException(reason);
});

// Uncaught synchronous exceptions: capture to Sentry, flush (best-effort), then exit.
// These leave the process in an unknown state so exit(1) is mandatory.
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
  captureException(err);
  flushSentry(2000)
    .catch(() => undefined)
    .finally(() => process.exit(1));
});

// ─────────────────────── Scheduled jobs ───────────────────────

let drainInterval: ReturnType<typeof setInterval> | null = null;
let sweepInterval: ReturnType<typeof setInterval> | null = null;
let purgeTimer: ReturnType<typeof setTimeout> | null = null;
let purgeInterval: ReturnType<typeof setInterval> | null = null;

function startDrainInterval(): void {
  drainInterval = setInterval(() => {
    drainOutbox(makeOutboxStore(), createEmailSender()).catch((err: unknown) => {
      console.error('[outbox] drain error:', err);
      captureException(err);
    });
  }, 60_000);
  // Don't prevent graceful shutdown.
  drainInterval.unref();
}

function startSweepInterval(): void {
  // Close stale interviews so every one reaches the interviewer: a no-show (invited past TTL)
  // gets an "didn't start" notification; a dropout (in_progress past TTL) gets its partial
  // transcript scored. Both land via the existing scorecard email path.
  sweepInterval = setInterval(() => {
    closeStaleInterviews().catch((err: unknown) => {
      console.error('[sweep] close-stale error:', err);
      captureException(err);
    });
  }, 300_000);
  sweepInterval.unref();
}

function startPurgeJob(): void {
  // Gate: set RETENTION_ENABLED=false to disable without a deploy.
  if (process.env.RETENTION_ENABLED === 'false') {
    console.log('[purge] disabled — RETENTION_ENABLED=false');
    return;
  }

  const runPurge = (): void => {
    purgeExpiredData().catch((err: unknown) => {
      console.error('[purge] error:', err);
      captureException(err);
    });
  };

  // Run once ~30 s after boot (gives the process time to fully initialise), then daily.
  purgeTimer = setTimeout(() => {
    purgeTimer = null;
    runPurge();
    purgeInterval = setInterval(runPurge, 24 * 60 * 60 * 1000);
    purgeInterval.unref();
  }, 30_000);
  purgeTimer.unref();
}

// ─────────────────────── Startup ───────────────────────

const PORT = Number(process.env.PORT ?? 5000);

const server = app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  startDrainInterval();
  startSweepInterval();
  startPurgeJob();
});

// ─────────────────────── Graceful shutdown ───────────────────────

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received — shutting down`);
  if (drainInterval) clearInterval(drainInterval);
  if (sweepInterval) clearInterval(sweepInterval);
  if (purgeTimer) clearTimeout(purgeTimer);
  if (purgeInterval) clearInterval(purgeInterval);
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// server.ts intentionally exports nothing — app and all orchestrator functions are accessed
// through their own modules. External tests that need a running Express instance should import
// the router/orchestrator directly, not this entrypoint.
