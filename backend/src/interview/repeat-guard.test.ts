// Unit tests for the semantic-repeat guard (indistinguishability pass #3 fix).
// The exact prod failure: 6 consecutive AI turns re-asking the Lua/compare-and-swap/failover
// question with varied surface phrasing. These fixtures are drawn from that transcript.

import {
  contentKeywords,
  isSemanticRepeat,
  priorAiQuestions,
  bannedTopicTerms,
} from './repeat-guard';
import type { TranscriptTurn } from './oracle';

const LUA_Q1 =
  'Can you walk me through exactly how your Lua script handled the atomic compare and swap ' +
  'when a key migrated to a different hash slot during a Redis Cluster failover?';
const LUA_Q2_REPHRASE =
  'Could you detail the exact steps the Lua script takes to perform the compare-and-swap ' +
  'when a key is being migrated during a failover?';
const LUA_Q3_REPHRASE =
  'I still need the precise sequence of commands and condition checks your Lua script performs ' +
  'to implement the compare-and-swap when a key is being migrated—can you walk me through that?';
const NEW_TOPIC_Q =
  'How would you design cache invalidation for a read-heavy product catalog, and what ' +
  'consistency guarantees would you offer the checkout flow?';
const TRADEOFF_Q =
  'Tell me about a time you had to choose between shipping fast and doing it right — what ' +
  'made you pick the side you picked?';

describe('contentKeywords', () => {
  test('drops stopwords and short words, keeps topical nouns', () => {
    const kw = contentKeywords(LUA_Q1);
    expect(kw.has('script')).toBe(true);
    expect(kw.has('failover')).toBe(true);
    expect(kw.has('the')).toBe(false);
    expect(kw.has('exactly')).toBe(false);
    expect(kw.has('you')).toBe(false);
  });
});

describe('isSemanticRepeat', () => {
  test('the prod repetition: each rephrase trips against the original', () => {
    expect(isSemanticRepeat(LUA_Q2_REPHRASE, [LUA_Q1])).toBe(true);
    expect(isSemanticRepeat(LUA_Q3_REPHRASE, [LUA_Q1, LUA_Q2_REPHRASE])).toBe(true);
  });

  test('a genuinely new topic never trips', () => {
    expect(isSemanticRepeat(NEW_TOPIC_Q, [LUA_Q1, LUA_Q2_REPHRASE, LUA_Q3_REPHRASE])).toBe(false);
    expect(isSemanticRepeat(TRADEOFF_Q, [LUA_Q1, LUA_Q2_REPHRASE])).toBe(false);
  });

  test('empty candidate or no priors → false', () => {
    expect(isSemanticRepeat('', [LUA_Q1])).toBe(false);
    expect(isSemanticRepeat(NEW_TOPIC_Q, [])).toBe(false);
  });
});

describe('priorAiQuestions', () => {
  test('returns only interviewer turns containing a question mark, capped', () => {
    const transcript: TranscriptTurn[] = [
      { role: 'interviewer', text: 'Welcome to the interview.' },
      { role: 'candidate', text: 'Thanks — I built a rate limiter?' },
      { role: 'interviewer', text: LUA_Q1 },
      { role: 'candidate', text: 'We deployed on EKS.' },
      { role: 'interviewer', text: LUA_Q2_REPHRASE },
    ];
    const qs = priorAiQuestions(transcript);
    expect(qs).toEqual([LUA_Q1, LUA_Q2_REPHRASE]);
  });
});

describe('bannedTopicTerms', () => {
  test('unions keywords across priors, capped', () => {
    const terms = bannedTopicTerms([LUA_Q1, LUA_Q2_REPHRASE]);
    expect(terms).toContain('failover');
    expect(terms.length).toBeLessThanOrEqual(24);
  });
});
