// TS entrypoint for the Overforge backend.
// REST + outbox drain; no WebSockets in M1.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { interviewsRouter } from './http/interviews';
import { SUPPORTED_LANGUAGES } from './execution/piston';
import { drainOutbox } from './notify/outbox';
import { makeOutboxStore } from './db/interviews';
import { createEmailSender } from './notify/resend';

const app = express();

// ─────────────────────── Middleware ───────────────────────

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
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

function startDrainInterval(): void {
  drainInterval = setInterval(() => {
    drainOutbox(makeOutboxStore(), createEmailSender()).catch((err: unknown) => {
      console.error('[outbox] drain error:', err);
    });
  }, 60_000);
  // Don't prevent graceful shutdown.
  drainInterval.unref();
}

// ─────────────────────── Startup ───────────────────────

const PORT = Number(process.env.PORT ?? 5000);

const server = app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  startDrainInterval();
});

// ─────────────────────── Graceful shutdown ───────────────────────

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received — shutting down`);
  if (drainInterval) clearInterval(drainInterval);
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
