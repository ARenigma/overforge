// TS entrypoint for the Overforge backend.
// REST + outbox drain; no WebSockets in M1.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { interviewsRouter } from './http/interviews';
import { requireInterviewer, isDevEmail } from './http/middleware';
import { SUPPORTED_LANGUAGES } from './execution/docker';
import { drainOutbox } from './notify/outbox';
import { makeOutboxStore } from './db/interviews';
import { closeStaleInterviews } from './interview/orchestrator';
import { createEmailSender } from './notify/resend';

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

// ─────────────────────── Health ───────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
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

// ─────────────────────── Outbox drain interval ───────────────────────

let drainInterval: ReturnType<typeof setInterval> | null = null;
let sweepInterval: ReturnType<typeof setInterval> | null = null;

function startDrainInterval(): void {
  drainInterval = setInterval(() => {
    drainOutbox(makeOutboxStore(), createEmailSender()).catch((err: unknown) => {
      console.error('[outbox] drain error:', err);
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
    });
  }, 300_000);
  sweepInterval.unref();
}

// ─────────────────────── Startup ───────────────────────

const PORT = Number(process.env.PORT ?? 5000);

const server = app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  startDrainInterval();
  startSweepInterval();
});

// ─────────────────────── Graceful shutdown ───────────────────────

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received — shutting down`);
  if (drainInterval) clearInterval(drainInterval);
  if (sweepInterval) clearInterval(sweepInterval);
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
