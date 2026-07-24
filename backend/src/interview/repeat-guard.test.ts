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
  test('drops stopwords and short words, keeps topical noun stems', () => {
    const kw = contentKeywords(LUA_Q1);
    expect(kw.has('script')).toBe(true);
    expect(kw.has(stem('failover'))).toBe(true);
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
    expect(terms).toContain(stem('failover'));
    expect(terms.length).toBeLessThanOrEqual(24);
  });
});

// ─────────── Pass #5 verbatim prod transcript — the matcher MUST catch these ───────────
// These six turns all re-asked the same Lua-atomicity question on prod (interview 648ad6ec)
// and every one slid under the pre-stemming thresholds ("atomicity"≠"atomic",
// "migrated"≠"migration"). The cluster-cap invariant only works if they mutually cluster.

import { clusterCount, stem } from './repeat-guard';

const P5 = [
  'Can you walk me through exactly how you handled the Lua script\'s atomicity when a Redis node failed and the key moved to a different hash slot?',
  'You noted the cluster topology and deployment details; now explain the precise steps your Lua script takes to guarantee atomic compare‑and‑swap across a failover and key migration.',
  "Given the need for strong consistency during the rate‑limit check, how would you compare the guarantees provided by Redis's single‑node atomic Lua execution versus a multi‑node consensus protocol like Raft, and what trade‑offs would influence your choice?",
  'You mentioned the team structure and process; now detail the exact sequence the Lua script follows to ensure atomic compare‑and‑swap during a node failure and key migration.',
  'Could you enumerate the exact commands and checks the Lua script performs, step by step, to achieve the compare‑and‑swap while handling a failover scenario?',
  'Could you walk me through the exact sequence of Redis commands that your Lua script executes to perform the compare‑and‑swap, especially how it handles the case where the primary node fails during the operation?',
];

describe('stem', () => {
  test('morphological variants share a stem', () => {
    expect(stem('atomicity')).toBe(stem('atomic'));
    expect(stem('migrated')).toBe(stem('migration'));
    expect(stem('failed')).toBe(stem('fails'));
  });
});

describe('pass #5 prod fixtures — cluster cap', () => {
  test('every later turn clusters with the earlier ones (guard would block turns 4+)', () => {
    // Turn 4 (index 3) as a follow-up: priors are turns 1-3; limit is 2 → must exceed it.
    expect(clusterCount(P5[3], P5.slice(0, 3))).toBeGreaterThan(2);
    // Turns 5 and 6 likewise.
    expect(clusterCount(P5[4], P5.slice(0, 4))).toBeGreaterThan(2);
    expect(clusterCount(P5[5], P5.slice(0, 5))).toBeGreaterThan(2);
    // Turn 2 as a hypothetical NEW question (limit 0): must cluster with turn 1.
    expect(clusterCount(P5[1], P5.slice(0, 1))).toBeGreaterThan(0);
    // The Raft-comparison turn (the subtlest rephrase) must cluster with the earlier turns.
    expect(clusterCount(P5[2], P5.slice(0, 2))).toBeGreaterThan(0);
  });

  test('genuinely different questions about the SAME project do not trip the guard', () => {
    const memoryQ =
      'How did you size the sliding-window sorted sets in memory, and what eviction policy kept the footprint bounded?';
    const loadQ =
      'How did you load-test the gateway before rollout, and what surprised you in the results?';
    expect(clusterCount(memoryQ, P5)).toBeLessThanOrEqual(2);
    expect(clusterCount(loadQ, P5)).toBe(0);
  });
});
