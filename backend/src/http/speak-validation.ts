// Speak-text validation for the /speak and /speak-stream routes.
// Extracted as a pure, dependency-free module so it can be unit-tested without mocking
// the DB, orchestrator, or Cartesia.

/**
 * The exact idle-probe lines the Python voice service (voice/session.py _IDLE_PROBE_LINES)
 * speaks to a silent candidate. They are server-authoritative canned strings that are NEVER
 * persisted on the interview transcript; the voice session passes them verbatim as `text` on
 * /speak and /speak-stream. The backend must accept them even though they do not appear in the
 * transcript or code-run history.
 *
 * BOTH LISTS MUST STAY IN LOCKSTEP — update voice/session.py's _IDLE_PROBE_LINES whenever
 * you change this array, and vice versa.
 */
export const IDLE_PROBE_LINES: readonly string[] = [
  'Take your time — would you like me to rephrase the question?',
  'No rush — want me to restate it or give you a moment?',
  "Whenever you're ready — shall I repeat the question?",
];

const IDLE_PROBE_SET = new Set<string>(IDLE_PROBE_LINES);

/**
 * The spoken goodbye for a candidate-initiated End. The room speaks it BEFORE calling /finish
 * (after /finish the interview is scored and the terminal-status gate below forbids synthesis),
 * and /finish returns the same string for display on the done card.
 *
 * SYNC: mirrored in frontend/app/interview/[id]/page.tsx GOODBYE_LINE — keep both in lockstep.
 */
export const GOODBYE_LINE =
  "Thanks for completing the interview — we'll review your session and be in touch. Best of luck!";

/**
 * Pure validation: confirm that a client-supplied TTS text matches a server-authoritative
 * utterance before synthesising it. Throws a structured error on rejection.
 *
 * Accepted when `trimmedText` exactly equals (after trim):
 *   (a) `turnText`  — the latest interviewer transcript turn, or
 *   (b) `runText`   — the latest run-hint intervention text, or
 *   (c) one of the IDLE_PROBE_LINES (voice-only, never persisted).
 *
 * Throws 409 when the interview is cancelled, expired, completed, or scored (no synthesis
 * permitted once the interview has ended or is in terminal scoring state).
 * Throws 422 when none of the above conditions match (text does not match a server utterance).
 *
 * @param trimmedText - Client-supplied text, already `.trim()`-ed by the caller.
 * @param status      - Current interview status (for the 409 gate).
 * @param turnText    - Latest interviewer transcript turn (already trimmed), or null.
 * @param runText     - Latest run-hint intervention text (already trimmed), or null.
 */
export function validateSpeakText(
  trimmedText: string,
  status: string,
  turnText: string | null,
  runText: string | null
): void {
  // Terminal or post-scoring statuses: no TTS synthesis is permitted.
  if (
    status === 'cancelled' ||
    status === 'expired' ||
    status === 'completed' ||
    status === 'scored'
  ) {
    throw Object.assign(new Error('Interview is not active.'), { status: 409 });
  }

  // (a) Latest interviewer transcript turn.
  if (turnText !== null && trimmedText === turnText) return;

  // (b) Latest run-hint intervention text.
  if (runText !== null && trimmedText === runText) return;

  // (c) Voice idle-probe lines (never persisted; only the voice service produces them).
  if (IDLE_PROBE_SET.has(trimmedText)) return;

  // (d) The candidate-initiated-End goodbye (spoken by the room just before /finish).
  if (trimmedText === GOODBYE_LINE) return;

  // Mismatch. Log the length only — never the actual text, which could be candidate-influenced
  // and therefore must not appear in server logs (content policy + privacy).
  console.warn(`[speak] text mismatch — provided length ${trimmedText.length}`);
  throw Object.assign(new Error('Text does not match a server utterance.'), { status: 422 });
}
