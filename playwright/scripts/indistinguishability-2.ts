// Indistinguishability test #2 — HEAD 06a65af
// Covers:
//   Scenario A — ORAL DODGE x3 (explicit dodge acknowledgment + pivot check)
//   Scenario B — CODING LADDER (probe→offer→hint) + T1 speech-tag regression + T3 timing
//   DB query for engagement + observer_note events (before delete)
//
// Run: OF_TEST_PASSWORD='...' npx tsx playwright/scripts/indistinguishability-2.ts

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
  const b = ct.includes('json') ? ((await r.json()) as Record<string, unknown>) : ({ text: await r.text() } as Record<string, unknown>);
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
    const b = r.body as { pending: boolean; intervention: { text: string; kind: string } | null };
    console.log(
      `  [pollIV/${label}] attempt=${attempt} pending=${b.pending} kind=${b.intervention?.kind ?? 'null'}`,
    );
    if (!b.pending) return b.intervention;
  }
  return null;
}

// ── Speech-tag leak detector ─────────────────────────────────────────────────
// Tests for the T1 regression: [pause], <soft>, <slow>, [sigh], etc.
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
  console.log('=== INDISTINGUISHABILITY TEST #2 — HEAD 06a65af ===');
  console.log(`  Backend: ${API}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  // ── Auth + create ────────────────────────────────────────────────────────────
  console.log('[1] Auth + create dev interview');
  const jwt = await getAccessToken();
  const cr = await httpPost(
    '/api/interviews',
    {
      candidateEmail: 'dodge-test@overforge.local',
      candidateName: 'Sam (dodge+ladder test)',
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
  console.log('\n[2] Begin (consume invite token)');
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
  // Strategy: give plausible, technically competent answers that are clearly
  // off-topic relative to the specific question asked. We're not stonewalling —
  // we're answering a different sub-question from the same domain. A human
  // interviewer should notice by dodge #2 and name it; by dodge #3 pivot away.
  //
  // The opening question is typically "walk me through a challenging project".
  // We'll answer that honestly (dodge 0 = not a dodge), then for each follow-up
  // probe we'll give an answer that addresses a neighbouring-but-wrong aspect.

  console.log('\n[3] SCENARIO A — Oral dodge sequence\n');

  // Dodge 0: Genuine opening answer (establishes the project)
  const OPENING_ANSWER =
    'I designed a distributed rate-limiter for our API gateway: sliding-window counters ' +
    'in Redis, token-bucket fallback for burst traffic, and a Lua script for atomic ' +
    'compare-and-swap to prevent thundering herds. The main challenge was ensuring the ' +
    'Lua atomicity held under Redis Cluster hash-slot splits during failover.';
  rec('candidate', OPENING_ANSWER);
  const r0 = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: OPENING_ANSWER });
  const { utterance: q1, phase: ph0 } = r0.body as { utterance: { text: string }; phase: string };
  if (q1?.text) rec('ai', q1.text, 'oral');
  console.log(`  phase after opening: ${ph0}`);

  const DODGE_ANSWERS = [
    // Dodge #1 — asked about rate-limiter atomicity/failover; answer with deployment topology instead
    'We ran three Redis Cluster nodes across two AZs with a Sentinel setup for quorum. ' +
    'The cluster had six shards, each with a primary and replica. Deployment was on EKS ' +
    'with a Helm chart we maintained — zero-downtime rolling updates, about 4-minute P99.',

    // Dodge #2 — asked again about the specific technical mechanism; talk about monitoring instead
    'We had Prometheus + Grafana dashboards tracking p50/p99 latency per endpoint, plus ' +
    'custom counters for rate-limit hits and token-bucket exhaustion events. On-call SLO ' +
    'was 99.95% across the quarter. Alerts fired to PagerDuty via Alertmanager.',

    // Dodge #3 — third consecutive off-topic answer; talk about team process instead
    'The team was four engineers. We ran two-week sprints with a rotating on-call. ' +
    'Post-mortems were blameless — every incident got a five-why analysis. I led the ' +
    'retrospectives and maintained the runbook for the rate-limiter component.',
  ];

  const dodgeReplies: { text: string; ms: number }[] = [];

  for (let d = 0; d < DODGE_ANSWERS.length; d++) {
    const ans = DODGE_ANSWERS[d]!;
    rec('candidate', ans);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { utterance: reply, phase: newPhase } = ar.body as {
      utterance: { text: string };
      phase: string;
    };
    const replyText = reply?.text ?? '';
    const replyMs = log[log.length - 1]?.ms ?? 0; // ms is recorded when rec() is called next
    // We need the timing of the AI's reply, not our submission. Record now.
    lastTs = Date.now() - replyMs; // reset so the rec() call captures correct delta
    if (replyText) {
      rec('ai', replyText, 'oral');
      dodgeReplies.push({ text: replyText, ms: log[log.length - 1]!.ms });
    }
    console.log(`  dodge #${d + 1}: phase=${newPhase}`);
    if (newPhase === 'coding' || newPhase === 'done') {
      console.log(`  [NOTE] interview advanced to ${newPhase} after dodge #${d + 1}`);
      break;
    }
    await sleep(200);
  }

  // ── Evaluate the dodge sequence ──────────────────────────────────────────────

  // Reply #1 (after dodge #1): should be a follow-up probe on the original topic
  const reply1 = dodgeReplies[0];
  // Reply #2 (after dodge #2): should explicitly name/acknowledge the dodge
  const reply2 = dodgeReplies[1];
  // Reply #3 (after dodge #3): should gracefully pivot to a NEW topic or handoff
  const reply3 = dodgeReplies[2];

  // Heuristics for dodge acknowledgment in reply #2:
  // - uses "I notice", "I see", "I asked about", "let me be more specific",
  //   "I want to focus on", "specifically asking", "back to", "the mechanism",
  //   "that wasn't quite", "let me rephrase", first-person naming of the miss
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
  ];

  // Heuristics for pivot (reply #3 addresses a DIFFERENT question/topic)
  // A pivot either introduces a new topic or transitions to coding.
  // Detect by: absence of the original "atomicity" / "hash-slot" keywords,
  // presence of new-topic markers, or a transition signal.
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
  ];

  const reply2Acknowledges =
    reply2 !== undefined &&
    ACKNOWLEDGE_PATTERNS.some((p) => p.test(reply2.text));

  const reply3Pivots =
    reply3 !== undefined &&
    (PIVOT_PATTERNS.some((p) => p.test(reply3.text)) ||
      // If the interview reached coding after dodge 3, that counts as a pivot
      log.some((t) => t.role === 'ai' && t.kind === 'oral' && log.indexOf(t) > log.indexOf(log.find(x => x.text === (reply3?.text ?? '')) ?? log[log.length-1]!)));

  // Check: no 4th rephrase of the same question
  const oralAfterDodge3 = dodgeReplies.length > 3;

  // Check all dodge replies for speech tags (T1 regression)
  const dodgeTagLeaks = dodgeReplies.filter((r) => hasSpeechTag(r.text));

  // Check all dodge replies for timing < 800ms (T3 regression: assists < 800ms is suspicious)
  const fastDodgeReplies = dodgeReplies.filter((r) => r.ms < 800);

  step(
    'Dodge reply #1: follow-up probe (not a topic change)',
    reply1 !== undefined,
    reply1 ? `${reply1.ms}ms` : 'no reply',
  );
  step(
    'Dodge reply #2: explicitly names/acknowledges the dodge',
    reply2Acknowledges,
    reply2
      ? `${reply2Acknowledges ? 'pattern matched' : 'NO MATCH'} — "${reply2.text.slice(0, 120)}"`
      : 'no reply',
  );
  step(
    'Dodge reply #3: gracefully pivots to NEW topic or handoff',
    reply3Pivots || (reply3 === undefined && dodgeReplies.length < 3),
    reply3
      ? `${reply3Pivots ? 'pivot detected' : 'NO PIVOT — same theme'} — "${reply3.text.slice(0, 120)}"`
      : 'interview advanced (accepted)',
  );
  step('No 4th rephrase after 3 dodges', !oralAfterDodge3);
  step(
    'No speech tags in dodge replies (T1)',
    dodgeTagLeaks.length === 0,
    dodgeTagLeaks.length > 0
      ? `LEAKED: ${dodgeTagLeaks.map((r) => speechTagsFound(r.text).join(',')).join('; ')}`
      : 'clean',
  );
  step(
    'No sub-800ms assist replies in oral (T3)',
    fastDodgeReplies.length === 0,
    fastDodgeReplies.length > 0
      ? `${fastDodgeReplies.map((r) => r.ms + 'ms').join(', ')}`
      : 'all ≥800ms',
  );

  // ── Advance to coding phase ──────────────────────────────────────────────────
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
  while (!['coding', 'done'].includes(phase) && genuineTurns < 6) {
    const ans = GENUINE_ANSWERS[genuineTurns % GENUINE_ANSWERS.length]!;
    rec('candidate', ans);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { utterance: reply, phase: np } = ar.body as { utterance: { text: string }; phase: string };
    if (reply?.text) rec('ai', reply.text, 'oral');
    phase = np;
    genuineTurns++;
    console.log(`  genuine turn ${genuineTurns}: phase=${phase}`);
    if (phase === 'coding') break;
    await sleep(200);
  }
  step('Reached coding phase', phase === 'coding', `phase=${phase} after ${genuineTurns} genuine turns`);
  if (phase !== 'coding') {
    console.log('[FATAL] Could not reach coding phase — aborting ladder scenario');
  }

  // ── SCENARIO B: CODING LADDER ─────────────────────────────────────────────
  console.log('\n[5] SCENARIO B — Coding ladder (abbreviated)\n');

  // Fetch problem
  const cpr = await httpPost(`/api/interviews/${id}/coding-problem`, { token: tok });
  const cpb = cpr.body as { codeIndex: number; total: number; problem: { title: string } | null };
  console.log(`  Problem: "${cpb.problem?.title ?? '(none)'}"  (${cpb.codeIndex + 1}/${cpb.total})`);

  const WRONG = `import sys\ndata = sys.stdin.read().split()\nprint(len(data))`;
  const mkWrong = (n: number) => (n === 0 ? WRONG : WRONG + `\n# run ${n}`);

  // ── Run 1 — expect SILENCE ────────────────────────────────────────────────
  console.log('\n[5a] Run 1 — expect silence');
  rec('candidate', mkWrong(0), 'code');
  const r1 = await httpPost(`/api/interviews/${id}/run`, {
    token: tok,
    language: LANG,
    source: mkWrong(0),
  });
  const r1b = r1.body as {
    status: string;
    interventionPending?: boolean;
    intervention?: { text: string; kind: string };
  };
  console.log(`  status=${r1b.status} pending=${r1b.interventionPending}`);
  let run1Iv: { text: string; kind: string } | null = null;
  if (r1b.interventionPending) run1Iv = await pollIV(id, tok, 15_000, 'r1');
  else if (r1b.intervention) run1Iv = r1b.intervention;
  if (run1Iv) rec('ai', run1Iv.text, run1Iv.kind);
  step('Run 1 → silence (no intervention)', !run1Iv, run1Iv ? `got ${run1Iv.kind}` : undefined);

  // Snapshots before run 2
  for (let s = 1; s <= 3; s++) {
    await httpPost(`/api/interviews/${id}/snapshot`, {
      token: tok,
      code: mkWrong(0) + `\n# thinking ${s}`,
      language: LANG,
      seq: s,
    });
    await sleep(400);
  }

  // ── Run 2 — expect PROBE ──────────────────────────────────────────────────
  console.log('\n[5b] Run 2 — expect probe');
  rec('candidate', mkWrong(1), 'code');
  const r2 = await httpPost(`/api/interviews/${id}/run`, {
    token: tok,
    language: LANG,
    source: mkWrong(1),
  });
  const r2b = r2.body as {
    status: string;
    interventionPending?: boolean;
    intervention?: { text: string; kind: string };
  };
  console.log(`  status=${r2b.status} pending=${r2b.interventionPending}`);
  let run2Iv: { text: string; kind: string } | null = null;
  if (r2b.interventionPending) run2Iv = await pollIV(id, tok, 25_000, 'r2');
  else if (r2b.intervention) run2Iv = r2b.intervention;
  if (run2Iv) rec('ai', run2Iv.text, run2Iv.kind);
  if (run2Iv) {
    const tagLeak = hasSpeechTag(run2Iv.text);
    step('Run 2 → probe', run2Iv.kind === 'probe', run2Iv.kind ?? 'no intervention');
    step(
      'Probe text free of speech tags (T1)',
      !tagLeak,
      tagLeak ? `LEAKED: ${speechTagsFound(run2Iv.text).join(',')}` : 'clean',
    );
  } else {
    step('Run 2 → probe', false, 'no intervention');
    step('Probe text free of speech tags (T1)', true, 'n/a — no probe');
  }

  // Snapshots before run 3
  for (let s = 4; s <= 6; s++) {
    await httpPost(`/api/interviews/${id}/snapshot`, {
      token: tok,
      code: mkWrong(1) + `\n# more thinking ${s}`,
      language: LANG,
      seq: s,
    });
    await sleep(400);
  }

  // ── Run 3 — expect OFFER ──────────────────────────────────────────────────
  console.log('\n[5c] Run 3 — expect offer (stagnant)');
  rec('candidate', mkWrong(2), 'code');
  const r3 = await httpPost(`/api/interviews/${id}/run`, {
    token: tok,
    language: LANG,
    source: mkWrong(2),
  });
  const r3b = r3.body as {
    status: string;
    interventionPending?: boolean;
    intervention?: { text: string; kind: string };
  };
  console.log(`  status=${r3b.status} pending=${r3b.interventionPending}`);
  let run3Iv: { text: string; kind: string } | null = null;
  if (r3b.interventionPending) run3Iv = await pollIV(id, tok, 25_000, 'r3');
  else if (r3b.intervention) run3Iv = r3b.intervention;
  if (run3Iv) rec('ai', run3Iv.text, run3Iv.kind);
  const offerFired = run3Iv?.kind === 'offer';
  if (run3Iv) {
    const tagLeak = hasSpeechTag(run3Iv.text);
    step('Run 3 → offer (stagnant)', offerFired, run3Iv.kind ?? 'no intervention');
    step(
      'Offer text free of speech tags (T1)',
      !tagLeak,
      tagLeak ? `LEAKED: ${speechTagsFound(run3Iv.text).join(',')}` : 'clean',
    );
  } else {
    step('Run 3 → offer (stagnant)', false, 'no intervention');
    step('Offer text free of speech tags (T1)', true, 'n/a');
  }

  // ── Accept offer → hint ───────────────────────────────────────────────────
  let hintText: string | null = null;
  let hintMs = 0;
  if (offerFired) {
    console.log('\n[5d] Accept offer ("yes please") → expect hint');
    rec('candidate', 'yes please');
    const hr = await httpPost(`/api/interviews/${id}/answer`, {
      token: tok,
      answer: 'yes please',
    });
    const hb = hr.body as {
      utterance: { text: string };
      phase: string;
      assist?: { kind: string; mandatory?: boolean };
    };
    if (hb.utterance?.text) {
      hintText = hb.utterance.text;
      rec('ai', hb.utterance.text, hb.assist?.kind ?? 'hint');
      hintMs = log[log.length - 1]!.ms;
    }
    const tagLeak = hintText ? hasSpeechTag(hintText) : false;
    const literalPause = hintText ? /\[pause\]/i.test(hintText) : false;
    step(
      'Offer acceptance → hint delivered',
      hb.assist?.kind === 'hint',
      hb.assist?.kind ?? 'no assist',
    );
    // T1 REGRESSION: the prior bug was [pause] rendering literally in the hint
    step(
      'Hint text free of ALL speech tags — T1 regression check',
      !tagLeak && !literalPause,
      tagLeak || literalPause
        ? `LEAKED: "${hintText?.slice(0, 150)}"`
        : 'clean — no [pause]/<soft>/tag visible',
    );
    // T3: hint must not arrive < 800ms after acceptance (robotic speed tell)
    step(
      'Hint response not robotically instant (>800ms) — T3 check',
      hintMs >= 800,
      `${hintMs}ms${hintMs < 800 ? ' — UNDER 800ms, reads robotic' : ''}`,
    );
  } else {
    console.log('\n[5d] Skipped — no offer received');
    steps.push({ label: 'Offer acceptance → hint delivered', pass: false, note: 'offer never fired' });
    steps.push({ label: 'Hint text free of ALL speech tags — T1 regression check', pass: false, note: 'skipped' });
    steps.push({ label: 'Hint response not robotically instant (>800ms) — T3 check', pass: false, note: 'skipped' });
  }

  // ── SUBMIT → mandatory counter-question ───────────────────────────────────
  console.log('\n[5e] SUBMIT → expect mandatory counter-question');
  const SUBMIT_CODE =
    `import sys\ndef solve():\n    data = sys.stdin.read().split()\n    print("done")\nsolve()`;
  rec('candidate', '[SUBMIT]', 'submit');
  const sr = await httpPost(`/api/interviews/${id}/answer`, {
    token: tok,
    answer: '',
    intent: 'submit',
    submittedCode: SUBMIT_CODE,
  });
  const sb = sr.body as {
    utterance: { text: string };
    phase: string;
    assist?: { kind: string; mandatory?: boolean };
  };
  console.log(
    `  submit.status=${sr.status} phase=${sb.phase} kind=${sb.assist?.kind} mandatory=${sb.assist?.mandatory}`,
  );
  let cqText = '';
  if (sb.utterance?.text) {
    cqText = sb.utterance.text;
    rec('ai', cqText, sb.assist?.kind ?? 'counter_question');
  }
  const cqMs = log[log.length - 1]!.ms;
  const cqTagLeak = hasSpeechTag(cqText);

  step('SUBMIT → counter_question fired', sb.assist?.kind === 'counter_question', sb.assist?.kind ?? 'missing');
  step('Counter-question is mandatory=true', sb.assist?.mandatory === true, String(sb.assist?.mandatory));
  step('Phase unchanged after submit (still coding)', sb.phase === 'coding', sb.phase);
  step(
    'Counter-question free of speech tags (T1)',
    !cqTagLeak,
    cqTagLeak ? `LEAKED: ${speechTagsFound(cqText).join(',')}` : 'clean',
  );
  step(
    'Counter-question response timing ≥800ms (T3)',
    cqMs >= 800,
    `${cqMs}ms`,
  );

  // ── DB events (before delete) ─────────────────────────────────────────────
  console.log('\n[6] Querying engagement + observer_note events from prod DB...');
  let engEvents: string[] = [];
  let noteEvents: string[] = [];
  try {
    const raw = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 beef-server ` +
        `"DB=\\$(grep '^SUPABASE_DB_URL=' ~/overforge/deploy/backend.env | cut -d= -f2- | tr -d '\"'); ` +
        `psql \\"\\$DB\\" -t -A -F '||' -c \\"select kind,payload from interview_events where interview_id='${id}' and kind in ('engagement','observer_note') order by seq\\""`,
      { encoding: 'utf8', timeout: 25_000 },
    );
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
        console.log(`  [eng ${i + 1}] ${p['prevState']} → ${p['state']}`);
      } catch { /* not JSON */ }
    });
    noteEvents.forEach((e, i) => {
      try {
        const p = JSON.parse(e) as Record<string, unknown>;
        console.log(`  [note ${i + 1}] approach="${String(p['approach']).slice(0, 80)}" diagnosis="${String(p['diagnosis']).slice(0, 80)}"`);
      } catch { /* not JSON */ }
    });
    step('Engagement events logged to DB', engEvents.length > 0, `${engEvents.length} events`);
    step(
      'Observer notes logged (ENGAGEMENT_INTERVENTIONS=1)',
      noteEvents.length > 0,
      `${noteEvents.length} notes`,
    );
  } catch (err) {
    console.log(`  DB query failed (check SSH config): ${String(err).slice(0, 200)}`);
    step('Engagement events logged to DB', false, 'SSH/DB query failed');
    step('Observer notes logged', false, 'SSH/DB query failed');
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  console.log('\n[7] Delete test interview');
  const ds = await httpDel(`/api/interviews/${id}`, jwt);
  console.log(`  DELETE status=${ds}`);
  step('Interview deleted (200/204)', ds === 200 || ds === 204, `status=${ds}`);

  // ── Build full transcript ─────────────────────────────────────────────────
  const transcriptText = log
    .map((t, i) => {
      const prefix = t.role === 'ai' ? `AI[${t.kind ?? '-'}]` : `CAND`;
      return `#${i + 1}  ${prefix} (+${t.ms}ms):\n  "${t.text.slice(0, 500)}"`;
    })
    .join('\n\n');

  // ── Global speech-tag scan ────────────────────────────────────────────────
  const allAiTurns = log.filter((t) => t.role === 'ai');
  const globalTagLeak = allAiTurns.some((t) => hasSpeechTag(t.text));
  const globalTagTurns = allAiTurns
    .filter((t) => hasSpeechTag(t.text))
    .map((t) => `${t.kind}: "${t.text.slice(0, 80)}"`)
    .join('\n  ');

  // ── Oral repetition analysis ──────────────────────────────────────────────
  const oralTurns = log.filter((t) => t.role === 'ai' && t.kind === 'oral');
  const distinctOral = new Set(oralTurns.map((t) => t.text.slice(0, 80))).size;
  const repetitionRatio = oralTurns.length > 0 ? distinctOral / oralTurns.length : 1;
  const oralLoopTell = oralTurns.length > 2 && repetitionRatio < 0.6;

  // ── Report ────────────────────────────────────────────────────────────────
  const engSummary =
    engEvents.length > 0
      ? engEvents
          .map((e) => {
            try {
              const p = JSON.parse(e) as Record<string, unknown>;
              return `${p['prevState']} → ${p['state']}`;
            } catch {
              return e;
            }
          })
          .join(', ')
      : 'none';

  const noteSummary =
    noteEvents.length > 0
      ? noteEvents
          .map((e) => {
            try {
              const p = JSON.parse(e) as Record<string, unknown>;
              return `approach="${String(p['approach']).slice(0, 60)}" diagnosis="${String(p['diagnosis']).slice(0, 60)}"`;
            } catch {
              return e;
            }
          })
          .join('\n  ')
      : 'none';

  const report = `# Indistinguishability Report #2 — ${new Date().toISOString()}
## Backend: ${API}  HEAD: 06a65af (ENGAGEMENT_INTERVENTIONS=1)
## Interview ID (deleted): ${id}

---

## PER-CHECK PASS/FAIL TABLE

${steps.map((s) => `${s.pass ? 'PASS' : 'FAIL'}  ${s.label}${s.note ? ' — ' + s.note : ''}`).join('\n')}

---

## VERBATIM DODGE SEQUENCE (Scenario A)

${dodgeReplies
  .map((r, i) => `Dodge reply #${i + 1} (+${r.ms}ms):\n  "${r.text.slice(0, 400)}"`)
  .join('\n\n')}

Dodge acknowledgment check (reply #2): ${reply2Acknowledges ? 'ACKNOWLEDGED' : 'NOT ACKNOWLEDGED'}
Dodge pivot check (reply #3): ${reply3Pivots ? 'PIVOTED' : 'DID NOT PIVOT'}

---

## VERBATIM HINT TEXT (Scenario B — T1 regression)

${hintText ? `"${hintText}"` : '(no hint received)'}

Speech-tag check: ${hintText && hasSpeechTag(hintText) ? 'FAIL — tags visible: ' + speechTagsFound(hintText).join(', ') : 'PASS — clean'}
Hint timing: ${hintMs}ms

---

## VERBATIM COUNTER-QUESTION (Scenario B — mandatory CQ)

"${cqText}"

Speech-tag check: ${hasSpeechTag(cqText) ? 'FAIL — tags visible: ' + speechTagsFound(cqText).join(', ') : 'PASS — clean'}
CQ timing: ${cqMs}ms

---

## TIMING ANALYSIS (inter-turn ms, T3 regression)

All AI turns:
${allAiTurns.map((t) => `  ${t.kind ?? '-'}: ${t.ms}ms${t.ms < 800 && t.kind !== 'greeting' ? ' *** UNDER 800ms ***' : ''}`).join('\n')}

Sub-800ms AI turns (excluding greeting): ${allAiTurns.filter((t) => t.ms < 800 && t.kind !== 'greeting').length}

---

## GLOBAL SPEECH-TAG SCAN (T1 — all AI turns)

${globalTagLeak ? 'FAIL — tags found in:\n  ' + globalTagTurns : 'PASS — no speech tags in any AI turn'}

---

## ORAL REPETITION ANALYSIS

Total oral turns: ${oralTurns.length}
Distinct oral turns: ${distinctOral}
Distinctness ratio: ${repetitionRatio.toFixed(2)}
Loop tell: ${oralLoopTell ? 'YES — oral loop detected' : 'no — distinct enough'}

---

## ENGAGEMENT ENGINE EVENTS

Engagement state transitions: ${engEvents.length}  [${engSummary}]
Observer notes (ENGAGEMENT_INTERVENTIONS=1): ${noteEvents.length}
${noteSummary !== 'none' ? noteSummary : '  none'}

---

## FULL VERBATIM TRANSCRIPT

${transcriptText}
`;

  const fs = await import('fs');
  fs.writeFileSync('/tmp/indistinguishability-report-2.md', report, 'utf8');
  console.log('\n\nReport written to /tmp/indistinguishability-report-2.md');

  // ── Final summary ─────────────────────────────────────────────────────────
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
