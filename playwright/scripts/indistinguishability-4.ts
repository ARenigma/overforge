// Indistinguishability test #4 — HEAD 8b0c53ce
// Structural repeat guard: semantic keyword overlap → retry with banned-term list
// → deterministic pivot line ("No problem — let's move to something else...")
//
// IDENTICAL dodge scenario to pass #3 (same Redis/Lua opening + same 3 off-topic dodges).
// Genuine answers drive the interview to coding phase afterward.
//
// Judging criteria (all recorded verbatim):
//   C1  Same narrow question count ≤ 3 total (initial + up to 2 follow-up beats).
//       Once machine moves to oral Q#2, the topic GENUINELY changes (different technical area).
//       Deterministic pivot line counts as a topic change.
//       Pass #3 baseline: 6 same-question occurrences.
//   C2  Two-beat shape: report (don't fail) which replies acknowledge what the candidate DID say.
//   C3  No speech tags in any AI oral turn (T1 regression).
//   C4  No sub-800ms AI oral replies (T3 regression).
//
// Run: OF_TEST_PASSWORD='...' npx tsx playwright/scripts/indistinguishability-4.ts

import { getAccessToken } from '../helpers/auth';
import { config } from '../helpers/env';

const API = config.apiUrl;
const LANG = 'python';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface Turn {
  role: 'ai' | 'candidate';
  text: string;
  kind?: string;
  ms: number;
}

const log: Turn[] = [];
let lastTs = Date.now();

function rec(role: 'ai' | 'candidate', text: string, kind?: string): void {
  const ms = Date.now() - lastTs;
  lastTs = Date.now();
  log.push({ role, text: text.trim(), kind, ms });
  const prefix = role === 'ai' ? `[AI${kind ? ':' + kind : ''}]` : '[C]';
  console.log(`\n${prefix} (+${ms}ms)\n  "${text.trim().slice(0, 400)}"`);
}

async function httpPost(
  path: string,
  body: Record<string, unknown>,
  jwt?: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) h['Authorization'] = `Bearer ${jwt}`;
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  });
  const ct = r.headers.get('content-type') ?? '';
  const b = ct.includes('json')
    ? ((await r.json()) as Record<string, unknown>)
    : ({ text: await r.text() } as Record<string, unknown>);
  return { ok: r.ok, status: r.status, body: b };
}

async function httpDel(path: string, jwt: string): Promise<number> {
  const r = await fetch(`${API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return r.status;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Detectors ─────────────────────────────────────────────────────────────────

const SPEECH_TAG_RE = /[\[<](pause|sigh|soft|slow|laugh|chuckle|hmm)/i;

function hasSpeechTag(text: string): boolean {
  return SPEECH_TAG_RE.test(text);
}

function speechTagsFound(text: string): string[] {
  const matches: string[] = [];
  const re = /[\[<][a-z]+[\]>]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) matches.push(m[0]);
  return matches;
}

// Markers that mean the AI is STILL asking the same narrow question
// (Lua atomicity / hash-slot failover) from the original opening.
const SAME_QUESTION_MARKERS = [
  /lua\s*(script|call|eval|operation|atomic)/i,
  /hash.?slot/i,
  /hash\s+slot/i,
  /failover/i,
  /atomic\s*(compare|operation|swap|check)/i,
  /compare.and.swap/i,
  /atomicit/i,
  /thundering\s+herd/i,
  /sliding.window/i,
  /token.bucket/i,
  /rate.limit/i,
];

function isSameQuestion(text: string): boolean {
  return SAME_QUESTION_MARKERS.some((p) => p.test(text));
}

// Deterministic pivot line the server injects after exhausting beats
const PIVOT_LINE_RE =
  /no\s+problem\s*[—–-]*\s*let'?s\s+move\s+to\s+something\s+else/i;

function isPivotLine(text: string): boolean {
  return PIVOT_LINE_RE.test(text);
}

// Acknowledgment patterns: the AI references what the candidate just said
// before redirecting (two-beat shape).
const ACK_PATTERNS = [
  /i\s+hear\s+(you|that)/i,
  /i\s+(see|notice)\s+(you|that)/i,
  /you('ve|\s+have)\s+(mentioned|described|talked\s+about|covered|shared)/i,
  /that('s|\s+is)\s+(helpful|good|useful|interesting|noted|great)/i,
  /appreciate\s+(that|the|your)/i,
  /good\s+(point|context|background|detail)/i,
  /noted\b/i,
  /understood\b/i,
  /got\s+it\b/i,
  /fair\s+enough/i,
  /while\s+(that|those|this)\s+(is|are|was|were)/i,
  /i\s+want\s+to\s+(come\s+back|return|focus|zero\s+in|drill)/i,
  /let('s|\s+us)\s+(come\s+back|return|focus|drill)/i,
  /that\s+(said|aside|noted)/i,
  /specifically\s+(asking|about|regarding|interested\s+in)/i,
  /what\s+i('m|\s+am)\s+(really\s+)?(asking|looking\s+for)/i,
  /back\s+to\s+(my|the)\s+(question|original)/i,
  /let\s+me\s+(be\s+more\s+specific|rephrase|refocus|ask\s+more\s+directly)/i,
  /rather\s+than\s+(the|your|how)/i,
  /instead\s+of\s+(focus|discussing|talking)/i,
];

function acknowledgesDodge(text: string): boolean {
  return ACK_PATTERNS.some((p) => p.test(text));
}

// ── Step tracker ──────────────────────────────────────────────────────────────

interface StepResult {
  label: string;
  pass: boolean;
  note?: string;
}
const steps: StepResult[] = [];

function step(label: string, pass: boolean, note?: string): void {
  steps.push({ label, pass, note });
  console.log(`\n  ${pass ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== INDISTINGUISHABILITY TEST #4 — HEAD 8b0c53ce ===');
  console.log(`  Backend  : ${API}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('  Scenario : IDENTICAL to pass #3 (Redis/Lua opening + 3 off-topic dodges)\n');

  // ── Auth + create ─────────────────────────────────────────────────────────────
  console.log('[1] Auth + create dev interview');
  const jwt = await getAccessToken();
  const cr = await httpPost(
    '/api/interviews',
    {
      candidateEmail: 'dodge-test-4@overforge.local',
      candidateName: 'Sam (structural repeat guard — pass 4)',
      language: LANG,
      level: 'mid',
      devMode: true,
    },
    jwt,
  );
  if (!cr.ok) throw new Error(`create: ${cr.status} ${JSON.stringify(cr.body)}`);
  const { id, token: inv } = cr.body as { id: string; token: string };
  console.log(`  interview.id = ${id}`);

  // ── Begin ─────────────────────────────────────────────────────────────────────
  console.log('\n[2] Begin');
  const br = await httpPost(`/api/interviews/${id}/begin`, { token: inv, tncAccepted: true });
  if (!br.ok) throw new Error(`begin: ${br.status} ${JSON.stringify(br.body)}`);
  const { sessionToken, utterance: greet, phase: startPhase } = br.body as {
    sessionToken: string;
    utterance: { text: string };
    phase: string;
  };
  const tok = sessionToken;
  rec('ai', greet.text, 'greeting');
  console.log(`  start phase: ${startPhase}`);

  // ── Opening answer (identical to pass #3) ────────────────────────────────────
  console.log('\n[3] Opening answer (establishes the Redis/Lua project)');

  const OPENING_ANSWER =
    'I designed a distributed rate-limiter for our API gateway: sliding-window counters ' +
    'in Redis, token-bucket fallback for burst traffic, and a Lua script for atomic ' +
    'compare-and-swap to prevent thundering herds. The main challenge was ensuring the ' +
    'Lua atomicity held under Redis Cluster hash-slot splits during failover.';

  rec('candidate', OPENING_ANSWER);
  const r0 = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: OPENING_ANSWER });
  const { utterance: q1Utterance, phase: ph0 } = r0.body as {
    utterance: { text: string };
    phase: string;
  };
  const q1Text = q1Utterance?.text ?? '';
  if (q1Text) rec('ai', q1Text, 'oral');
  console.log(`  phase after opening: ${ph0}`);

  // ── Dodge sequence (identical to pass #3) ────────────────────────────────────
  console.log('\n[4] DODGE SEQUENCE — 3 plausible off-topic answers\n');

  const DODGE_ANSWERS = [
    // Dodge #1 — deployment topology instead of Lua atomicity
    'We ran three Redis Cluster nodes across two AZs with a Sentinel setup for quorum. ' +
      'The cluster had six shards, each with a primary and replica. Deployment was on EKS ' +
      'with a Helm chart we maintained — zero-downtime rolling updates, about 4-minute P99.',

    // Dodge #2 — monitoring instead of the specific mechanism
    'We had Prometheus + Grafana dashboards tracking p50/p99 latency per endpoint, plus ' +
      'custom counters for rate-limit hits and token-bucket exhaustion events. On-call SLO ' +
      'was 99.95% across the quarter. Alerts fired to PagerDuty via Alertmanager.',

    // Dodge #3 — team process instead of technical detail
    'The team was four engineers. We ran two-week sprints with a rotating on-call. ' +
      'Post-mortems were blameless — every incident got a five-why analysis. I led the ' +
      'retrospectives and maintained the runbook for the rate-limiter component.',
  ];

  // Per-dodge tracking: full text, ms, ack, same-question flag, pivot flag
  interface DodgeReply {
    text: string;
    ms: number;
    acks: boolean;
    isSameQ: boolean;
    isPivot: boolean;
    tagLeak: boolean;
    underMs: boolean;
  }
  const dodgeReplies: DodgeReply[] = [];

  let currentPhase = ph0;

  for (let d = 0; d < DODGE_ANSWERS.length; d++) {
    const ans = DODGE_ANSWERS[d]!;
    const tBefore = Date.now();
    rec('candidate', ans);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { utterance: reply, phase: newPhase } = ar.body as {
      utterance: { text: string };
      phase: string;
    };
    const replyText = reply?.text ?? '';
    const replyMs = Date.now() - tBefore;
    currentPhase = newPhase;

    if (replyText) {
      lastTs = Date.now() - replyMs;
      rec('ai', replyText, 'oral');
      dodgeReplies.push({
        text: replyText,
        ms: replyMs,
        acks: acknowledgesDodge(replyText),
        isSameQ: isSameQuestion(replyText),
        isPivot: isPivotLine(replyText),
        tagLeak: hasSpeechTag(replyText),
        underMs: replyMs < 800,
      });
      console.log(
        `  dodge #${d + 1}: phase=${newPhase}  sameQ=${isSameQuestion(replyText)}  ` +
        `acks=${acknowledgesDodge(replyText)}  pivot=${isPivotLine(replyText)}  ` +
        `ms=${replyMs}`,
      );
    } else {
      console.log(`  dodge #${d + 1}: no reply text  phase=${newPhase}`);
    }

    if (newPhase === 'coding' || newPhase === 'done') {
      console.log(`  [NOTE] advanced to ${newPhase} after dodge #${d + 1}`);
      break;
    }
    await sleep(300);
  }

  // ── Advance to coding with genuine answers ───────────────────────────────────
  console.log('\n[5] Genuine answers to advance to coding phase...');

  const GENUINE_ANSWERS = [
    'The Lua script ran EVAL on the Redis primary for the relevant hash slot. In a Cluster failover ' +
      'the new primary started without the in-flight Lua context, so we had a brief window where the ' +
      'atomic compare-and-swap would fail and fall back to a non-atomic multi-key check. We resolved ' +
      'this by routing the EVAL to the same slot via key tagging {rate_limit} to force single-shard placement.',
    'Memory usage was the other constraint — each sliding-window entry was a Redis sorted set with ' +
      'millisecond timestamps as scores. For 10k requests/min per key, a 60-second window held ~167 entries. ' +
      'At 100k unique API keys, that was ~16 MB per minute — well within our 2 GB budget, but we added ' +
      'TTL-based expiry via EXPIREAT keyed off the window end to reclaim memory proactively.',
    'I would use a monotonic sequence number instead of wall-clock timestamps to eliminate ' +
      'the clock-skew issue entirely — the counter becomes the authoritative tick source and ' +
      'clock drift between nodes becomes irrelevant for ordering.',
  ];

  // Track ALL oral AI turns during the genuine phase too, for the same-question count
  const genuineOralTurns: { text: string; isSameQ: boolean }[] = [];
  let genuineTurns = 0;

  while (!['coding', 'done'].includes(currentPhase) && genuineTurns < 10) {
    const ans = GENUINE_ANSWERS[genuineTurns % GENUINE_ANSWERS.length]!;
    rec('candidate', ans);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { utterance: reply, phase: np } = ar.body as {
      utterance: { text: string };
      phase: string;
    };
    const replyText = reply?.text ?? '';
    if (replyText) {
      rec('ai', replyText, 'oral');
      genuineOralTurns.push({ text: replyText, isSameQ: isSameQuestion(replyText) });
    }
    currentPhase = np;
    genuineTurns++;
    console.log(`  genuine turn ${genuineTurns}: phase=${currentPhase}  sameQ=${isSameQuestion(replyText)}`);
    if (currentPhase === 'coding') break;
    await sleep(300);
  }

  step('Reached coding phase', currentPhase === 'coding', `phase=${currentPhase} after ${genuineTurns} genuine turns`);

  // ── Delete ────────────────────────────────────────────────────────────────────
  console.log('\n[6] Delete test interview');
  const ds = await httpDel(`/api/interviews/${id}`, jwt);
  console.log(`  DELETE status=${ds}`);
  step('Interview deleted (200/204)', ds === 200 || ds === 204, `status=${ds}`);

  // ── C1: Same-question count ───────────────────────────────────────────────────
  //
  // Count every AI oral turn that is asking the "same narrow question"
  // (still about Lua atomicity / hash-slot failover / rate-limiter mechanism).
  // This includes Q1 itself + any rephrase during dodges + any during genuine phase.
  // Deterministic pivot line is NOT same-question (it pivots away).
  //
  // PASS: count ≤ 3  (initial ask + at most 2 follow-up beats)
  // ALSO: once the machine issues its first non-same-Q oral turn, that turn must be
  // about a genuinely different topic (different tech area, not just a hedge).

  const q1IsSameQ = isSameQuestion(q1Text);

  // All oral turns from the AI after the opening answer (dodge phase + genuine phase)
  const allOralAfterOpening: { text: string; isSameQ: boolean; source: string }[] = [];

  if (q1IsSameQ) {
    allOralAfterOpening.push({ text: q1Text, isSameQ: true, source: 'Q1-after-opening' });
  } else {
    allOralAfterOpening.push({ text: q1Text, isSameQ: false, source: 'Q1-after-opening' });
  }

  dodgeReplies.forEach((dr, i) => {
    allOralAfterOpening.push({ text: dr.text, isSameQ: dr.isSameQ, source: `dodge-reply-${i + 1}` });
  });

  genuineOralTurns.forEach((gt, i) => {
    allOralAfterOpening.push({ text: gt.text, isSameQ: gt.isSameQ, source: `genuine-${i + 1}` });
  });

  const sameQCount = allOralAfterOpening.filter((t) => t.isSameQ).length;

  // Find the first oral turn that is NOT same-question → that is "Q2"
  const firstNewTopicIdx = allOralAfterOpening.findIndex((t) => !t.isSameQ);
  const firstNewTopicTurn =
    firstNewTopicIdx >= 0 ? allOralAfterOpening[firstNewTopicIdx] : null;

  // Q2 genuinely changes topic if: the turn is not same-question AND is either the
  // deterministic pivot line OR contains topic keywords unrelated to rate-limiting.
  const RATE_LIMIT_DOMAIN = /rate.limit|redis|token.bucket|sliding.window|thundering|lua|hash.?slot|failover|atomicit/i;
  const q2GenuinelyChanged =
    firstNewTopicTurn !== null &&
    !firstNewTopicTurn.isSameQ &&
    // doesn't still hug the rate-limiter domain even without the exact keywords
    !RATE_LIMIT_DOMAIN.test(firstNewTopicTurn.text);

  console.log('\n[ANALYSIS] C1 — Same-question count');
  console.log(`  Q1 is same-question: ${q1IsSameQ}`);
  allOralAfterOpening.forEach((t, i) =>
    console.log(`  [${t.source}] sameQ=${t.isSameQ}  pivot=${isPivotLine(t.text)}  "${t.text.slice(0, 120)}"`)
  );
  console.log(`  TOTAL same-question turns: ${sameQCount}  (baseline pass #3: 6)`);
  console.log(`  First new-topic turn: ${firstNewTopicTurn ? `[${firstNewTopicTurn.source}] "${firstNewTopicTurn.text.slice(0, 120)}"` : 'none'}`);
  console.log(`  Q2 genuinely changed topic: ${q2GenuinelyChanged}`);

  step(
    'C1a: Same narrow question appears ≤ 3 times total',
    sameQCount <= 3,
    `${sameQCount} occurrences (baseline 6, target ≤3)`,
  );
  step(
    'C1b: Once machine moves to Q#2, topic genuinely changes (different tech area)',
    q2GenuinelyChanged || firstNewTopicTurn === null,
    firstNewTopicTurn
      ? `"${firstNewTopicTurn.text.slice(0, 180)}"`
      : 'no new-topic turn seen yet',
  );

  // ── C2: Two-beat ack — report only (no fail) ─────────────────────────────────
  console.log('\n[ANALYSIS] C2 — Two-beat acknowledgment (report, not graded)');
  dodgeReplies.forEach((dr, i) => {
    console.log(
      `  Dodge reply #${i + 1}: acks=${dr.acks}  "${dr.text.slice(0, 140)}"`,
    );
  });
  const ackingReplies = dodgeReplies.filter((dr) => dr.acks);
  console.log(
    `  Replies acknowledging the candidate's actual answer: ${ackingReplies.length}/${dodgeReplies.length}`,
  );

  // ── C3: No speech tags ────────────────────────────────────────────────────────
  const allAiTurns = log.filter((t) => t.role === 'ai');
  const tagLeakTurns = allAiTurns.filter((t) => hasSpeechTag(t.text));
  const dodgeTagLeaks = dodgeReplies.filter((dr) => dr.tagLeak);

  step(
    'C3: No speech tags in any AI oral turn (T1 regression)',
    tagLeakTurns.length === 0,
    tagLeakTurns.length > 0
      ? `LEAKED in: ${tagLeakTurns.map((t) => `${t.kind}:"${speechTagsFound(t.text).join(',')}"`).join('; ')}`
      : 'clean',
  );

  // ── C4: No sub-800ms oral replies ────────────────────────────────────────────
  const fastDodgeReplies = dodgeReplies.filter((dr) => dr.underMs);
  const fastOralTurns = allAiTurns.filter(
    (t) => t.kind === 'oral' && t.ms < 800 && t.kind !== 'greeting',
  );

  step(
    'C4: No sub-800ms AI oral replies (T3 regression)',
    fastOralTurns.length === 0,
    fastOralTurns.length > 0
      ? `${fastOralTurns.map((t) => t.ms + 'ms').join(', ')}`
      : 'all ≥800ms',
  );

  // ── Oral repetition analysis (same metric as prior passes) ────────────────────
  const oralTurns = log.filter((t) => t.role === 'ai' && t.kind === 'oral');
  const distinctOral = new Set(oralTurns.map((t) => t.text.slice(0, 80))).size;
  const repetitionRatio = oralTurns.length > 0 ? distinctOral / oralTurns.length : 1;

  // ── Build verbatim transcript ─────────────────────────────────────────────────
  const transcriptText = log
    .map((t, i) => {
      const prefix = t.role === 'ai' ? `AI[${t.kind ?? '-'}]` : `CAND`;
      const extras: string[] = [];
      if (t.role === 'ai' && t.kind === 'oral') {
        extras.push(`sameQ=${isSameQuestion(t.text)}`);
        extras.push(`acks=${acknowledgesDodge(t.text)}`);
        extras.push(`pivot=${isPivotLine(t.text)}`);
        if (hasSpeechTag(t.text)) extras.push(`SPEECH_TAG_LEAK`);
        if (t.ms < 800 && t.kind !== 'greeting') extras.push(`UNDER_800ms`);
      }
      const meta = extras.length ? `  [${extras.join(', ')}]` : '';
      return `#${i + 1}  ${prefix} (+${t.ms}ms):${meta}\n  "${t.text.slice(0, 600)}"`;
    })
    .join('\n\n');

  // ── Per-dodge reply verdicts ──────────────────────────────────────────────────
  const perDodgeVerdicts = dodgeReplies
    .map(
      (dr, i) =>
        `Dodge reply #${i + 1} (+${dr.ms}ms):\n` +
        `  sameQ=${dr.isSameQ}  acks=${dr.acks}  pivot=${dr.isPivot}  tagLeak=${dr.tagLeak}  under800ms=${dr.underMs}\n` +
        `  "${dr.text.slice(0, 500)}"`,
    )
    .join('\n\n');

  // ── Final summary ─────────────────────────────────────────────────────────────
  console.log('\n=== FINAL PASS/FAIL SUMMARY ===');
  steps.forEach((s) =>
    console.log(`  ${s.pass ? 'PASS' : 'FAIL'}  ${s.label}${s.note ? ' — ' + s.note : ''}`),
  );
  const passCount = steps.filter((s) => s.pass).length;
  const failCount = steps.filter((s) => !s.pass).length;
  console.log(`\n  ${passCount} PASS  /  ${failCount} FAIL  /  ${steps.length} total`);

  // ── Write report ──────────────────────────────────────────────────────────────
  const report = `# Indistinguishability Report #4 — ${new Date().toISOString()}
## Backend: ${API}  HEAD: 8b0c53ce
## Interview ID (deleted): ${id}
## Structural repeat guard: semantic keyword overlap check → banned-term retry → deterministic pivot

---

## PER-CHECK PASS/FAIL TABLE

${steps.map((s) => `${s.pass ? 'PASS' : 'FAIL'}  ${s.label}${s.note ? ' — ' + s.note : ''}`).join('\n')}

---

## C1 — SAME-QUESTION COUNT vs BASELINE

Pass #3 baseline: 6 occurrences of same narrow question
Pass #4 count  : ${sameQCount}

Per-turn breakdown:
${allOralAfterOpening
  .map(
    (t) =>
      `  [${t.source}] sameQ=${t.isSameQ}  pivot=${isPivotLine(t.text)}\n` +
      `    "${t.text.slice(0, 200)}"`,
  )
  .join('\n')}

First new-topic turn (Q#2 candidate):
${firstNewTopicTurn
  ? `  [${firstNewTopicTurn.source}] genuinelyChanged=${q2GenuinelyChanged}\n  "${firstNewTopicTurn.text.slice(0, 300)}"`
  : '  (none seen — interview may not have pivoted)'}

---

## C2 — TWO-BEAT ACKNOWLEDGMENT (report only — not graded)

Replies that acknowledged what the candidate DID say: ${ackingReplies.length}/${dodgeReplies.length}

${perDodgeVerdicts}

---

## C3+C4 — REGRESSIONS

Speech tags (T1): ${tagLeakTurns.length === 0 ? 'PASS — none' : 'FAIL — ' + tagLeakTurns.map((t) => t.text.slice(0, 80)).join(' | ')}
Sub-800ms oral replies (T3): ${fastOralTurns.length === 0 ? 'PASS — all ≥800ms' : 'FAIL — ' + fastOralTurns.map((t) => t.ms + 'ms').join(', ')}

All AI turn timings:
${allAiTurns.map((t) => `  ${t.kind ?? '-'}: ${t.ms}ms${t.ms < 800 && t.kind !== 'greeting' ? ' *** UNDER 800ms ***' : ''}`).join('\n')}

---

## ORAL REPETITION ANALYSIS

Total oral AI turns: ${oralTurns.length}
Distinct (by first 80 chars): ${distinctOral}
Distinctness ratio: ${repetitionRatio.toFixed(2)}
Loop tell: ${oralTurns.length > 2 && repetitionRatio < 0.6 ? 'YES — ratio < 0.6' : 'NO'}

---

## FULL VERBATIM TRANSCRIPT

${transcriptText}
`;

  const fs = await import('fs');
  fs.writeFileSync('/tmp/indistinguishability-report-4.md', report, 'utf8');
  console.log('\nReport written to /tmp/indistinguishability-report-4.md');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
