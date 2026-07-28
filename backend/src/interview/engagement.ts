// Per-interview engagement engine — P1 shadow mode (log only, no behavior change).
//
// Computes code-stream features from /snapshot writes and run events, classifies the
// candidate's engagement state, and persists every state TRANSITION as an
// `interview_events` row for audit + scorecard substrate (§6.6). In P1, this logging
// is the only output — no interviewer behavior is changed.
//
// Ring buffer discipline: single-process in-memory state, same as lock.ts. A cold
// restart loses the buffer; the engine falls back to today's (no-engagement) behavior
// and rebuilds from live events on the next snapshot/run.
//
// §6.5 EVIDENCE RULES enforced here:
//   - No state above THINKING without server-executed evidence (failing runs).
//   - DEGRADING by stall requires negative snapshot evidence, never time alone.
//   - WHEEL_SPINNING requires unchanged failure sig AND non-trivial (non-print) diffs.
//   - Quiescence floor ≥ 90 s, per-interview jitter band 90–150 s (§6.7).

import { appendEvent } from '../db/interviews';
import { captureException } from '../observability/sentry';
import { ObserverNote } from './types';

// ─────────────────────── Public types ───────────────────────

export type EngagementClassification =
  | 'FLOWING'
  | 'THINKING'
  | 'STRUGGLING_PRODUCTIVE'
  | 'DEGRADING'
  | 'WHEEL_SPINNING'
  | 'NEARLY_DONE';

/** Aggregate features fed to the classifier. Exported for unit tests. */
export interface EngagementFeatures {
  /** Net bytes added across recent snapshot diffs (3-min window). */
  recentBytesAdded: number;
  /** Net bytes deleted across recent snapshot diffs (3-min window). */
  recentBytesDeleted: number;
  /** Total lines touched (added + deleted) across recent diffs. */
  recentLinesTouched: number;
  /** A recent snapshot showed a deletion burst (>30 % of content removed in one window). */
  hasRecentDeletionBurst: boolean;
  /** A recent snapshot showed churn (edits without net growth). */
  hasRecentChurn: boolean;
  /** Ms since the last snapshot or run (quiescence clock). 0 when no activity yet. */
  quiescentSinceMs: number;
  /** Code-run count in the last 5 minutes (WHEEL_SPINNING detection). */
  recentRunCount: number;
  /** Trailing consecutive failing runs on this coding question. */
  consecutiveFailures: number;
  /** Last ≥2 failing runs share the identical failure signature (stagnation). */
  sameFailureSig: boolean;
  /**
   * TRUE when every comparable (has a prior baseline) recent run diff consists
   * exclusively of print/log statements — printf-debugging, which is legitimate (§6.5).
   * FALSE when at least one diff has non-trivial code changes.
   */
  onlyTrivialDiffs: boolean;
  /** Last run passed ≥ total−1 hidden tests with total > 0 and still failing something. */
  nearlyDone: boolean;
  /** At least one real (non-Idle) run recorded this question. */
  hasRunEvidence: boolean;
}

// ─────────────────────── Internal entry types ───────────────────────

interface SnapshotEntry {
  kind: 'snapshot';
  seq: number;
  codeIndex: number;
  ts: number;
  bytesAdded: number;
  bytesDeleted: number;
  linesTouched: number;
  deletionBurst: boolean;
  churn: boolean;
  /** Capped-content lines — serves as the basis for the next diff. */
  lineHashes: string[];
  totalBytes: number;
}

interface RunEntry {
  kind: 'run';
  codeIndex: number;
  ts: number;
  runStatus: string;
  /** null when the run passed all tests (or no tests). */
  failureSig: string | null;
  passed: number;
  total: number;
  /**
   * TRUE when at least one non-print/log line changed relative to the previous
   * run's code. FALSE when the diff is only print/log lines (printf-debugging).
   * Only meaningful when `hadPriorBaseline` is true.
   */
  hasNonTrivialChanges: boolean;
  /** FALSE for the very first run when no prior snapshot/run exists to diff against. */
  hadPriorBaseline: boolean;
  lineHashes: string[];
  totalBytes: number;
}

/** An observer-note entry produced by the off-path LLM call (§6.4). Stored in the ring buffer
 *  alongside snapshot and run entries; only the most recent N are injected into wording. */
interface NoteEntry {
  kind: 'note';
  codeIndex: number;
  ts: number;
  seq: number;
  approach: string;
  transition: string;
  diagnosis: string;
}

type EngagementEntry = SnapshotEntry | RunEntry | NoteEntry;

interface EngagementBuffer {
  entries: EngagementEntry[];
  /** Last accepted client snapshot seq. -1 = none yet. */
  lastSeq: number;
  lastState: EngagementClassification | null;
  /** Per-interview jitter-derived quiescence threshold (ms), seeded from interviewId. */
  quiescenceThresholdMs: number;
  /** Per-interview jitter-derived cross-path intervention cooldown (ms), seeded from interviewId.
   *  No unprompted intervention (Path A/B/C) fires within this window of the previous one. */
  cooldownThresholdMs: number;
  /** Timestamp of the last fired intervention (any path). 0 = never. */
  lastInterventionTs: number;
  createdAt: number;
  /** True once a structural milestone (function/loop/data-structure) has been detected for the
   *  current codeIndex. Used to fire the milestone probe exactly once per coding problem. Reset
   *  to false on codeIndex change (same discipline as the feature stream hard-reset). */
  milestoneCrossed: boolean;
}

// ─────────────────────── Constants ───────────────────────

/** Ring-buffer capacity. 200 entries × ~10 numbers ≈ trivial memory. */
const RING_CAP = 200;
/** Content cap per §6.4: features computed on at most this many bytes. */
const CONTENT_CAP = 16 * 1024;
/** Abandoned-buffer TTL: 75 min (covers the 60-min interview cap + grace). */
const BUFFER_TTL_MS = 75 * 60_000;
/** Rapid-run window for WHEEL_SPINNING detection. */
const WHEEL_WINDOW_MS = 5 * 60_000;
/** Snapshot-signal aggregation window. */
const FEATURE_WINDOW_MS = 3 * 60_000;

// ─────────────────────── Registry ───────────────────────

const buffers = new Map<string, EngagementBuffer>();

// ─────────────────────── Jitter (§6.7) ───────────────────────

/** Deterministic djb2-variant hash of `id` → unsigned 32-bit integer. */
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = (((h << 5) + h) ^ id.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Per-interview jitter thresholds seeded deterministically so replays reproduce the same values
 * (§6.7). Quiescence band: 90–150 s. Cross-path cooldown band: 120–180 s (2–3 min, different
 * hash bits so the two thresholds are independent).
 */
export function deriveThresholds(interviewId: string): {
  quiescenceThresholdMs: number;
  cooldownThresholdMs: number;
} {
  const h = hashId(interviewId);
  const jitterMs = h % 60_001; // 0..60 000 ms → quiescence 90–150 s
  const cooldownJitter = (h >>> 16) % 60_001; // high bits → cooldown 120–180 s
  return {
    quiescenceThresholdMs: 90_000 + jitterMs,
    cooldownThresholdMs: 120_000 + cooldownJitter,
  };
}

// ─────────────────────── Buffer helpers ───────────────────────

function getOrCreate(interviewId: string): EngagementBuffer {
  const existing = buffers.get(interviewId);
  if (existing) return existing;
  const { quiescenceThresholdMs, cooldownThresholdMs } = deriveThresholds(interviewId);
  const buf: EngagementBuffer = {
    entries: [],
    lastSeq: -1,
    lastState: null,
    quiescenceThresholdMs,
    cooldownThresholdMs,
    lastInterventionTs: 0,
    createdAt: Date.now(),
    milestoneCrossed: false,
  };
  buffers.set(interviewId, buf);
  return buf;
}

/**
 * TTL sweep piggybacked on access (§6.6 discipline). Returns true when the
 * buffer was evicted (caller should treat as cold-start and accept the event).
 */
function sweepIfStale(interviewId: string, buf: EngagementBuffer, now: number): boolean {
  if (now - buf.createdAt > BUFFER_TTL_MS) {
    buffers.delete(interviewId);
    return true;
  }
  // Enforce ring cap.
  while (buf.entries.length > RING_CAP) buf.entries.shift();
  return false;
}

// ─────────────────────── Structural milestone detection ───────────────────────

/**
 * True when the candidate's code contains at least one complete structural element: a function
 * definition, a loop, or a major data structure (hash map / set). Used to detect the "crossed
 * from planning to implementation" milestone for the proactive code-anchored probe.
 *
 * Mirrors the anchor heuristics in oracle.ts `codeAnchoredProbe` — same signals, pure function.
 * Returns false for short or blank code (< 30 chars) to avoid false positives on skeletons.
 */
export function hasMilestoneStructure(code: string): boolean {
  const src = code.trim();
  if (src.length < 30) return false;
  // Function / method definition (Python def, JS/TS function, Go func, Rust fn)
  if (/\b(?:def|function|func|fn)\s+\w+/.test(src)) return true;
  // Any for/while loop
  if (/\b(for|while)\b/.test(src)) return true;
  // Hash map / dictionary usage
  if (/(\bdict\(|defaultdict\b|new Map\b|HashMap\b|\{[^}\n]*:[^}\n]*\})/.test(src)) return true;
  // Set usage
  if (/(\bset\(\)|new Set\b|HashSet\b)/.test(src)) return true;
  return false;
}

// ─────────────────────── Line-hash diff (O(lines), §6.4) ───────────────────────

/**
 * Split code (capped at CONTENT_CAP) into lines. Using the line string itself as the
 * "hash" is idiomatic for line-level multiset diffing — two identical lines are the same.
 */
export function contentLines(code: string): string[] {
  const capped = code.length > CONTENT_CAP ? code.slice(0, CONTENT_CAP) : code;
  return capped.split('\n');
}

/** O(lines) multiset diff — byte/line deltas between two line arrays. */
export function lineHashDiff(
  prev: string[],
  next: string[]
): { bytesAdded: number; bytesDeleted: number; linesTouched: number } {
  const prevCounts = new Map<string, number>();
  for (const line of prev) prevCounts.set(line, (prevCounts.get(line) ?? 0) + 1);

  const nextCounts = new Map<string, number>();
  for (const line of next) nextCounts.set(line, (nextCounts.get(line) ?? 0) + 1);

  let bytesAdded = 0;
  let bytesDeleted = 0;
  let linesTouched = 0;

  for (const [line, nc] of nextCounts) {
    const added = Math.max(0, nc - (prevCounts.get(line) ?? 0));
    if (added > 0) {
      bytesAdded += added * (line.length + 1); // +1 for newline
      linesTouched += added;
    }
  }
  for (const [line, pc] of prevCounts) {
    const deleted = Math.max(0, pc - (nextCounts.get(line) ?? 0));
    if (deleted > 0) {
      bytesDeleted += deleted * (line.length + 1);
      linesTouched += deleted;
    }
  }

  return { bytesAdded, bytesDeleted, linesTouched };
}

// ─────────────────────── Print/log line detection (§6.5) ───────────────────────

const PRINT_RE =
  /^\s*(print\b|console\.(log|error|warn|info|debug)\b|System\.out\.(println|print)\b|printf\b|fprintf\b|fmt\.(Println|Printf|Print)\b|log\.(Println|Printf|Print)\b|puts\b)/;

/** True when `line` is exclusively a debugging print/log statement. */
export function isPrintLine(line: string): boolean {
  return PRINT_RE.test(line);
}

/**
 * True when every changed line (added or deleted) between `prev` and `next` is a
 * print/log statement — printf-debugging is legitimate and must not trigger
 * WHEEL_SPINNING (§6.5). Returns false when there are no changes at all.
 */
export function onlyPrintLinesChanged(prev: string[], next: string[]): boolean {
  const prevCounts = new Map<string, number>();
  for (const line of prev) prevCounts.set(line, (prevCounts.get(line) ?? 0) + 1);
  const nextCounts = new Map<string, number>();
  for (const line of next) nextCounts.set(line, (nextCounts.get(line) ?? 0) + 1);

  let anyChange = false;
  for (const [line, nc] of nextCounts) {
    const added = nc - (prevCounts.get(line) ?? 0);
    if (added > 0) {
      anyChange = true;
      if (!isPrintLine(line)) return false;
    }
  }
  for (const [line, pc] of prevCounts) {
    const deleted = pc - (nextCounts.get(line) ?? 0);
    if (deleted > 0) {
      anyChange = true;
      if (!isPrintLine(line)) return false;
    }
  }
  return anyChange; // false when no changes at all — not "only print", just empty diff
}

// ─────────────────────── Feature extraction ───────────────────────

/**
 * Aggregate features from a codeIndex-scoped entry slice. Pure: does not read the
 * ring buffer directly — the caller passes the filtered entries.
 */
export function extractFeatures(entries: EngagementEntry[], now: number): EngagementFeatures {
  const windowStart = now - FEATURE_WINDOW_MS;
  const wheelStart = now - WHEEL_WINDOW_MS;

  // ── Snapshot features ──
  let recentBytesAdded = 0;
  let recentBytesDeleted = 0;
  let recentLinesTouched = 0;
  let hasRecentDeletionBurst = false;
  let hasRecentChurn = false;
  let lastActivityTs = 0;

  for (const e of entries) {
    if (e.ts > lastActivityTs) lastActivityTs = e.ts;
    if (e.kind !== 'snapshot') continue;
    if (e.ts < windowStart) continue;
    recentBytesAdded += e.bytesAdded;
    recentBytesDeleted += e.bytesDeleted;
    recentLinesTouched += e.linesTouched;
    if (e.deletionBurst) hasRecentDeletionBurst = true;
    if (e.churn) hasRecentChurn = true;
  }

  const quiescentSinceMs = lastActivityTs > 0 ? now - lastActivityTs : 0;

  // ── Run features ──
  const allRunEntries = entries.filter((e): e is RunEntry => e.kind === 'run');
  const recentRunEntries = allRunEntries.filter((e) => e.ts >= wheelStart);
  const recentRunCount = recentRunEntries.length;

  // Trailing consecutive failures.
  let consecutiveFailures = 0;
  for (let i = allRunEntries.length - 1; i >= 0; i--) {
    if (allRunEntries[i].failureSig === null) break;
    consecutiveFailures++;
  }

  // Stagnation: last ≥2 failing runs share the same failure signature.
  let sameFailureSig = false;
  if (consecutiveFailures >= 2 && allRunEntries.length >= 2) {
    const last = allRunEntries[allRunEntries.length - 1];
    const prev = allRunEntries[allRunEntries.length - 2];
    if (last.failureSig !== null && last.failureSig === prev.failureSig) {
      sameFailureSig = true;
    }
  }

  // Trivial-diff check (§6.5 printf-debugging carve-out).
  // Only runs with a prior baseline are included — the very first run has nothing to
  // diff against and must not skew the triviality verdict.
  const comparableRecent = recentRunEntries.filter((e) => e.hadPriorBaseline);
  const onlyTrivialDiffs =
    recentRunCount >= 4 &&
    comparableRecent.length > 0 &&
    comparableRecent.every((e) => !e.hasNonTrivialChanges);

  // Nearly done: last run passed all but ≤1 hidden test (and has tests).
  const lastRun = allRunEntries[allRunEntries.length - 1];
  const nearlyDone =
    !!lastRun &&
    lastRun.total > 0 &&
    lastRun.failureSig !== null &&
    lastRun.passed >= lastRun.total - 1;

  return {
    recentBytesAdded,
    recentBytesDeleted,
    recentLinesTouched,
    hasRecentDeletionBurst,
    hasRecentChurn,
    quiescentSinceMs,
    recentRunCount,
    consecutiveFailures,
    sameFailureSig,
    onlyTrivialDiffs,
    nearlyDone,
    hasRunEvidence: allRunEntries.length > 0,
  };
}

// ─────────────────────── Classifier (pure, §6.5 evidence rules) ───────────────────────

/**
 * Pure engagement classifier implementing the §6.5 evidence rules.
 *
 * Key invariants:
 *   - No state above THINKING without server-executed evidence (failing runs).
 *   - DEGRADING requires negative snapshot evidence (churn/deletion burst); stall alone never suffices.
 *   - WHEEL_SPINNING requires same failure sig AND diffs that aren't only print/log lines.
 */
export function classifyEngagement(
  features: EngagementFeatures,
  thresholds: { quiescenceThresholdMs: number }
): EngagementClassification {
  // NEARLY_DONE: server-verified near-complete pass rate.
  if (features.nearlyDone) return 'NEARLY_DONE';

  // WHEEL_SPINNING: rapid failing runs + unchanged sig + non-trivial diffs (§6.5).
  // `onlyTrivialDiffs = true` → printf-debugging → NOT wheel-spinning.
  // `onlyTrivialDiffs = false` → at least one real code change → potentially spinning.
  if (features.recentRunCount >= 4 && features.sameFailureSig && !features.onlyTrivialDiffs) {
    return 'WHEEL_SPINNING';
  }

  // DEGRADING: requires BOTH server-executed evidence AND negative snapshot evidence (§6.5).
  // Elapsed time alone never escalates (§6.5 fatal fix).
  const hasServerEvidence = features.hasRunEvidence && features.consecutiveFailures >= 2;
  const hasNegativeSnapshot = features.hasRecentDeletionBurst || features.hasRecentChurn;
  if (
    hasServerEvidence &&
    (features.sameFailureSig ||
      (hasNegativeSnapshot && features.quiescentSinceMs >= thresholds.quiescenceThresholdMs))
  ) {
    return 'DEGRADING';
  }

  // STRUGGLING_PRODUCTIVE: failing but with varied attempts (signal-rich zone).
  if (features.hasRunEvidence && features.consecutiveFailures >= 1 && !features.sameFailureSig) {
    return 'STRUGGLING_PRODUCTIVE';
  }

  // FLOWING: net code growth, no negative snapshot signals.
  if (
    features.recentBytesAdded > features.recentBytesDeleted &&
    !features.hasRecentDeletionBurst &&
    !features.hasRecentChurn
  ) {
    return 'FLOWING';
  }

  // THINKING: default — quiet, early planning, or insufficient data yet.
  return 'THINKING';
}

// ─────────────────────── Shadow mode gate ───────────────────────

/**
 * Whether the engagement engine is active. Default ON (unset = on) — it only logs
 * in P1 shadow mode. Set ENGAGEMENT_SHADOW=0/false/off to disable entirely.
 */
function shadowEnabled(): boolean {
  const v = (process.env.ENGAGEMENT_SHADOW ?? '').toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

// ─────────────────────── Classify + persist transition ───────────────────────

function maybeFireTransition(
  interviewId: string,
  buf: EngagementBuffer,
  scopedEntries: EngagementEntry[],
  now: number,
  seq: number
): void {
  const features = extractFeatures(scopedEntries, now);
  const newState = classifyEngagement(features, {
    quiescenceThresholdMs: buf.quiescenceThresholdMs,
  });
  if (newState === buf.lastState) return;
  const prevState = buf.lastState;
  buf.lastState = newState;
  // Fire-and-forget: never block the candidate path on an event write (§6.4 invariant).
  void appendEvent(interviewId, 'engagement', {
    state: newState,
    prevState,
    features,
    thresholds: { quiescenceMs: buf.quiescenceThresholdMs },
    seq,
  }).catch((err: unknown) => {
    console.error(`[engagement] appendEvent failed for ${interviewId}:`, err);
    captureException(err);
  });
}

// ─────────────────────── Public API ───────────────────────

/**
 * Ingest a code snapshot into the engagement engine.
 *
 * Returns `{ accepted: false }` when the snapshot's `seq` is stale — the caller (snapshot
 * route) MUST return 204 without writing to the DB. Returns `{ accepted: true }` when
 * accepted; the caller proceeds with the normal updateInterview persistence.
 *
 * `milestoneCrossed` is true the FIRST time a snapshot for this codeIndex contains a
 * structural milestone (function/loop/data-structure) — the caller fires the proactive
 * code-anchored probe fire-and-forget when this is true and ENGAGEMENT_INTERVENTIONS is on.
 *
 * Side-effect: fires-and-forgets an appendEvent on state transitions.
 */
export function ingestSnapshot(
  interviewId: string,
  opts: { seq?: number; codeIndex: number; code: string; ts?: number }
): { accepted: boolean; milestoneCrossed: boolean } {
  if (!shadowEnabled()) return { accepted: true, milestoneCrossed: false }; // pass-through

  const now = opts.ts ?? Date.now();
  const buf = getOrCreate(interviewId);

  if (sweepIfStale(interviewId, buf, now)) return { accepted: true, milestoneCrossed: false };

  // Hard-reset the feature stream on codeIndex change (§6.1). Also resets milestoneCrossed
  // so the probe can fire once per coding problem.
  const lastEntry = buf.entries[buf.entries.length - 1];
  const lastCodeIndex = lastEntry?.codeIndex ?? -1;
  if (lastCodeIndex !== -1 && lastCodeIndex !== opts.codeIndex) {
    buf.entries = [];
    buf.lastSeq = -1;
    buf.milestoneCrossed = false;
  }

  // Stale seq rejection (§6.1). Back-compat: accept unconditionally when no seq supplied.
  // A page reload restarts the client counter at 1, so a MUCH lower seq is a new client
  // session to re-anchor on — not a stale straggler. Only near-miss ordering violations
  // (the delayed pre-run snapshot this check exists for) are rejected: a genuine straggler
  // arrives at most a few seq behind (client throttles ~3s; reorder windows are seconds).
  if (opts.seq !== undefined) {
    if (opts.seq <= buf.lastSeq) {
      const isNewClientSession = opts.seq === 1 || buf.lastSeq - opts.seq >= 10;
      if (!isNewClientSession) return { accepted: false, milestoneCrossed: false };
    }
    buf.lastSeq = opts.seq;
  }

  // Line-hash diff vs previous entry's lineHashes (O(lines), content capped at 16 KB).
  const lines = contentLines(opts.code);
  // NoteEntry lacks lineHashes/totalBytes — find the last snapshot or run entry.
  const prevEntry = [...buf.entries]
    .reverse()
    .find((e): e is SnapshotEntry | RunEntry => e.kind !== 'note');
  const prevLines: string[] = prevEntry?.lineHashes ?? [];
  const prevTotalBytes = prevEntry?.totalBytes ?? 0;
  const totalBytes = lines.reduce((s, l) => s + l.length + 1, 0);

  const { bytesAdded, bytesDeleted, linesTouched } = lineHashDiff(prevLines, lines);

  // Deletion burst: >30 % of previous content removed in one snapshot window.
  const deletionBurst = prevTotalBytes > 0 && bytesDeleted > 0.3 * prevTotalBytes;

  // Churn: edits present but net growth < 30 % of total activity.
  const totalActivity = bytesAdded + bytesDeleted;
  const churn =
    totalActivity > 0 &&
    linesTouched > 0 &&
    Math.abs(bytesAdded - bytesDeleted) < 0.3 * totalActivity;

  const entry: SnapshotEntry = {
    kind: 'snapshot',
    seq: opts.seq ?? buf.lastSeq,
    codeIndex: opts.codeIndex,
    ts: now,
    bytesAdded,
    bytesDeleted,
    linesTouched,
    deletionBurst,
    churn,
    lineHashes: lines,
    totalBytes,
  };
  buf.entries.push(entry);
  while (buf.entries.length > RING_CAP) buf.entries.shift();

  const scoped = buf.entries.filter((e) => e.codeIndex === opts.codeIndex);
  maybeFireTransition(interviewId, buf, scoped, now, entry.seq);

  // Milestone detection: first time this codeIndex's snapshot contains substantive structure.
  // Returns true exactly once per codeIndex so the caller fires the probe once.
  let milestoneCrossed = false;
  if (!buf.milestoneCrossed && hasMilestoneStructure(opts.code)) {
    buf.milestoneCrossed = true;
    milestoneCrossed = true;
  }

  return { accepted: true, milestoneCrossed };
}

/**
 * Ingest a code run result into the engagement engine. Called after `appendCodeRun`
 * so the buffer sees the same run the DB sees (§6.3). A run submission resets
 * quiescence — the latest run entry's ts anchors the quiescence clock.
 */
export function ingestRun(
  interviewId: string,
  opts: {
    codeIndex: number;
    status: string;
    passed: number;
    total: number;
    /** null when the run passed all tests (failureSignature not applicable). */
    failureSig: string | null;
    code: string;
    ts?: number;
  }
): void {
  if (!shadowEnabled()) return;

  const now = opts.ts ?? Date.now();
  const buf = getOrCreate(interviewId);
  if (sweepIfStale(interviewId, buf, now)) return;

  // Hard-reset on codeIndex change (§6.1). Also resets milestoneCrossed (per-problem).
  const lastEntry = buf.entries[buf.entries.length - 1];
  if (lastEntry && lastEntry.codeIndex !== opts.codeIndex) {
    buf.entries = [];
    buf.milestoneCrossed = false;
  }

  // Diff vs the previous run's lineHashes (run-to-run comparison for WHEEL_SPINNING).
  // Fall back to the most recent snapshot when no prior run exists.
  const lines = contentLines(opts.code);
  const prevRunEntry = [...buf.entries].reverse().find((e): e is RunEntry => e.kind === 'run');
  const lastNonNote = [...buf.entries]
    .reverse()
    .find((e): e is SnapshotEntry | RunEntry => e.kind !== 'note');
  const prevLines: string[] = prevRunEntry
    ? prevRunEntry.lineHashes
    : (lastNonNote?.lineHashes ?? []);

  const hadPriorBaseline = prevLines.length > 0;
  // hasNonTrivialChanges: true when non-print/log lines changed (§6.5).
  // When no baseline exists, default to true (safe: can't detect triviality).
  const hasNonTrivialChanges = hadPriorBaseline ? !onlyPrintLinesChanged(prevLines, lines) : true;

  const totalBytes = lines.reduce((s, l) => s + l.length + 1, 0);

  const entry: RunEntry = {
    kind: 'run',
    codeIndex: opts.codeIndex,
    ts: now,
    runStatus: opts.status,
    failureSig: opts.failureSig,
    passed: opts.passed,
    total: opts.total,
    hasNonTrivialChanges,
    hadPriorBaseline,
    lineHashes: lines,
    totalBytes,
  };
  buf.entries.push(entry);
  while (buf.entries.length > RING_CAP) buf.entries.shift();

  const scoped = buf.entries.filter((e) => e.codeIndex === opts.codeIndex);
  maybeFireTransition(interviewId, buf, scoped, now, buf.lastSeq);
}

/**
 * Evict the engagement buffer for a terminal interview transition (scored, cancelled).
 * The TTL sweep handles abandoned buffers automatically on next access.
 */
export function evictEngagement(interviewId: string): void {
  buffers.delete(interviewId);
}

// ─────────────────────── P2 engagement accessors ───────────────────────

/** Whether the active interventions engine (P2) is enabled. Separate from shadowEnabled() —
 *  ENGAGEMENT_SHADOW controls logging; this controls acting. Default OFF when unset. */
function interventionsEnabled(): boolean {
  const v = (process.env.ENGAGEMENT_INTERVENTIONS ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** The most recent classified engagement state for an interview, or null when the buffer is cold
 *  (restarted since the last snapshot/run). Used by Path C to decide IF to intervene. */
export function currentEngagement(interviewId: string): EngagementClassification | null {
  const buf = buffers.get(interviewId);
  return buf?.lastState ?? null;
}

/**
 * True when the cross-path cooldown has elapsed since the last intervention, or when no
 * intervention has been fired yet. The cooldown is per-interview-jitter (120–180 s).
 */
export function cooldownOk(interviewId: string, now: number = Date.now()): boolean {
  const buf = buffers.get(interviewId);
  if (!buf || buf.lastInterventionTs === 0) return true;
  return now - buf.lastInterventionTs >= buf.cooldownThresholdMs;
}

/** Record that an unprompted intervention (Path A/B/C) was just fired — starts the cooldown clock. */
export function recordInterventionFired(interviewId: string, ts: number = Date.now()): void {
  const buf = buffers.get(interviewId);
  if (buf) buf.lastInterventionTs = ts;
}

/**
 * Ingest an observer note into the ring buffer. The note is also persisted by the caller as an
 * interview_event before this is called; this function only updates in-memory state for wording
 * injection. Gated by ENGAGEMENT_INTERVENTIONS — a no-op when the feature is off.
 */
export function ingestNote(interviewId: string, note: ObserverNote, codeIndex: number): void {
  if (!interventionsEnabled()) return;
  const buf = getOrCreate(interviewId);
  const entry: NoteEntry = {
    kind: 'note',
    codeIndex,
    ts: Date.now(),
    seq: note.seq,
    approach: note.approach,
    transition: note.transition,
    diagnosis: note.diagnosis,
  };
  buf.entries.push(entry);
  while (buf.entries.length > RING_CAP) buf.entries.shift();
}

/**
 * Return the most recent `maxCount` observer notes from the ring buffer for an interview.
 * Returns the contiguous suffix only — approach/transition injected into all wording;
 * diagnosis injected only at ladder rung ≥ 2 (handled by the caller).
 */
export function getRecentNotes(interviewId: string, maxCount: number): ObserverNote[] {
  const buf = buffers.get(interviewId);
  if (!buf) return [];
  return buf.entries
    .filter((e): e is NoteEntry => e.kind === 'note')
    .slice(-maxCount)
    .map((e) => ({
      approach: e.approach,
      transition: e.transition,
      diagnosis: e.diagnosis,
      seq: e.seq,
    }));
}
