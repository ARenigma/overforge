// Lightweight, abstracted rate limiting.
//
// The backend runs as a SINGLE instance today (see deploy/docker-compose.yml), so an
// in-memory fixed-window store is correct and dependency-free. The RateLimitStore
// interface is the seam: when the backend scales horizontally, drop in a Redis/Valkey
// store here and nothing else changes.

export interface RateLimitStore {
  /** Increment the counter for `key` within a `windowMs` window; return the new count. */
  hit(key: string, windowMs: number): Promise<number> | number;
}

/** In-memory fixed-window store. Resets per window; suitable for one process. */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, windowMs: number): number {
    const now = Date.now();
    // Bound memory without a background timer: sweep when the map grows large.
    if (this.buckets.size > 10_000) this.sweep(now);

    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    b.count += 1;
    return b.count;
  }

  private sweep(now: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

const defaultStore: RateLimitStore = new MemoryRateLimitStore();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  message?: string;
}

/**
 * Throws a structured 429 error (with retryAfterSec) if `key` exceeds its limit in the
 * current window. The route's sendError helper maps the status straight through.
 */
export async function enforceRateLimit(
  key: string,
  opts: RateLimitOptions,
  store: RateLimitStore = defaultStore
): Promise<void> {
  const count = await store.hit(key, opts.windowMs);
  if (count > opts.limit) {
    throw Object.assign(new Error(opts.message ?? 'Too many requests. Please slow down.'), {
      status: 429,
      retryAfterSec: Math.ceil(opts.windowMs / 1000),
    });
  }
}
