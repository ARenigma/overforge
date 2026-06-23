// TS entrypoint for the Overforge backend.
// REST + outbox drain; no WebSockets in M1.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { interviewsRouter } from './http/interviews';
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

app.use(
  cors({
    origin: frontendUrl,
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
