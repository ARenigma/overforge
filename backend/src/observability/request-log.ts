// Structured request-logging middleware.
// Assigns a request ID (from the x-request-id header or a fresh UUID), echoes it
// back on the response, and logs one JSON line per request on finish.
// Dependency-free — uses only Node's built-in crypto module and Express types.

import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware that:
 *   1. Reads `x-request-id` from the incoming request (or mints a UUID).
 *   2. Echoes the ID back on `x-request-id` response header.
 *   3. On response finish, logs one structured JSON line:
 *      { reqId, method, path, status, ms }
 *
 * Mount early — before route handlers — so all requests are covered.
 * Requests to /health are silently passed through (no ID, no log line).
 */
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Health checks are high-frequency and uninteresting; skip them entirely.
  if (req.path === '/health') {
    next();
    return;
  }

  // Accept a caller-supplied ID (e.g. from an upstream proxy or test harness);
  // fall back to a fresh UUID. The header may arrive as an array if a proxy
  // inadvertently duplicates it — take the first value.
  const rawId = req.headers['x-request-id'];
  const reqId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? randomUUID();

  res.setHeader('x-request-id', reqId);

  const startMs = Date.now();

  res.on('finish', () => {
    console.log(
      JSON.stringify({
        reqId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - startMs,
      })
    );
  });

  next();
}
