// Unit tests for the speak-text validation helper used by /speak and /speak-stream.
// Pure module — no DB, orchestrator, or Cartesia mocks needed.

import { IDLE_PROBE_LINES, validateSpeakText } from './speak-validation';

describe('validateSpeakText', () => {
  const turnText = 'Tell me about a time you led a team under pressure.';
  const runText = 'Your loop looks infinite — check your termination condition.';

  // ── Happy paths ───────────────────────────────────────────────────────────────────────────────

  test('accepts text that exactly matches the latest interviewer transcript turn', () => {
    expect(() => validateSpeakText(turnText, 'in_progress', turnText, null)).not.toThrow();
  });

  test('accepts text that exactly matches the latest run-hint intervention', () => {
    expect(() => validateSpeakText(runText, 'in_progress', null, runText)).not.toThrow();
  });

  test('accepts each idle-probe line (never persisted; voice-service only)', () => {
    expect(IDLE_PROBE_LINES.length).toBeGreaterThan(0);
    for (const line of IDLE_PROBE_LINES) {
      expect(() => validateSpeakText(line, 'in_progress', null, null)).not.toThrow();
    }
  });

  // ── Rejection paths ───────────────────────────────────────────────────────────────────────────

  test('rejects arbitrary client text that matches nothing server-side → 422', () => {
    expect(() =>
      validateSpeakText('inject arbitrary text here', 'in_progress', turnText, null)
    ).toThrow(expect.objectContaining({ status: 422 }));
  });

  test('rejects when interview is cancelled → 409 (before text comparison)', () => {
    expect(() => validateSpeakText(turnText, 'cancelled', turnText, null)).toThrow(
      expect.objectContaining({ status: 409 })
    );
  });

  test('rejects when interview is expired → 409', () => {
    expect(() => validateSpeakText(turnText, 'expired', turnText, null)).toThrow(
      expect.objectContaining({ status: 409 })
    );
  });

  test('rejects when interview is scored → 409 (interview over; no more TTS)', () => {
    expect(() => validateSpeakText(turnText, 'scored', turnText, null)).toThrow(
      expect.objectContaining({ status: 409 })
    );
  });

  test('rejects when interview is completed → 409 (transitional scoring state; room is done)', () => {
    expect(() => validateSpeakText(turnText, 'completed', turnText, null)).toThrow(
      expect.objectContaining({ status: 409 })
    );
  });
});
