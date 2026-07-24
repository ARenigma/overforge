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
  'not', 'out', 'all', 'are', 'per', 'via', 'own', 'new', 'way', 'say', 'see', 'now', 'get',
]);

/** Suffixes stripped (longest-first) so morphological variants share a stem — pass #5 proved
 *  the guard blind without this: "atomicity"/"atomic", "migrated"/"migration" never matched,
 *  so the same question re-worded always slid under the shared-term threshold. */
// 'ion' (not 'ation') so migration→migrat matches migrated→migrat; same for execution/executes.
const SUFFIXES = ['ions', 'ion', 'ities', 'ity', 'ings', 'ing', 'ies', 'ers', 'er', 'ed', 'es', 's'];

/** Crude stemmer: iteratively strip one suffix while the stem stays ≥4 chars. Exported for tests. */
export function stem(word: string): string {
  let w = word;
  for (const suf of SUFFIXES) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

/** Topical content stems of an utterance: lowercased, punctuation-stripped, stopword-free,
 *  length > 3, suffix-stemmed. Exported for unit tests. */
export function contentKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    // ≥3 chars: 3-letter terms are often THE topic ("lua", "api", "key", "aws") — pass #5's
    // turn 5 only failed to cluster because "lua" was being dropped by a >3 filter.
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(stem);
  return new Set(words);
}

/** The interviewer's recent question turns (contain a "?"), most recent last. */
export function priorAiQuestions(transcript: TranscriptTurn[], limit = 8): string[] {
  return transcript
    .filter((t) => t.role === 'interviewer' && t.text.includes('?'))
    .slice(-limit)
    .map((t) => t.text);
}

/** Shared-stem overlap test between one candidate utterance and one prior. Thresholds
 *  calibrated on the pass-#5 prod transcript: every re-worded same-question turn shares ≥3
 *  stems with a prior (lua/redis/atomic/failover/script/migrat…), while genuinely different
 *  questions about the SAME project (memory sizing, load testing) stay at ≤2. */
function overlaps(cand: Set<string>, prior: string): boolean {
  const prev = contentKeywords(prior);
  let shared = 0;
  for (const w of cand) if (prev.has(w)) shared++;
  return shared >= 3 || shared / cand.size >= 0.4;
}

/**
 * TRUE when `candidate` re-treads any prior question's topic. Tuned so a genuinely new
 * topic (different nouns) never trips it — a question about, say, cache invalidation
 * shares no content stems with one about Lua failover.
 */
export function isSemanticRepeat(candidate: string, priors: string[]): boolean {
  const cand = contentKeywords(candidate);
  if (cand.size === 0) return false;
  for (const prior of priors) if (overlaps(cand, prior)) return true;
  return false;
}

/** The union of prior questions' keywords, for the retry prompt's explicit banned list. */
export function bannedTopicTerms(priors: string[], cap = 24): string[] {
  const out = new Set<string>();
  for (const q of priors) for (const w of contentKeywords(q)) out.add(w);
  return [...out].slice(0, cap);
}

/**
 * How many prior interviewer turns already sit in `candidate`'s topic cluster (same overlap
 * test as isSemanticRepeat, counted instead of short-circuited).
 *
 * The interview-wide invariant this powers (pass #4): NO topic cluster may exceed 3
 * interviewer turns — a human either gets an answer, names the impasse, or lets the thread
 * go by the third touch. New questions are blocked from joining ANY existing cluster;
 * follow-ups may sit in their own question's cluster until it reaches 3 members.
 */
export function clusterCount(candidate: string, priors: string[]): number {
  const cand = contentKeywords(candidate);
  if (cand.size === 0) return 0;
  let count = 0;
  for (const prior of priors) if (overlaps(cand, prior)) count++;
  return count;
}
