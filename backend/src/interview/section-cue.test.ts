// Fixtures are the REAL boundary turns from the 2026-08-03 voice dress rehearsal
// (prod interview 22b3f3f7): every one of them was worded as a continuation of an
// unresolved oral thread, so the candidate never heard a section open. The guard
// exists because these exact strings shipped; they must fail validation forever.

import { announcesSection, isSectionEffect, sectionRetryNote } from './section-cue';
import { DeterministicOracle } from './oracle';

describe('announcesSection — real failing prod turns (interview 22b3f3f7)', () => {
  test('handoff turn that re-asked the metric question fails', () => {
    expect(
      announcesSection(
        'handoff',
        'Right — which exact metric crossed its threshold and how did that trigger your circuit breaker?'
      )
    ).toBe(false);
  });

  test('ask_code turn that named a dodge instead of the problem fails', () => {
    expect(
      announcesSection(
        'ask_code',
        'Hmm, that sounds like a deep dive into hash maps, but I was asking about the metric that ' +
          'actually tripped your circuit breaker. Which specific monitoring signal crossed its ' +
          'threshold and caused the breaker to fire?'
      )
    ).toBe(false);
  });

  test('ask_code turn (problem advance) that chased the previous problem fails — "your current code" is not a problem intro', () => {
    expect(
      announcesSection(
        'ask_code',
        'Got it, let’s focus on that edge case. When the input is empty, what does your current code output?'
      )
    ).toBe(false);
  });

  test('wrap_up turn that still chased a coding detail fails', () => {
    expect(
      announcesSection(
        'wrap_up',
        'Hmm, you moved on, but I still need that detail. When the input is empty, what does your current code output?'
      )
    ).toBe(false);
  });
});

describe('announcesSection — genuine section openings pass', () => {
  test('every deterministic template announces its section', async () => {
    const oracle = new DeterministicOracle();
    const cases = [
      { kind: 'handoff' as const, effect: { kind: 'handoff' as const } },
      { kind: 'handoff' as const, effect: { kind: 'handoff' as const, pivot: true as const } },
      { kind: 'ask_code' as const, effect: { kind: 'ask_code' as const, index: 0 } },
      { kind: 'ask_code' as const, effect: { kind: 'ask_code' as const, index: 1 } },
      { kind: 'wrap_up' as const, effect: { kind: 'wrap_up' as const } },
    ];
    for (const c of cases) {
      const u = await oracle.generateUtterance({
        effect: c.effect,
        ctx: {} as never,
        transcript: [],
      });
      expect(announcesSection(c.kind, u.text)).toBe(true);
    }
  });

  test('plausible LLM-worded openings pass', () => {
    expect(
      announcesSection('handoff', "Great — that's the walkthrough done. Let's shift into the coding round.")
    ).toBe(true);
    expect(
      announcesSection(
        'ask_code',
        "Your first problem's on the screen now — have a read and talk me through your approach."
      )
    ).toBe(true);
    expect(
      announcesSection('wrap_up', "That's the coding section behind you — last part, just a couple of closing questions.")
    ).toBe(true);
    expect(announcesSection('wrap_up', 'Nearly there — a few final questions before we finish.')).toBe(true);
  });
});

describe('plumbing', () => {
  test('isSectionEffect covers exactly the three boundary kinds', () => {
    expect(isSectionEffect('handoff')).toBe(true);
    expect(isSectionEffect('ask_code')).toBe(true);
    expect(isSectionEffect('wrap_up')).toBe(true);
    expect(isSectionEffect('ask_oral')).toBe(false);
    expect(isSectionEffect('ask_followup')).toBe(false);
    expect(isSectionEffect('coding_ack')).toBe(false);
    expect(isSectionEffect('greet')).toBe(false);
  });

  test('every section kind has a non-empty retry note naming the failure', () => {
    for (const kind of ['handoff', 'ask_code', 'wrap_up'] as const) {
      const note = sectionRetryNote(kind);
      expect(note).toMatch(/PREVIOUS DRAFT FAILED/);
      expect(note).toMatch(/CLOSED/);
    }
  });
});
