// Semantic-repeat guard for oral questions (indistinguishability pass #3).
//
// Prompt mandates ("ask a different topic") are probabilistic — the wording LLM's attention
// keeps returning to an unresolved thread in the transcript, which produced the same narrow
// question across 6 consecutive turns on prod. This guard makes topic change STRUCTURAL:
// the orchestrator validates each newly-worded oral question against the interviewer's prior
// questions, retries once with an explicit banned-topic list, then falls back to the
// deterministic pivot line. Same validate-retry-fallback shape as extractJsonObject.

import type { TranscriptTurn } from './oracle';

/** Words that carry no topical content — never counted as overlap evidence. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'that', 'this', 'those', 'these',
  'you', 'your', 'yours', 'me', 'my', 'i', 'we', 'our', 'it', 'its', 'they', 'their',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'can', 'could', 'would', 'should',
  'walk', 'through', 'tell', 'about', 'describe', 'explain', 'exactly', 'precisely',
  'specific', 'specifically', 'detail', 'details', 'exact', 'step', 'steps', 'me',
  'did', 'does', 'was', 'were', 'have', 'has', 'had', 'will', 'with', 'for', 'from',
  'into', 'during', 'still', 'need', 'want', 'like', 'just', 'right', 'okay', 'let',
  'lets', 'more', 'some', 'any', 'one', 'two', 'also', 'covers', 'covered', 'take',
  'takes', 'took', 'perform', 'performs', 'performed', 'use', 'uses', 'used', 'using',
]);

/** Topical content keywords of an utterance: lowercased, punctuation-stripped, stopword-free,
 *  length > 3. Exported for unit tests. */
export function contentKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  return new Set(words);
}

/** The interviewer's recent question turns (contain a "?"), most recent last. */
export function priorAiQuestions(transcript: TranscriptTurn[], limit = 8): string[] {
  return transcript
    .filter((t) => t.role === 'interviewer' && t.text.includes('?'))
    .slice(-limit)
    .map((t) => t.text);
}

/**
 * TRUE when `candidate` re-treads a prior question's topic: ≥4 shared content keywords with
 * any single prior question, or ≥50% of the candidate's own keywords already seen in one.
 * Tuned loose-enough that a genuinely new topic (different nouns) never trips it — an oral
 * question about, say, cache invalidation shares no content nouns with one about Lua failover.
 */
export function isSemanticRepeat(candidate: string, priors: string[]): boolean {
  const cand = contentKeywords(candidate);
  if (cand.size === 0) return false;
  for (const prior of priors) {
    const prev = contentKeywords(prior);
    let shared = 0;
    for (const w of cand) if (prev.has(w)) shared++;
    if (shared >= 4 || shared / cand.size >= 0.5) return true;
  }
  return false;
}

/** The union of prior questions' keywords, for the retry prompt's explicit banned list. */
export function bannedTopicTerms(priors: string[], cap = 24): string[] {
  const out = new Set<string>();
  for (const q of priors) for (const w of contentKeywords(q)) out.add(w);
  return [...out].slice(0, cap);
}
