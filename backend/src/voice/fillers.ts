// Server-side filler ("thinking") phrases for the voice interview's backchannel. The interviewer
// plays one of these the instant the candidate stops speaking, masking the STT + LLM latency before
// the real reply so the room doesn't feel robotically silent (P2-B.3).
//
// This frozen list is the ENTIRE universe of utterable filler text: the /filler route never accepts
// client text (so it can't be an arbitrary-text TTS oracle), and these words are NEVER written into
// the scored transcript (they aren't interview content).

export const FILLERS: readonly string[] = Object.freeze([
  'Hmm.',
  'Let me think.',
  'Okay.',
  'Right.',
  'Mm-hmm.',
  'Got it.',
  'I see.',
]);

export function getFillerCount(): number {
  return FILLERS.length;
}

/** A uniformly-random valid index into FILLERS. */
export function pickFillerIndex(): number {
  return Math.floor(Math.random() * FILLERS.length);
}
