// Observer notes engine (§6.4) — fire-and-forget LLM call producing {approach, transition, diagnosis}.
//
// Triggered AFTER appendCodeRun lands in recordRun AND after submitAnswer's transition persists —
// NEVER awaited under withInterviewLock or inside a response path.
//
// Each note: one LLM call with reasoningEffort:'high' and AbortSignal.timeout(5_000) wrapping
// the whole call. Input: last 5 notes + line-capped code diff summary + latest run result.
// Output: strict JSON {approach, transition, diagnosis} ≤400 tokens.
// Storage: ring buffer (engagement.ts) + interview_events (type 'observer_note').
//
// Gated by ENGAGEMENT_INTERVENTIONS — the whole engine is a no-op when the flag is unset.

import {
  createMinimaxClient,
  MinimaxClient,
  minimaxConfigFromEnv,
  groqChainConfigs,
  createFailoverClient,
  extractJsonObject,
  ChatMessage,
} from './minimax';
import { ObserverNote } from './types';
import { RunResult } from '../execution/types';
import { appendEvent } from '../db/interviews';
import { ingestNote, getRecentNotes } from './engagement';
import { captureException } from '../observability/sentry';

// ─────────────────────── Gate ───────────────────────

function interventionsEnabled(): boolean {
  const v = (process.env.ENGAGEMENT_INTERVENTIONS ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

// ─────────────────────── LLM client for notes ───────────────────────

/** Minimal failover client for observer notes. Uses Groq primary (high reasoning effort) or
 *  MiniMax as fallback. Notes use 'high' per-call reasoning effort. */
function getNotesClient(): MinimaxClient {
  const entries: { name: string; client: MinimaxClient }[] = [];
  if (process.env.GROQ_API_KEY) {
    const chain = groqChainConfigs();
    if (chain.length > 0) {
      entries.push({ name: 'groq:notes', client: createMinimaxClient(chain[0]!) });
    }
  }
  if (process.env.MINIMAX_API_KEY) {
    entries.push({ name: 'minimax', client: createMinimaxClient(minimaxConfigFromEnv()) });
  }
  if (entries.length === 0) throw new Error('No LLM configured for observer notes');
  return createFailoverClient(entries);
}

// ─────────────────────── Prompt ───────────────────────

const NOTE_SYSTEM =
  'You are an internal analytical tool for a technical interview system. ' +
  "Based on the candidate's code, run results, and recent history, produce a BRIEF structured " +
  'assessment of their current state. Output ONLY valid JSON — no prose, no markdown fences. ' +
  'Schema: {"approach":string,"transition":string,"diagnosis":string}. ' +
  'Each field is ONE concise sentence (≤25 words). ' +
  'approach: what the candidate is currently attempting architecturally. ' +
  'transition: how their thinking appears to be shifting between the most recent runs. ' +
  'diagnosis: the most likely root cause of why they are stuck (even if they just passed — ' +
  'note what they corrected). ' +
  'NEVER reveal hidden-test content, expected outputs, or the correct solution. ' +
  'Internal use only — never shown to the candidate.';

/** Cap diff text at 1500 chars to stay within token budget. */
const DIFF_CAP = 1500;
/** Max notes to include in context for continuity. */
const MAX_PRIOR_NOTES = 5;

function buildNotePrompt(opts: {
  interviewId: string;
  codeIndex: number;
  code: string;
  priorNotes: ObserverNote[];
  runResult?: RunResult;
}): string {
  const parts: string[] = [];

  if (opts.priorNotes.length > 0) {
    const noteLines = opts.priorNotes
      .map((n, i) => `[Note ${i + 1}] Approach: ${n.approach} | Transition: ${n.transition}`)
      .join('\n');
    parts.push(`Prior observer notes (most recent last):\n${noteLines}`);
  }

  if (opts.runResult) {
    const r = opts.runResult;
    const summary: string[] = [`Run status: ${r.status}`];
    if (r.testResults) {
      summary.push(`Hidden tests: ${r.testResults.passed}/${r.testResults.total} passed`);
      if (r.testResults.incomplete) summary.push('(stopped early — crash/timeout)');
    }
    if (r.stderr?.trim())
      summary.push(`Stderr (first 200 chars): ${r.stderr.trim().slice(0, 200)}`);
    parts.push(`Latest run result: ${summary.join('; ')}`);
  }

  // Cap code to DIFF_CAP chars to stay within budget.
  const codeSnippet =
    opts.code.length > DIFF_CAP ? opts.code.slice(0, DIFF_CAP) + '\n...[truncated]' : opts.code;
  parts.push(`Current code (question ${opts.codeIndex + 1}):\n${codeSnippet}`);
  parts.push('Produce only the JSON object.');

  return parts.filter(Boolean).join('\n\n');
}

// ─────────────────────── Internal async runner ───────────────────────

async function runObserverNote(
  interviewId: string,
  opts: {
    codeIndex: number;
    code: string;
    runResult?: RunResult;
  }
): Promise<void> {
  const priorNotes = getRecentNotes(interviewId, MAX_PRIOR_NOTES);
  const client = getNotesClient();

  const messages: ChatMessage[] = [
    { role: 'system', content: NOTE_SYSTEM },
    {
      role: 'user',
      content: buildNotePrompt({
        interviewId,
        codeIndex: opts.codeIndex,
        code: opts.code,
        priorNotes,
        runResult: opts.runResult,
      }),
    },
  ];

  // 5-second total budget — if the LLM is slow, drop silently. Notes are best-effort.
  const raw = await Promise.race([
    client.complete(messages, { json: true, maxTokens: 400, reasoningEffort: 'high' }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('observer-note timeout (5s)')), 5_000)
    ),
  ]);

  let parsed: { approach?: unknown; transition?: unknown; diagnosis?: unknown };
  try {
    parsed = JSON.parse(extractJsonObject(raw)) as typeof parsed;
  } catch {
    return; // malformed JSON — drop silently
  }

  const approach = typeof parsed.approach === 'string' ? parsed.approach.trim() : '';
  const transition = typeof parsed.transition === 'string' ? parsed.transition.trim() : '';
  const diagnosis = typeof parsed.diagnosis === 'string' ? parsed.diagnosis.trim() : '';
  if (!approach && !transition && !diagnosis) return; // empty — drop silently

  // Monotonic seq: use a simple timestamp-based counter (good enough for intra-interview ordering).
  const seq = Date.now();
  const note: ObserverNote = { approach, transition, diagnosis, seq };

  // Persist to ring buffer (in-memory, for wording injection).
  ingestNote(interviewId, note, opts.codeIndex);

  // Persist to interview_events (for audit trail). Fire-and-forget — a DB failure here must
  // not propagate to the caller (already in a void async chain).
  void appendEvent(interviewId, 'observer_note', {
    codeIndex: opts.codeIndex,
    approach,
    transition,
    diagnosis,
    seq,
  }).catch((err: unknown) => {
    console.error(`[notes] appendEvent failed for ${interviewId}:`, err);
    captureException(err);
  });
}

// ─────────────────────── Public API ───────────────────────

/**
 * Fire-and-forget observer note generation. Returns void immediately — never awaited.
 * Safe to call after appendCodeRun or after a submitAnswer transition persists, outside any lock.
 * All errors are swallowed (→ Sentry captureException); never propagates to the caller.
 * Gated by ENGAGEMENT_INTERVENTIONS — a no-op when the flag is unset.
 */
export function maybeFireObserverNote(
  interviewId: string,
  opts: {
    codeIndex: number;
    code: string;
    runResult?: RunResult;
  }
): void {
  if (!interventionsEnabled()) return;

  void runObserverNote(interviewId, opts).catch((err: unknown) => {
    captureException(err);
  });
}
