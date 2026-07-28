// Indistinguishability test #5 — current HEAD (cluster-cap + bridge-variance)
// Verifies:
//   (a) INTERVIEW-WIDE topic-cluster cap: Lua/failover cluster ≤ 3 interviewer turns
//       after which the machine MUST move to a genuinely different technical area.
//   (b) Bridge-phrase variance mandate: no bridge phrase (≥4 words) repeats verbatim
//       across any two AI oral turns.
//   (c) No speech tags (T1 regression — always).
//   (d) Timing is N/A this pass: the timing floor is enforced client-side; raw API
//       timings <800ms are expected and NOT a failure. Reported but not graded.
//
// IDENTICAL dodge scenario to pass #3 and #4:
//   Opening: Redis/Lua rate-limiter with hash-slot atomicity challenge.
//   Dodge #1: deployment topology (EKS/Sentinel).
//   Dodge #2: monitoring (Prometheus/Grafana).
//   Dodge #3: team process (sprints/post-mortems).
//   Then: genuine Lua-atomicity answers until coding phase.
//
// Judging:
//   C1  Lua/failover CLUSTER SIZE ≤ 3 (initial Q + follow-up beats).
//       Deterministic pivot line ("No problem — let's move to something else…") counts
//       as a topic change and is excluded from the cluster.
//       Baselines: pass#3 = 6, pass#4 = 6.  PASS threshold = ≤ 3.
//   C2  At least one later turn is a genuinely different technical area (Q#2 probe).
//   C3  No bridge phrase ≥ 4 words repeats verbatim in two different oral turns.
//   C4  No speech tags (T1 regression).
//   C5  Timing reported but verdict = N/A (client-side floor bypassed by API).
//
// Run: OF_TEST_PASSWORD='...' npx tsx playwright/scripts/indistinguishability-5.ts

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
  console.log(`\n${prefix} (+${ms}ms)\n  "${text.trim().slice(0, 420)}"`);
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

// Speech-tag leak (T1 regression — always checked).
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

// Markers for "same narrow question" — Lua/hash-slot/failover/rate-limiter topic cluster.
const SAME_CLUSTER_MARKERS = [
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
  /rate\s+limiter/i,
];
function isInLuaCluster(text: string): boolean {
  return SAME_CLUSTER_MARKERS.some((p) => p.test(text));
}

// Deterministic pivot line the server injects after exhausting retry beats.
const PIVOT_LINE_RE = /no\s+problem\s*[—–-]*\s*let'?s\s+move\s+to\s+something\s+else/i;
function isPivotLine(text: string): boolean {
  return PIVOT_LINE_RE.test(text);
}

// Rate-limiter / Redis domain — broader check for whether Q#2 is STILL in the same domain.
const RATE_LIMIT_DOMAIN_RE =
  /rate.limit|redis|token.bucket|sliding.window|thundering|lua|hash.?slot|failover|atomicit/i;
function isStillRateLimiterDomain(text: string): boolean {
  return RATE_LIMIT_DOMAIN_RE.test(text);
}

// Two-beat acknowledgment patterns (reported but not graded in C3).
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

// ── Bridge-phrase extraction ──────────────────────────────────────────────────
//
// A bridge phrase is the connecting tissue between the acknowledgment beat and
// the redirect/question beat. Typically a sentence or clause beginning with a
// contrastive connector ("That said,", "However,", "But I'd like to...",
// "Let me bring us back to...", "I want to focus specifically on...").
//
// Strategy: split into sentences, find sentences containing a bridge-opener,
// normalise whitespace + lowercase, keep phrases ≥ 4 words for comparison.

const BRIDGE_OPENER_RE =
  /^(that\s+said|however|but\s+(i|let|can)|nevertheless|yet\s+i|still\s+i|i\s+(want|need|would\s+like)\s+to|let\s+me\s+(bring|take|ask|refocus|be\s+more)|let'?s\s+(come\s+back|return|focus|move\s+on)|back\s+to|specifically\s+(i|i'm|i'd|let)|what\s+i('m|\s+am)|i'm\s+(specifically|really)|i\s+(notice|see|hear)|can\s+you\s+(bring|walk|take))/i;

function extractBridgePhrases(text: string): string[] {
  // Split on sentence boundaries (period/exclamation/question followed by space+capital, or newlines).
  const sentences = text
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const bridges: string[] = [];
  for (const sentence of sentences) {
    if (BRIDGE_OPENER_RE.test(sentence)) {
      // Normalise for comparison: lowercase, collapse whitespace, strip trailing punctuation.
      const normalised = sentence
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.!?,;:]+$/, '')
        .trim();
      if (normalised.split(' ').length >= 4) {
        bridges.push(normalised);
      }
    }
  }
  return bridges;
}

// Check if any bridge phrase appears verbatim in ≥ 2 AI oral turns.
// Returns { repeated: boolean; duplicates: string[] }.
function findRepeatedBridgePhrases(
  oralTurns: string[],
): { repeated: boolean; duplicates: string[] } {
  const phraseToCount = new Map<string, number>();
  for (const turnText of oralTurns) {
    const bridges = extractBridgePhrases(turnText);
    // Deduplicate within a single turn before counting (avoid self-match).
    const seen = new Set<string>();
    for (const bp of bridges) {
      if (!seen.has(bp)) {
        seen.add(bp);
        phraseToCount.set(bp, (phraseToCount.get(bp) ?? 0) + 1);
      }
    }
  }
  const duplicates: string[] = [];
  phraseToCount.forEach((count, phrase) => {
    if (count >= 2) duplicates.push(`"${phrase}" (×${count})`);
  });
  return { repeated: duplicates.length > 0, duplicates };
}

// ── Step tracker ──────────────────────────────────────────────────────────────

interface StepResult {
  label: string;
  pass: boolean | 'N/A';
  note?: string;
}
const steps: StepResult[] = [];

function step(label: string, pass: boolean | 'N/A', note?: string): void {
  steps.push({ label, pass, note });
  const verdict = pass === 'N/A' ? 'N/A ' : pass ? 'PASS' : 'FAIL';
  console.log(`\n  ${verdict}  ${label}${note ? ' — ' + note : ''}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== INDISTINGUISHABILITY TEST #5 — cluster-cap + bridge-variance ===');
  console.log(`  Backend  : ${API}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('  Scenario : IDENTICAL to pass #3/#4 (Redis/Lua opening + 3 off-topic dodges)');
  console.log('  Timing   : N/A this pass (floor is client-side; API-first bypasses room)\n');

  // ── Auth + create ─────────────────────────────────────────────────────────────
  console.log('[1] Auth + create dev interview');
  const jwt = await getAccessToken();
  const cr = await httpPost(
    '/api/interviews',
    {
      candidateEmail: 'dodge-test-5@overforge.local',
      candidateName: 'Sam (cluster-cap + bridge-variance — pass 5)',
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

  // ── Opening answer (identical to pass #3 / #4) ───────────────────────────────
  console.log('\n[3] Opening answer — establishes the Redis/Lua rate-limiter project');

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
  console.log(
    `  Q1 in Lua cluster: ${isInLuaCluster(q1Text)}  pivot: ${isPivotLine(q1Text)}`,
  );

  // ── Dodge sequence (identical to pass #3 / #4) ───────────────────────────────
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

  interface DodgeReply {
    text: string;
    ms: number;
    inCluster: boolean;
    isPivot: boolean;
    acks: boolean;
    tagLeak: boolean;
    bridgePhrases: string[];
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
      const bridges = extractBridgePhrases(replyText);
      dodgeReplies.push({
        text: replyText,
        ms: replyMs,
        inCluster: isInLuaCluster(replyText) && !isPivotLine(replyText),
        isPivot: isPivotLine(replyText),
        acks: acknowledgesDodge(replyText),
        tagLeak: hasSpeechTag(replyText),
        bridgePhrases: bridges,
      });
      console.log(
        `  dodge #${d + 1}: phase=${newPhase}  inCluster=${isInLuaCluster(replyText) && !isPivotLine(replyText)}  ` +
        `pivot=${isPivotLine(replyText)}  acks=${acknowledgesDodge(replyText)}  ms=${replyMs}`,
      );
      if (bridges.length > 0) {
        console.log(`    bridge phrases: ${bridges.map((b) => `"${b}"`).join(' | ')}`);
      }
    } else {
      console.log(`  dodge #${d + 1}: no reply text  phase=${newPhase}`);
    }

    if (newPhase === 'coding' || newPhase === 'done') {
      console.log(`  [NOTE] advanced to ${newPhase} after dodge #${d + 1}`);
      break;
    }
    await sleep(300);
  }

  // ── Genuine answers → coding phase ──────────────────────────────────────────
  console.log('\n[5] Genuine Lua-atomicity answers until coding phase...');

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

  interface GenuineOral {
    text: string;
    inCluster: boolean;
    isPivot: boolean;
    isNewArea: boolean;
    ms: number;
    bridgePhrases: string[];
  }
  const genuineOral: GenuineOral[] = [];
  let genuineTurns = 0;

  while (!['coding', 'done'].includes(currentPhase) && genuineTurns < 10) {
    const ans = GENUINE_ANSWERS[genuineTurns % GENUINE_ANSWERS.length]!;
    const tBefore = Date.now();
    rec('candidate', ans);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { utterance: reply, phase: np } = ar.body as {
      utterance: { text: string };
      phase: string;
    };
    const replyText = reply?.text ?? '';
    const replyMs = Date.now() - tBefore;
    if (replyText) {
      lastTs = Date.now() - replyMs;
      rec('ai', replyText, 'oral');
      const inCluster = isInLuaCluster(replyText) && !isPivotLine(replyText);
      const isNewArea = !isStillRateLimiterDomain(replyText) && !inCluster;
      const bridges = extractBridgePhrases(replyText);
      genuineOral.push({
        text: replyText,
        inCluster,
        isPivot: isPivotLine(replyText),
        isNewArea,
        ms: replyMs,
        bridgePhrases: bridges,
      });
      console.log(
        `  genuine turn ${genuineTurns + 1}: phase=${np}  inCluster=${inCluster}  ` +
        `pivot=${isPivotLine(replyText)}  newArea=${isNewArea}  ms=${replyMs}`,
      );
    }
    currentPhase = np;
    genuineTurns++;
    if (currentPhase === 'coding') break;
    await sleep(300);
  }

  step('Reached coding phase', currentPhase === 'coding', `phase=${currentPhase} after ${genuineTurns} genuine turns`);

  // ── Delete ────────────────────────────────────────────────────────────────────
  console.log('\n[6] Delete test interview');
  const ds = await httpDel(`/api/interviews/${id}`, jwt);
  console.log(`  DELETE status=${ds}`);
  step('Interview deleted (200/204)', ds === 200 || ds === 204, `status=${ds}`);

  // ── C1: Lua/failover cluster size ────────────────────────────────────────────
  //
  // Cluster members = AI oral turns that (a) contain Lua/failover markers AND (b) are NOT
  // the deterministic pivot line (which resolves the cluster, not extends it).
  //
  // Sequence: Q1 (from opening) + dodge replies + genuine oral turns.
  // The pivot line itself terminates the cluster; it is NOT a member.

  console.log('\n[ANALYSIS] C1 — Lua/failover cluster size');

  interface OralAudit {
    text: string;
    inCluster: boolean;
    isPivot: boolean;
    isNewArea: boolean;
    source: string;
    ms: number;
  }

  const allOral: OralAudit[] = [];

  // Q1 (first AI question after the opening answer)
  if (q1Text) {
    const inCluster = isInLuaCluster(q1Text) && !isPivotLine(q1Text);
    allOral.push({
      text: q1Text,
      inCluster,
      isPivot: isPivotLine(q1Text),
      isNewArea: !isStillRateLimiterDomain(q1Text) && !inCluster,
      source: 'Q1-after-opening',
      ms: log.find((t) => t.role === 'ai' && t.kind === 'oral')?.ms ?? 0,
    });
  }

  dodgeReplies.forEach((dr, i) => {
    allOral.push({
      text: dr.text,
      inCluster: dr.inCluster,
      isPivot: dr.isPivot,
      isNewArea: !isStillRateLimiterDomain(dr.text) && !dr.inCluster && !dr.isPivot,
      source: `dodge-reply-${i + 1}`,
      ms: dr.ms,
    });
  });

  genuineOral.forEach((go, i) => {
    allOral.push({
      text: go.text,
      inCluster: go.inCluster,
      isPivot: go.isPivot,
      isNewArea: go.isNewArea,
      source: `genuine-${i + 1}`,
      ms: go.ms,
    });
  });

  const clusterSize = allOral.filter((t) => t.inCluster).length;
  const pivotTurns = allOral.filter((t) => t.isPivot);
  const newAreaTurns = allOral.filter((t) => t.isNewArea);

  console.log(`  Lua/failover cluster size: ${clusterSize}  (baselines: pass#3=6, pass#4=6)  cap=3`);
  console.log(`  Deterministic pivot turns: ${pivotTurns.length}`);
  console.log(`  Genuinely new-area turns : ${newAreaTurns.length}`);
  console.log('\n  Per-turn audit:');
  allOral.forEach((t) => {
    console.log(
      `    [${t.source}] inCluster=${t.inCluster}  pivot=${t.isPivot}  newArea=${t.isNewArea}  ms=${t.ms}\n` +
      `      "${t.text.slice(0, 160)}"`,
    );
  });

  step(
    'C1: Lua/failover cluster ≤ 3 interviewer turns (cap)',
    clusterSize <= 3,
    `cluster size = ${clusterSize}  (baselines: pass#3=6, pass#4=6; cap=3)`,
  );

  // C2: At least one later turn is a genuinely different technical area.
  // "Later" = after at least one cluster member has appeared.
  const firstClusterIdx = allOral.findIndex((t) => t.inCluster);
  const newAreaAfterCluster =
    firstClusterIdx >= 0 &&
    allOral.slice(firstClusterIdx + 1).some((t) => t.isNewArea || t.isPivot);

  // Also check the pivot line counts as "different area" for C2
  const pivotOrNewAreaAfterCluster =
    firstClusterIdx >= 0 &&
    allOral.slice(firstClusterIdx + 1).some((t) => t.isPivot || t.isNewArea);

  console.log('\n[ANALYSIS] C2 — New technical area after cluster');
  if (firstClusterIdx >= 0) {
    console.log(`  First cluster member at index ${firstClusterIdx} [${allOral[firstClusterIdx]?.source}]`);
    console.log(
      `  Turns after first cluster member: ${allOral.slice(firstClusterIdx + 1).length}`,
    );
    console.log(
      `  New-area or pivot after cluster: ${pivotOrNewAreaAfterCluster}`,
    );
    const firstNewOrPivot = allOral.slice(firstClusterIdx + 1).find((t) => t.isNewArea || t.isPivot);
    if (firstNewOrPivot) {
      console.log(
        `  First qualifying turn: [${firstNewOrPivot.source}] pivot=${firstNewOrPivot.isPivot} newArea=${firstNewOrPivot.isNewArea}\n` +
        `    "${firstNewOrPivot.text.slice(0, 200)}"`,
      );
    }
  } else {
    console.log('  No cluster member seen — C2 trivially passes (cluster never opened).');
  }

  step(
    'C2: At least one later turn is genuinely different technical area (or pivot)',
    firstClusterIdx < 0 || pivotOrNewAreaAfterCluster,
    firstClusterIdx < 0
      ? 'cluster never opened'
      : pivotOrNewAreaAfterCluster
        ? 'new-area / pivot confirmed'
        : 'NO new area seen after cluster — still in rate-limiter domain',
  );

  // ── C3: Bridge-phrase variance ────────────────────────────────────────────────
  console.log('\n[ANALYSIS] C3 — Bridge-phrase variance');

  const allOralTexts = allOral.map((t) => t.text);
  const { repeated, duplicates } = findRepeatedBridgePhrases(allOralTexts);

  // Also log per-turn bridge phrases for manual inspection.
  allOral.forEach((t) => {
    const bps = extractBridgePhrases(t.text);
    if (bps.length > 0) {
      console.log(
        `  [${t.source}] bridge phrases: ${bps.map((b) => `"${b}"`).join(' | ')}`,
      );
    }
  });
  if (!repeated) {
    console.log('  No verbatim bridge-phrase repeats found.');
  } else {
    console.log(`  REPEATED BRIDGE PHRASES:\n  ${duplicates.join('\n  ')}`);
  }

  step(
    'C3: No bridge phrase ≥4 words repeats verbatim across two oral turns',
    !repeated,
    repeated
      ? `FAIL — ${duplicates.join('; ')}`
      : 'all bridge phrases are distinct',
  );

  // ── C4: No speech tags (T1 regression) ───────────────────────────────────────
  const allAiTurns = log.filter((t) => t.role === 'ai');
  const tagLeakTurns = allAiTurns.filter((t) => hasSpeechTag(t.text));

  step(
    'C4: No speech tags in any AI turn (T1 regression)',
    tagLeakTurns.length === 0,
    tagLeakTurns.length > 0
      ? `LEAKED: ${tagLeakTurns.map((t) => `${t.kind}: ${speechTagsFound(t.text).join(',')}`).join('; ')}`
      : 'clean',
  );

  // ── C5: Timing — report only, verdict N/A ────────────────────────────────────
  const oralTurns = allAiTurns.filter((t) => t.kind === 'oral');
  const fastOral = oralTurns.filter((t) => t.ms < 800);

  console.log('\n[ANALYSIS] C5 — Timing (N/A — floor is client-side, API bypasses room)');
  oralTurns.forEach((t, i) => {
    const flag = t.ms < 800 ? '  <-- under 800ms (N/A — API-first)' : '';
    console.log(`  oral turn ${i + 1}: ${t.ms}ms${flag}`);
  });
  console.log(
    `  Sub-800ms oral replies: ${fastOral.length}/${oralTurns.length}  (not graded this pass)`,
  );

  step(
    'C5: Reply timing (N/A — client-side floor; API bypasses the room)',
    'N/A',
    `${fastOral.length} of ${oralTurns.length} oral turns under 800ms (reported only)`,
  );

  // ── Oral repetition (same metric as prior passes) ─────────────────────────────
  const distinctOral = new Set(oralTurns.map((t) => t.text.slice(0, 80))).size;
  const repetitionRatio = oralTurns.length > 0 ? distinctOral / oralTurns.length : 1;

  // ── Build verbatim transcript with per-turn verdicts ─────────────────────────
  const transcriptText = log
    .map((t, i) => {
      const prefix = t.role === 'ai' ? `AI[${t.kind ?? '-'}]` : `CAND`;
      const extras: string[] = [];
      if (t.role === 'ai' && t.kind === 'oral') {
        const inC = isInLuaCluster(t.text) && !isPivotLine(t.text);
        const pivot = isPivotLine(t.text);
        const newA = !isStillRateLimiterDomain(t.text) && !inC && !pivot;
        extras.push(`cluster=${inC}`);
        if (pivot) extras.push('PIVOT');
        if (newA) extras.push('NEW_AREA');
        if (acknowledgesDodge(t.text)) extras.push('acks');
        if (hasSpeechTag(t.text)) extras.push('SPEECH_TAG_LEAK');
        if (t.ms < 800) extras.push(`under800ms[N/A]`);
        const bps = extractBridgePhrases(t.text);
        if (bps.length > 0) extras.push(`bridge="${bps[0]?.slice(0, 40)}"`);
      }
      const meta = extras.length ? `  [${extras.join(', ')}]` : '';
      return `#${i + 1}  ${prefix} (+${t.ms}ms):${meta}\n  "${t.text.slice(0, 600)}"`;
    })
    .join('\n\n');

  // ── Final summary ─────────────────────────────────────────────────────────────
  console.log('\n=== FINAL PASS/FAIL SUMMARY ===');
  steps.forEach((s) => {
    const verdict = s.pass === 'N/A' ? 'N/A ' : s.pass ? 'PASS' : 'FAIL';
    console.log(`  ${verdict}  ${s.label}${s.note ? ' — ' + s.note : ''}`);
  });
  const passCount = steps.filter((s) => s.pass === true).length;
  const failCount = steps.filter((s) => s.pass === false).length;
  const naCount = steps.filter((s) => s.pass === 'N/A').length;
  console.log(`\n  ${passCount} PASS  /  ${failCount} FAIL  /  ${naCount} N/A  /  ${steps.length} total`);

  // ── Write report ──────────────────────────────────────────────────────────────
  const perDodgeVerdicts = dodgeReplies
    .map(
      (dr, i) =>
        `Dodge reply #${i + 1} (+${dr.ms}ms) [N/A timing]:\n` +
        `  inCluster=${dr.inCluster}  pivot=${dr.isPivot}  acks=${dr.acks}  tagLeak=${dr.tagLeak}\n` +
        `  bridgePhrases: ${dr.bridgePhrases.length > 0 ? dr.bridgePhrases.map((b) => `"${b}"`).join(' | ') : '(none)'}\n` +
        `  "${dr.text.slice(0, 500)}"`,
    )
    .join('\n\n');

  const clusterTableRows = allOral
    .map(
      (t) =>
        `  [${t.source}] cluster=${t.inCluster}  pivot=${t.isPivot}  newArea=${t.isNewArea}  ms=${t.ms}\n` +
        `    "${t.text.slice(0, 200)}"`,
    )
    .join('\n');

  const report = `# Indistinguishability Report #5 — ${new Date().toISOString()}
## Backend: ${API}
## Interview ID (deleted): ${id}
## Features under test: interview-wide topic-cluster cap (≤3) + bridge-phrase variance mandate
## Timing verdict: N/A (client-side floor; API-first bypasses the room)

---

## PER-CHECK PASS/FAIL TABLE

${steps.map((s) => {
  const verdict = s.pass === 'N/A' ? 'N/A ' : s.pass ? 'PASS' : 'FAIL';
  return `${verdict}  ${s.label}${s.note ? ' — ' + s.note : ''}`;
}).join('\n')}

---

## C1 — LUA/FAILOVER CLUSTER SIZE vs BASELINES

Pass #3 baseline : 6 same-question occurrences
Pass #4 baseline : 6 same-question occurrences
Pass #5 cluster  : ${clusterSize}  (cap = 3)

Per-turn cluster audit:
${clusterTableRows}

Deterministic pivot turns : ${pivotTurns.length}
${pivotTurns.map((t) => `  [${allOral.find((a) => a.text === t.text)?.source}] "${t.text.slice(0, 200)}"`).join('\n')}

Genuinely new-area turns  : ${newAreaTurns.length}
${newAreaTurns.map((t) => `  [${allOral.find((a) => a.text === t.text)?.source}] "${t.text.slice(0, 200)}"`).join('\n')}

---

## C2 — GENUINE TOPIC CHANGE AFTER CLUSTER

First cluster member: ${firstClusterIdx >= 0 ? `[${allOral[firstClusterIdx]?.source}]` : '(none)'}
New-area or pivot after cluster: ${pivotOrNewAreaAfterCluster}

${
  firstClusterIdx >= 0
    ? (() => {
        const t = allOral.slice(firstClusterIdx + 1).find((x) => x.isNewArea || x.isPivot);
        return t
          ? `First qualifying turn after cluster:\n  [${t.source}] pivot=${t.isPivot} newArea=${t.isNewArea}\n  "${t.text.slice(0, 300)}"`
          : '(no qualifying turn found after cluster)';
      })()
    : '(cluster never opened — C2 trivially passes)'
}

---

## C3 — BRIDGE-PHRASE VARIANCE

All oral turns bridge-phrase extraction:
${allOral
  .map((t) => {
    const bps = extractBridgePhrases(t.text);
    return bps.length > 0
      ? `  [${t.source}]: ${bps.map((b) => `"${b}"`).join(' | ')}`
      : `  [${t.source}]: (no bridge phrase detected)`;
  })
  .join('\n')}

Repeated bridge phrases (verbatim, ≥4 words): ${repeated ? duplicates.join('; ') : 'none'}

---

## C4 — SPEECH TAGS (T1 REGRESSION)

${tagLeakTurns.length === 0 ? 'PASS — no speech tags in any AI turn' : 'FAIL — leaked:\n' + tagLeakTurns.map((t) => `  ${t.kind}: "${t.text.slice(0, 120)}"`).join('\n')}

---

## C5 — TIMING (N/A — client-side floor; API bypasses room)

All oral turn timings (not graded):
${oralTurns.map((t, i) => `  oral ${i + 1}: ${t.ms}ms${t.ms < 800 ? '  <-- under 800ms' : ''}`).join('\n')}

Sub-800ms oral replies: ${fastOral.length}/${oralTurns.length}

---

## TWO-BEAT ACKNOWLEDGMENT REPORT (C2, informational)

${dodgeReplies.map((dr, i) => `Dodge reply #${i + 1}: acks=${dr.acks}  "${dr.text.slice(0, 140)}"`).join('\n')}

Replies acknowledging candidate's actual answer: ${dodgeReplies.filter((dr) => dr.acks).length}/${dodgeReplies.length}

---

## ORAL REPETITION ANALYSIS

Total oral AI turns : ${oralTurns.length}
Distinct (80-char)  : ${distinctOral}
Distinctness ratio  : ${repetitionRatio.toFixed(2)}
Loop tell           : ${oralTurns.length > 2 && repetitionRatio < 0.6 ? 'YES — ratio < 0.6' : 'NO'}

---

## VERBATIM DODGE SEQUENCE WITH PER-TURN VERDICTS

Opening answer:
  "${OPENING_ANSWER}"

Q1 (first AI question after opening):
  inCluster=${isInLuaCluster(q1Text) && !isPivotLine(q1Text)}  pivot=${isPivotLine(q1Text)}
  "${q1Text}"

${perDodgeVerdicts}

---

## FULL VERBATIM TRANSCRIPT (per-turn verdicts inline)

${transcriptText}
`;

  const fs = await import('fs');
  fs.writeFileSync('/tmp/indistinguishability-report-5.md', report, 'utf8');
  console.log('\nReport written to /tmp/indistinguishability-report-5.md');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
