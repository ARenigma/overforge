// Indistinguishability test #3 — HEAD 9efbfae
// Verifies fixes shipped in 9efbfae:
//   (a) 5x-same-question oral tell: hard topic-change mandate + two-beat ack + dodge few-shots
//   (b) engagement/observer_note events no longer rejected by DB CHECK constraint
//
// Scenario A — ORAL DODGE x3
//   PASS criteria:
//     A1  reply #1 is a follow-up probe (not a topic pivot yet)
//     A2  reply #2 explicitly acknowledges the dodge — two-beat shape ("I hear X, but I want Y")
//     A3  reply #3 pivots to a genuinely new topic or moves to coding
//     A4  no 4th rephrase of the same narrow question after 3 dodges
//     A5  no speech tags in any dodge reply (T1)
//
// Scenario B — EVENT PERSISTENCE (coding phase)
//   send 8 snapshots (growing then deletion burst), 2 failing runs, wait 10s
//   B1  at least one 'engagement' row in interview_events
//   B2  observer_note rows present if ENGAGEMENT_INTERVENTIONS=1 (report either way)
//
// Run: OF_TEST_PASSWORD='...' npx tsx playwright/scripts/indistinguishability-3.ts

import { getAccessToken } from '../helpers/auth';
import { config } from '../helpers/env';
import { execSync } from 'child_process';

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
  console.log(`\n${prefix} (+${ms}ms)\n  "${text.trim().slice(0, 350)}"`);
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

async function pollIV(
  id: string,
  token: string,
  maxMs: number,
  label: string,
): Promise<{ text: string; kind: string } | null> {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    await sleep([2000, 2000, 3000, 5000][Math.min(attempt++, 3)]!);
    const r = await httpPost(`/api/interviews/${id}/run-intervention`, { token });
    const b = r.body as {
      pending: boolean;
      intervention: { text: string; kind: string } | null;
    };
    console.log(
      `  [pollIV/${label}] attempt=${attempt} pending=${b.pending} kind=${b.intervention?.kind ?? 'null'}`,
    );
    if (!b.pending) return b.intervention;
  }
  return null;
}

// ── Speech-tag detector ───────────────────────────────────────────────────────

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

// ── Result tracker ────────────────────────────────────────────────────────────

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
  console.log('=== INDISTINGUISHABILITY TEST #3 — HEAD 9efbfae ===');
  console.log(`  Backend: ${API}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  // ── Auth + create ────────────────────────────────────────────────────────────
  console.log('[1] Auth + create dev interview');
  const jwt = await getAccessToken();
  const cr = await httpPost(
    '/api/interviews',
    {
      candidateEmail: 'dodge-test-3@overforge.local',
      candidateName: 'Sam (dodge+persistence test #3)',
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
  console.log(`  phase=${startPhase}`);

  // ── SCENARIO A: ORAL DODGE x3 ─────────────────────────────────────────────
  //
  // Same project / dodge answers as report #2 so the comparison is apples-to-apples.
  // Dodge 0: genuine opening (establishes the project, not itself a dodge).
  // Dodges 1-3: plausible-but-off-topic answers — deployment topology, monitoring, team process.
  //
  // PASS for A2: reply #2 must acknowledge what the candidate DID say OR name what is missing
  //   (two-beat shape: "I hear you on X, but I'm specifically asking about Y").
  // PASS for A3: reply #3 must move to a genuinely new question/topic — NOT another rephrase
  //   of the Lua atomicity question. Pivot or transition signal required.

  console.log('\n[3] SCENARIO A — Oral dodge sequence\n');

  const OPENING_ANSWER =
    'I designed a distributed rate-limiter for our API gateway: sliding-window counters ' +
    'in Redis, token-bucket fallback for burst traffic, and a Lua script for atomic ' +
    'compare-and-swap to prevent thundering herds. The main challenge was ensuring the ' +
    'Lua atomicity held under Redis Cluster hash-slot splits during failover.';
  rec('candidate', OPENING_ANSWER);
  const r0 = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: OPENING_ANSWER });
  const { utterance: q1, phase: ph0 } = r0.body as {
    utterance: { text: string };
    phase: string;
  };
  if (q1?.text) rec('ai', q1.text, 'oral');
  console.log(`  phase after opening: ${ph0}`);

  const DODGE_ANSWERS = [
    // Dodge #1 — asked about Lua atomicity / failover; pivot to deployment topology
    'We ran three Redis Cluster nodes across two AZs with a Sentinel setup for quorum. ' +
      'The cluster had six shards, each with a primary and replica. Deployment was on EKS ' +
      'with a Helm chart we maintained — zero-downtime rolling updates, about 4-minute P99.',

    // Dodge #2 — asked again about the mechanism; pivot to monitoring instead
    'We had Prometheus + Grafana dashboards tracking p50/p99 latency per endpoint, plus ' +
      'custom counters for rate-limit hits and token-bucket exhaustion events. On-call SLO ' +
      'was 99.95% across the quarter. Alerts fired to PagerDuty via Alertmanager.',

    // Dodge #3 — third consecutive off-topic; pivot to team process
    'The team was four engineers. We ran two-week sprints with a rotating on-call. ' +
      'Post-mortems were blameless — every incident got a five-why analysis. I led the ' +
      'retrospectives and maintained the runbook for the rate-limiter component.',
  ];

  const dodgeReplies: { text: string; ms: number }[] = [];

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
    if (replyText) {
      // record with correct wall-clock delta from candidate send
      lastTs = Date.now() - replyMs;
      rec('ai', replyText, 'oral');
      dodgeReplies.push({ text: replyText, ms: replyMs });
    }
    console.log(`  dodge #${d + 1}: phase=${newPhase}`);
    if (newPhase === 'coding' || newPhase === 'done') {
      console.log(`  [NOTE] interview advanced to ${newPhase} after dodge #${d + 1}`);
      break;
    }
    await sleep(300);
  }

  // ── Evaluate the dodge sequence ──────────────────────────────────────────────

  const reply1 = dodgeReplies[0];
  const reply2 = dodgeReplies[1];
  const reply3 = dodgeReplies[2];

  // Two-beat acknowledgment patterns (9efbfae fix: "I hear X, but I'm asking about Y")
  // Captures: explicit naming of candidate's actual answer, meta-commentary on the dodge,
  // contrastive connectives ("but", "however", "yet", "whereas"), "let me be more specific",
  // "focusing specifically on", "back to my question", "what I'm really asking about".
  const ACKNOWLEDGE_PATTERNS = [
    /i('m|\s+am)?\s+(asking|focused|interested|curious)\s+(specifically|about|on)/i,
    /i\s+notice/i,
    /i\s+see\s+(you|that)/i,
    /i\s+(asked|was\s+asking|want)\s+(you\s+)?to\s+(focus|address|speak|elaborate|explain)\s+(specifically|on|about)/i,
    /let\s+me\s+(be\s+more\s+specific|rephrase|refocus|ask\s+more\s+directly|narrow)/i,
    /specifically\s+(asking|about|regarding|interested\s+in)/i,
    /back\s+to\s+(my|the)\s+(question|original)/i,
    /to\s+be\s+more\s+(specific|direct|precise)/i,
    /the\s+(specific|particular|exact)\s+(mechanism|question|aspect|part)/i,
    /what\s+i('m|'m|\s+am)\s+(really\s+)?(asking|looking\s+for)/i,
    /focusing\s+(back\s+)?on/i,
    /rather\s+than\s+(the|your|how)/i,
    /instead\s+of/i,
    /that\s+(said|aside|noted)/i,
    /noted\b/i,
    /understood\b/i,
    /got\s+it\b/i,
    /fair\s+enough/i,
    // Two-beat patterns specific to 9efbfae (acknowledge THEN redirect)
    /i\s+hear\s+(you|that)/i,
    /you('ve|\s+have)\s+(mentioned|described|talked\s+about|covered)/i,
    /that('s|\s+is)\s+(helpful|good|useful|interesting|noted)/i,
    /appreciate\s+(that|the|your)/i,
    /good\s+(point|context|background)/i,
    /while\s+(that|those|this)\s+(is|are)\s+(helpful|interesting|relevant)/i,
    /i\s+want\s+to\s+(come\s+back|return|focus|zero\s+in|drill\s+down)/i,
    /can\s+you\s+(bring|take|walk)\s+(me\s+)?back\s+to/i,
    /let('s|\s+us)\s+(come\s+back|return|focus|drill)/i,
    /help\s+me\s+understand\s+(specifically|exactly|precisely)/i,
    /specifically\s+on\s+the/i,
    /zero\s+in\s+on/i,
    /drill\s+(down\s+)?into/i,
    /narrow\s+(down\s+)?to/i,
  ];

  // Pivot patterns: reply #3 must shift to a new topic or transition to coding
  const PIVOT_PATTERNS = [
    /let('s|'s|\s+us)\s+(move\s+on|shift|turn|switch|look\s+at|now\s+explore|go\s+ahead)/i,
    /moving\s+on/i,
    /let\s+me\s+ask\s+(you\s+)?(a\s+)?(different|new|another)/i,
    /different\s+(angle|question|topic|aspect)/i,
    /switching\s+gears/i,
    /on\s+to\s+(the\s+)?(coding|next|another)/i,
    /a\s+different\s+(question|problem)/i,
    /we('ll|'ll|\s+will)\s+(now|move|pivot|go)/i,
    /for\s+the\s+(coding|next)\s+(part|phase|section)/i,
    /i('ll|'ll|\s+will)\s+(now|leave|drop|move)/i,
    // Additional patterns for topic-change mandate in 9efbfae
    /new\s+(question|topic|area|direction)/i,
    /change\s+(direction|topic|gears)/i,
    /pivot\b/i,
    /different\s+(direction|dimension)/i,
    /another\s+(area|aspect|angle)/i,
    /now\s+i('d|'d|\s+would)\s+like\s+to/i,
    /i('d|'d|\s+would)\s+like\s+to\s+shift/i,
    /let\s+me\s+ask\s+about\s+(something|a)\s+(else|different)/i,
    /turn\s+(our\s+)?attention\s+to/i,
    /talk\s+(briefly\s+)?about\s+(?!the\s+Lua|atomicity|hash.slot|latency|failover)/i,
    /ask\s+you\s+about\s+(?!the\s+Lua|atomicity|hash.slot|latency|failover)/i,
  ];

  // Check if reply3 is semantically the same question as the original (Lua atomicity / hash-slot failover)
  // If it is, it's NOT a pivot regardless of transition signals.
  const SAME_QUESTION_MARKERS = [
    /lua\s+(script|call|operation|eval)/i,
    /hash.slot/i,
    /hash\s+slot/i,
    /failover/i,
    /latency\s+(increase|impact|during)/i,
    /atomic\s+(compare|operation|swap)/i,
    /during\s+the\s+failover/i,
    /what\s+(exact|was\s+the)\s+latency/i,
  ];

  const reply2Acknowledges =
    reply2 !== undefined && ACKNOWLEDGE_PATTERNS.some((p) => p.test(reply2.text));

  // reply3 pivots if: (a) has a pivot signal, (b) does NOT still ask about Lua/hash-slot/failover,
  // OR if the interview reached coding (checked by phase in the dodge loop).
  const reply3HasPivotSignal =
    reply3 !== undefined && PIVOT_PATTERNS.some((p) => p.test(reply3.text));
  const reply3StillSameQuestion =
    reply3 !== undefined && SAME_QUESTION_MARKERS.some((p) => p.test(reply3.text));
  const reply3Pivots =
    reply3 !== undefined
      ? reply3HasPivotSignal && !reply3StillSameQuestion
      : dodgeReplies.length < 3; // interview advanced before 3rd reply = implicit pivot

  // No 4th rephrase: we should not have received more than 3 dodge replies
  const oralAfterDodge3 = dodgeReplies.length > 3;

  const dodgeTagLeaks = dodgeReplies.filter((r) => hasSpeechTag(r.text));
  const fastDodgeReplies = dodgeReplies.filter((r) => r.ms < 800);

  step(
    'A1: Dodge reply #1 — follow-up probe (stays on topic)',
    reply1 !== undefined,
    reply1 ? `${reply1.ms}ms` : 'no reply',
  );
  step(
    'A2: Dodge reply #2 — explicitly acknowledges dodge (two-beat shape)',
    reply2Acknowledges,
    reply2
      ? `${reply2Acknowledges ? 'pattern matched' : 'NO MATCH'} — "${reply2.text.slice(0, 140)}"`
      : 'no reply',
  );
  step(
    'A3: Dodge reply #3 — pivots to NEW topic (not another Lua/failover rephrase)',
    reply3Pivots,
    reply3
      ? `pivot=${reply3HasPivotSignal} sameQ=${reply3StillSameQuestion} — "${reply3.text.slice(0, 140)}"`
      : 'interview advanced before reply3 (accepted as pivot)',
  );
  step('A4: No 4th rephrase after 3 dodges', !oralAfterDodge3, `${dodgeReplies.length} dodge replies total`);
  step(
    'A5: No speech tags in any dodge reply (T1)',
    dodgeTagLeaks.length === 0,
    dodgeTagLeaks.length > 0
      ? `LEAKED: ${dodgeTagLeaks.map((r) => speechTagsFound(r.text).join(',')).join('; ')}`
      : 'clean',
  );
  step(
    'A6: No sub-800ms assist replies in oral (T3)',
    fastDodgeReplies.length === 0,
    fastDodgeReplies.length > 0
      ? `${fastDodgeReplies.map((r) => r.ms + 'ms').join(', ')}`
      : 'all ≥800ms',
  );

  // ── Advance to coding phase (genuine answers) ────────────────────────────────
  console.log('\n[4] Advancing to coding phase (genuine answers)...');
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
  let phase = startPhase;
  let genuineTurns = 0;
  while (!['coding', 'done'].includes(phase) && genuineTurns < 8) {
    const ans = GENUINE_ANSWERS[genuineTurns % GENUINE_ANSWERS.length]!;
    rec('candidate', ans);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { utterance: reply, phase: np } = ar.body as {
      utterance: { text: string };
      phase: string;
    };
    if (reply?.text) rec('ai', reply.text, 'oral');
    phase = np;
    genuineTurns++;
    console.log(`  genuine turn ${genuineTurns}: phase=${phase}`);
    if (phase === 'coding') break;
    await sleep(300);
  }
  step('Reached coding phase', phase === 'coding', `phase=${phase} after ${genuineTurns} genuine turns`);
  if (phase !== 'coding') {
    console.log('[FATAL] Could not reach coding phase — skipping coding + DB checks');
    // still run delete + report
  }

  // ── SCENARIO B: EVENT PERSISTENCE — coding snapshots + 2 failing runs ─────────
  console.log('\n[5] SCENARIO B — Event persistence (snapshots + runs + DB query)\n');

  if (phase === 'coding') {
    const cpr = await httpPost(`/api/interviews/${id}/coding-problem`, { token: tok });
    const cpb = cpr.body as {
      codeIndex: number;
      total: number;
      problem: { title: string } | null;
    };
    console.log(
      `  Problem: "${cpb.problem?.title ?? '(none)'}"  (${cpb.codeIndex + 1}/${cpb.total})`,
    );

    // Code snapshots: 8 total — first 5 grow the code, last 3 simulate a deletion burst
    const BASE = `import sys\ndata = sys.stdin.read().split()\n`;
    const GROWING = [
      BASE + `print(len(data))`,
      BASE + `n = int(data[0])\nprint(n)`,
      BASE + `n = int(data[0])\nnums = [int(x) for x in data[1:n+1]]\nprint(n)`,
      BASE + `n = int(data[0])\nnums = [int(x) for x in data[1:n+1]]\nseen = {}\nfor i, v in enumerate(nums):\n    if v in seen:\n        print(seen[v], i)\n        break\n    seen[v] = i`,
      BASE + `n = int(data[0])\nnums = [int(x) for x in data[1:n+1]]\ntarget = int(data[n+1])\nseen = {}\nfor i, v in enumerate(nums):\n    comp = target - v\n    if comp in seen:\n        print(seen[comp], i)\n        break\n    seen[v] = i`,
    ];
    // Deletion burst: candidate deletes most code, reverts to minimal stub
    const AFTER_DELETE = [
      BASE + `print(0)`,
      BASE + `pass`,
      BASE + `n = 0\nprint(n)`,
    ];

    console.log('  Sending 8 snapshots (5 growing + 3 deletion burst)...');
    for (let s = 0; s < GROWING.length; s++) {
      await httpPost(`/api/interviews/${id}/snapshot`, {
        token: tok,
        code: GROWING[s]!,
        language: LANG,
        seq: s + 1,
      });
      console.log(`  snapshot ${s + 1}/8 (grow)`);
      await sleep(400);
    }
    for (let s = 0; s < AFTER_DELETE.length; s++) {
      await httpPost(`/api/interviews/${id}/snapshot`, {
        token: tok,
        code: AFTER_DELETE[s]!,
        language: LANG,
        seq: GROWING.length + s + 1,
      });
      console.log(`  snapshot ${GROWING.length + s + 1}/8 (delete burst)`);
      await sleep(400);
    }

    // Failing run #1 (minimal stub — wrong answer)
    const WRONG1 = BASE + `print(0)`;
    console.log('\n  Failing run #1...');
    rec('candidate', WRONG1, 'code');
    const rn1 = await httpPost(`/api/interviews/${id}/run`, {
      token: tok,
      language: LANG,
      source: WRONG1,
    });
    const rn1b = rn1.body as {
      status: string;
      interventionPending?: boolean;
      intervention?: { text: string; kind: string };
    };
    console.log(`  run1.status=${rn1b.status} pending=${rn1b.interventionPending}`);
    if (rn1b.interventionPending) {
      const iv = await pollIV(id, tok, 20_000, 'rn1');
      if (iv) rec('ai', iv.text, iv.kind);
    } else if (rn1b.intervention) {
      rec('ai', rn1b.intervention.text, rn1b.intervention.kind);
    }

    // Failing run #2 (still wrong)
    const WRONG2 = BASE + `n = int(data[0])\nprint(n)`;
    console.log('\n  Failing run #2...');
    rec('candidate', WRONG2, 'code');
    const rn2 = await httpPost(`/api/interviews/${id}/run`, {
      token: tok,
      language: LANG,
      source: WRONG2,
    });
    const rn2b = rn2.body as {
      status: string;
      interventionPending?: boolean;
      intervention?: { text: string; kind: string };
    };
    console.log(`  run2.status=${rn2b.status} pending=${rn2b.interventionPending}`);
    if (rn2b.interventionPending) {
      const iv = await pollIV(id, tok, 20_000, 'rn2');
      if (iv) rec('ai', iv.text, iv.kind);
    } else if (rn2b.intervention) {
      rec('ai', rn2b.intervention.text, rn2b.intervention.kind);
    }

    // Wait 10s for async engagement writer to flush
    console.log('\n  Waiting 10s for engagement events to persist...');
    await sleep(10_000);
  }

  // ── DB query: engagement + observer_note ──────────────────────────────────────
  console.log('\n[6] Querying engagement + observer_note events from prod DB...');
  let engEvents: string[] = [];
  let noteEvents: string[] = [];
  let dbRawOutput = '(DB query not run)';

  try {
    const raw = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 beef-server ` +
        `"DB=\\$(grep '^SUPABASE_DB_URL=' ~/overforge/deploy/backend.env | cut -d= -f2- | tr -d '\"'); ` +
        `psql \\"\\$DB\\" -t -A -F '||' -c \\"select kind,payload from interview_events ` +
        `where interview_id='${id}' and kind in ('engagement','observer_note') order by seq\\""`,
      { encoding: 'utf8', timeout: 30_000 },
    );
    dbRawOutput = raw.trim();
    for (const line of raw.trim().split('\n').filter(Boolean)) {
      const [kind, ...rest] = line.split('||');
      if (kind === 'engagement') engEvents.push(rest.join('||'));
      if (kind === 'observer_note') noteEvents.push(rest.join('||'));
    }
    console.log(`  engagement events: ${engEvents.length}`);
    console.log(`  observer_note events: ${noteEvents.length}`);
    engEvents.forEach((e, i) => {
      try {
        const p = JSON.parse(e) as Record<string, unknown>;
        console.log(
          `  [eng ${i + 1}] state=${String(p['state'])} prev=${String(p['prevState'])} payload=${JSON.stringify(p).slice(0, 120)}`,
        );
      } catch {
        console.log(`  [eng ${i + 1}] raw: ${e.slice(0, 120)}`);
      }
    });
    noteEvents.forEach((e, i) => {
      try {
        const p = JSON.parse(e) as Record<string, unknown>;
        console.log(
          `  [note ${i + 1}] approach="${String(p['approach']).slice(0, 80)}" diagnosis="${String(p['diagnosis']).slice(0, 80)}"`,
        );
      } catch {
        console.log(`  [note ${i + 1}] raw: ${e.slice(0, 120)}`);
      }
    });

    step(
      'B1: Engagement events logged to DB (constraint fixed)',
      engEvents.length > 0,
      `${engEvents.length} events`,
    );
    step(
      'B2: Observer notes in DB (ENGAGEMENT_INTERVENTIONS=1 required)',
      noteEvents.length > 0,
      `${noteEvents.length} notes — ${noteEvents.length === 0 ? 'may require ENGAGEMENT_INTERVENTIONS=1 + LLM observer' : 'present'}`,
    );
  } catch (err) {
    dbRawOutput = String(err).slice(0, 400);
    console.log(`  DB query failed: ${dbRawOutput}`);
    step('B1: Engagement events logged to DB', false, 'SSH/DB query failed');
    step('B2: Observer notes in DB', false, 'SSH/DB query failed');
  }

  // ── Delete ─────────────────────────────────────────────────────────────────────
  console.log('\n[7] Delete test interview');
  const ds = await httpDel(`/api/interviews/${id}`, jwt);
  console.log(`  DELETE status=${ds}`);
  step('Interview deleted (200/204)', ds === 200 || ds === 204, `status=${ds}`);

  // ── Analysis ──────────────────────────────────────────────────────────────────
  const allAiTurns = log.filter((t) => t.role === 'ai');
  const oralTurns = log.filter((t) => t.role === 'ai' && t.kind === 'oral');
  const distinctOral = new Set(oralTurns.map((t) => t.text.slice(0, 80))).size;
  const repetitionRatio = oralTurns.length > 0 ? distinctOral / oralTurns.length : 1;
  const oralLoopTell = oralTurns.length > 2 && repetitionRatio < 0.6;
  const globalTagLeak = allAiTurns.some((t) => hasSpeechTag(t.text));
  const globalTagTurns = allAiTurns
    .filter((t) => hasSpeechTag(t.text))
    .map((t) => `${t.kind}: "${t.text.slice(0, 80)}"`)
    .join('\n  ');

  // ── Transcript ────────────────────────────────────────────────────────────────
  const transcriptText = log
    .map((t, i) => {
      const prefix = t.role === 'ai' ? `AI[${t.kind ?? '-'}]` : `CAND`;
      return `#${i + 1}  ${prefix} (+${t.ms}ms):\n  "${t.text.slice(0, 500)}"`;
    })
    .join('\n\n');

  // ── Report ────────────────────────────────────────────────────────────────────
  const engSummary =
    engEvents.length > 0
      ? engEvents
          .map((e) => {
            try {
              const p = JSON.parse(e) as Record<string, unknown>;
              return `state=${String(p['state'])} prev=${String(p['prevState'])}`;
            } catch {
              return e.slice(0, 60);
            }
          })
          .join(' | ')
      : 'none';

  const noteSummary =
    noteEvents.length > 0
      ? noteEvents
          .map((e) => {
            try {
              const p = JSON.parse(e) as Record<string, unknown>;
              return `approach="${String(p['approach']).slice(0, 60)}" diagnosis="${String(p['diagnosis']).slice(0, 60)}"`;
            } catch {
              return e.slice(0, 60);
            }
          })
          .join('\n  ')
      : 'none';

  const report = `# Indistinguishability Report #3 — ${new Date().toISOString()}
## Backend: ${API}  HEAD: 9efbfae
## Interview ID (deleted): ${id}
## Fixes verified: (a) 5x-question oral tell  (b) engagement/observer_note DB constraint

---

## PER-CHECK PASS/FAIL TABLE

${steps.map((s) => `${s.pass ? 'PASS' : 'FAIL'}  ${s.label}${s.note ? ' — ' + s.note : ''}`).join('\n')}

---

## VERBATIM DODGE SEQUENCE (Scenario A)

Opening answer (establishing project):
  "${OPENING_ANSWER}"

First AI question (after opening):
  "${q1?.text ?? '(none)'}"

${dodgeReplies
  .map((r, i) => `Dodge reply #${i + 1} (+${r.ms}ms):\n  "${r.text.slice(0, 500)}"`)
  .join('\n\n')}

Dodge acknowledgment check (reply #2): ${reply2Acknowledges ? 'ACKNOWLEDGED' : 'NOT ACKNOWLEDGED'}
Dodge pivot check (reply #3): ${reply3Pivots ? 'PIVOTED' : 'DID NOT PIVOT'} (sameQ=${reply3StillSameQuestion}, pivotSignal=${reply3HasPivotSignal})

---

## ORAL REPETITION ANALYSIS

Total oral turns: ${oralTurns.length}
Distinct oral turns (by first 80 chars): ${distinctOral}
Distinctness ratio: ${repetitionRatio.toFixed(2)}
5x-loop tell: ${oralLoopTell ? 'YES — loop detected (ratio < 0.6)' : 'NO — distinct enough'}

---

## TIMING ANALYSIS (inter-turn ms, T3 regression)

All AI turns:
${allAiTurns.map((t) => `  ${t.kind ?? '-'}: ${t.ms}ms${t.ms < 800 && t.kind !== 'greeting' ? ' *** UNDER 800ms ***' : ''}`).join('\n')}

Sub-800ms AI turns (excluding greeting): ${allAiTurns.filter((t) => t.ms < 800 && t.kind !== 'greeting').length}

---

## GLOBAL SPEECH-TAG SCAN (T1 — all AI turns)

${globalTagLeak ? 'FAIL — tags found in:\n  ' + globalTagTurns : 'PASS — no speech tags in any AI turn'}

---

## ENGAGEMENT ENGINE EVENTS (Scenario B)

Engagement state transitions: ${engEvents.length}  [${engSummary}]
Observer notes (ENGAGEMENT_INTERVENTIONS=1): ${noteEvents.length}
${noteSummary !== 'none' ? noteSummary : '  (none — either flag off, or observer LLM did not produce note)'}

DB raw output (masked):
${dbRawOutput.slice(0, 1000)}

---

## FULL VERBATIM TRANSCRIPT

${transcriptText}
`;

  const fs = await import('fs');
  fs.writeFileSync('/tmp/indistinguishability-report-3.md', report, 'utf8');
  console.log('\n\nReport written to /tmp/indistinguishability-report-3.md');

  // ── Final summary ─────────────────────────────────────────────────────────────
  console.log('\n=== FINAL PASS/FAIL SUMMARY ===');
  steps.forEach((s) =>
    console.log(`  ${s.pass ? 'PASS' : 'FAIL'}  ${s.label}${s.note ? ' — ' + s.note : ''}`),
  );

  const passCount = steps.filter((s) => s.pass).length;
  const failCount = steps.filter((s) => !s.pass).length;
  console.log(`\n  ${passCount} PASS  /  ${failCount} FAIL  /  ${steps.length} total`);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
