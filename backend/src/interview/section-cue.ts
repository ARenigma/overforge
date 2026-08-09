// Section-cue guard: at an FSM section boundary the SPOKEN utterance must actually open the
// new section. Prompt mandates alone don't hold — the 2026-08-03 voice dress rehearsal
// (interview 22b3f3f7) produced all three boundary turns as continuations of an unresolved
// oral thread: the handoff turn re-asked the metric question, the ask_code turn named a dodge,
// and the wrap_up turn chased a coding detail. The candidate never HEARD the coding round
// start. Same discipline as the repeat guard: validate structurally → one corrective retry →
// deterministic fallback (whose templates always announce the section).
//
// Only transition effects are validated; content turns stay the LLM's to word.

import type { Effect } from './types';

export type SectionEffectKind = 'handoff' | 'ask_code' | 'wrap_up';

export function isSectionEffect(kind: Effect['kind']): kind is SectionEffectKind {
  return kind === 'handoff' || kind === 'ask_code' || kind === 'wrap_up';
}

/** True when `text` genuinely opens the section `kind` announces. Marker-based on purpose:
 *  cheap, deterministic, and tuned against the real failing prod turns (see the test file) —
 *  a false negative merely retries and then falls back to a deterministic line that DOES
 *  announce the section, so the failure mode is "less flavorful", never "missed cue". */
export function announcesSection(kind: SectionEffectKind, text: string): boolean {
  const t = text.toLowerCase();
  switch (kind) {
    case 'handoff':
      // Must name the boundary: coding is next / the walkthrough is done.
      return /\bcod(?:e|ing)\b/.test(t) || /walkthrough[^.?!]{0,32}(?:done|over|wraps)/.test(t);
    case 'ask_code':
      // Must point the candidate at the problem on their screen. "your current code" does NOT
      // qualify (that's how the momentum-captured turn slipped through conceptually) — the cue
      // is the problem/screen reference, not the word "code".
      return /\b(?:problem|screen|statement)\b/.test(t);
    case 'wrap_up':
      return (
        /\b(?:wrap|wraps|wrapping|clos(?:e|ing)|final|last (?:part|section|bit|few)|nearly (?:there|done)|almost (?:there|done)|before we finish)\b/.test(
          t
        ) || /coding (?:round|section|part)[^.?!]{0,24}(?:done|over|behind)/.test(t)
      );
  }
}

/** Corrective note appended to the wording prompt on the single retry. Names the failure
 *  concretely — the model was momentum-captured by an earlier thread — and restates the one
 *  job this turn has. */
export function sectionRetryNote(kind: SectionEffectKind): string {
  switch (kind) {
    case 'handoff':
      return (
        'YOUR PREVIOUS DRAFT FAILED: it continued an earlier discussion instead of announcing ' +
        'the section change. Every earlier thread is CLOSED — do not revisit, reference, or ' +
        're-ask ANY previous question. Give one half-sentence warm acknowledgment of their final ' +
        'answer, then say the walkthrough is done and the coding round starts now. ' +
        'Two short sentences maximum.'
      );
    case 'ask_code':
      return (
        'YOUR PREVIOUS DRAFT FAILED: it continued an earlier discussion instead of introducing ' +
        'the coding problem. Every earlier thread is CLOSED — do not revisit, reference, or ' +
        're-ask ANY previous question. Tell them the problem is on their screen, give a one-line ' +
        'gist, and invite their approach.'
      );
    case 'wrap_up':
      return (
        'YOUR PREVIOUS DRAFT FAILED: it continued the coding discussion instead of opening the ' +
        'wrap-up. The coding section is CLOSED — do not revisit, reference, or re-ask anything ' +
        'from it. Say this is the last part and close warmly.'
      );
  }
}
