// Per-interview in-process mutex for serialising concurrent writes.
//
// ARCHITECTURE NOTE: The backend runs as a SINGLE Node.js process (one container on one VPS —
// see deploy/docker-compose.yml). An in-process promise-chain mutex is therefore a valid
// serialisation primitive for all candidate-facing write paths within that process. If the
// backend ever scales horizontally (multiple replicas behind a load balancer), this mutex MUST
// be replaced with a distributed lock (Redis/Valkey SETNX or a Postgres advisory lock). The
// seam is this module — nothing else needs to change at that point.

/** Per-interview promise-chain tail. Each entry is the "done" promise of the current lock holder;
 *  later callers chain after it. The entry is deleted when the chain drains (the last holder
 *  finds that nobody chained after it) so the Map never accumulates stale entries. */
const locks = new Map<string, Promise<void>>();

/**
 * Run `fn` under a per-interview mutual-exclusion lock, serialising concurrent callers for the
 * same `id`. Callers form a promise chain behind the current holder; the Map entry is deleted
 * once the chain drains so the Map never leaks.
 *
 * Single-process invariant: only correct while the backend runs as one Node.js process.
 * See the module-level comment if horizontal scaling is introduced.
 */
export async function withInterviewLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  // The current tail — we must wait for whoever holds the lock before running fn.
  const prev = locks.get(id) ?? Promise.resolve();

  // Our own "done" resolver — the next caller for the same id will chain after this promise.
  let release!: () => void;
  const done = new Promise<void>((res) => {
    release = res;
  });

  // Claim the tail: subsequent callers for the same id will await `done`.
  locks.set(id, done);

  // Wait for the predecessor, then run the critical section.
  await prev;
  try {
    return await fn();
  } finally {
    release(); // unblock the next waiter (if any)
    // If nobody else chained after us (we're still the tail), the entry is dead weight — remove
    // it so the Map doesn't grow without bound for long-lived interviews.
    if (locks.get(id) === done) {
      locks.delete(id);
    }
  }
}
