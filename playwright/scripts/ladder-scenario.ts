// API-first indistinguishability ladder scenario.
// Drives the full Path-A + Path-C interaction purely through REST calls — no browser.
// Records every interviewer utterance verbatim with timing and kind for the report.
//
// Run: npx tsx scripts/ladder-scenario.ts

import { getAccessToken } from '../helpers/auth';
import { config } from '../helpers/env';

const API = config.apiUrl;
const LANG = 'python';

// ────────────────────── Transcript recorder ──────────────────────

interface Turn {
  role: 'candidate' | 'interviewer';
  text: string;
  kind?: string;
  ms?: number;
}

const transcript: Turn[] = [];
let lastTs = Date.now();

function record(role: 'candidate' | 'interviewer', text: string, kind?: string): void {
  const now = Date.now();
  const ms = now - lastTs;
  lastTs = now;
  const t: Turn = { role, text: text.trim(), ms };
  if (kind) t.kind = kind;
  transcript.push(t);
  const prefix = role === 'interviewer' ? `[AI${kind ? `:${kind}` : ''}]` : '[C]';
  console.log(`\n${prefix} (+${ms}ms)\n  ${text.trim().slice(0, 300)}`);
}

// ────────────────────── HTTP helpers ──────────────────────

async function post(
  path: string,
  body: Record<string, unknown>,
  jwt?: string
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let responseBody: unknown;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    responseBody = await res.json();
  } else {
    responseBody = await res.text();
  }
  return { ok: res.ok, status: res.status, body: responseBody };
}

async function del(path: string, jwt: string): Promise<{ status: number }> {
  const res = await fetch(`${API}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return { status: res.status };
}

// ────────────────────── Poll run-intervention with retries ──────────────────────

async function pollRunIntervention(
  id: string,
  token: string,
  waitMs: number,
  label: string
): Promise<{ intervention: { text: string; kind: string } | null }> {
  const deadline = Date.now() + waitMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    const delayMs = [2000, 2000, 3000, 3000, 5000][Math.min(attempts, 4)] ?? 5000;
    await sleep(delayMs);
    attempts++;
    const r = await post(`/api/interviews/${id}/run-intervention`, { token });
    const b = r.body as { intervention: { text: string; kind: string } | null; pending: boolean };
    console.log(`  [poll-run-iv/${label}] attempt=${attempts} pending=${b.pending} kind=${b.intervention?.kind ?? 'null'}`);
    if (!b.pending) {
      return { intervention: b.intervention };
    }
  }
  return { intervention: null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ────────────────────── Main ──────────────────────

async function main(): Promise<void> {
  console.log('=== Ladder Scenario: API-first indistinguishability test ===\n');

  // ── Step 1: Auth + create interview ──────────────────────────────────────────
  console.log('[STEP 1] Getting access token and creating interview...');
  const jwt = await getAccessToken();

  const createRes = await post(
    '/api/interviews',
    {
      candidateEmail: 'ladder-test@overforge.local',
      candidateName: 'Alex (ladder test)',
      language: LANG,
      level: 'mid',
      devMode: true,
    },
    jwt
  );
  if (!createRes.ok)
    throw new Error(`createInterview failed ${createRes.status}: ${JSON.stringify(createRes.body)}`);
  const { id, token: inviteToken } = createRes.body as { id: string; token: string; link: string };
  console.log(`  interview.id = ${id}`);

  // ── Step 2: Begin (consume invite token → session token) ──────────────────────
  console.log('\n[STEP 2] begin...');
  const beginRes = await post(`/api/interviews/${id}/begin`, {
    token: inviteToken,
    tncAccepted: true,
  });
  if (!beginRes.ok)
    throw new Error(`begin failed ${beginRes.status}: ${JSON.stringify(beginRes.body)}`);
  const { sessionToken, utterance: greeting, phase: startPhase } = beginRes.body as {
    sessionToken: string;
    utterance: { text: string };
    phase: string;
  };
  const token = sessionToken;
  record('interviewer', greeting.text, 'greeting');
  console.log(`  phase=${startPhase}`);

  // ── Step 3: Drive through oral until coding ───────────────────────────────────
  console.log('\n[STEP 3] Advancing through oral phase...');
  const ORAL_ANSWERS = [
    "I'd start by clarifying requirements and constraints, then think about data structures — ideally picking the simplest correct approach before optimizing.",
    "For a hash-map approach I'd use O(n) time and space, but if memory matters a two-pointer approach on a sorted array is O(n log n) time, O(1) space.",
    "I always validate with edge cases: empty input, single element, negative numbers, overflow, and any boundary conditions the problem mentions.",
    "I'd look for invariants I can exploit — sorted order, bounded range — to reduce complexity, and only optimize once correctness is established.",
  ];
  let phase = startPhase;
  let oralTurns = 0;
  while (phase !== 'coding' && phase !== 'done' && oralTurns < 8) {
    const answer = ORAL_ANSWERS[oralTurns % ORAL_ANSWERS.length]!;
    record('candidate', answer);
    const aRes = await post(`/api/interviews/${id}/answer`, { token, answer });
    if (!aRes.ok)
      throw new Error(`answer failed ${aRes.status}: ${JSON.stringify(aRes.body)}`);
    const { utterance: reply, phase: newPhase } = aRes.body as {
      utterance: { text: string };
      phase: string;
    };
    if (reply?.text) record('interviewer', reply.text, 'oral');
    phase = newPhase;
    oralTurns++;
    console.log(`  oral turn ${oralTurns}: phase=${phase}`);
    if (phase === 'coding') break;
    await sleep(300);
  }

  if (phase !== 'coding') throw new Error(`Never reached coding phase (last: ${phase})`);

  // ── Step 4: Get the assigned coding problem ───────────────────────────────────
  console.log('\n[STEP 4] Fetching coding problem...');
  const cpRes = await post(`/api/interviews/${id}/coding-problem`, { token });
  const cpBody = cpRes.body as { codeIndex: number; total: number; problem: { title: string; statement: string } | null };
  console.log(`  Problem: "${cpBody.problem?.title ?? '(no bank problem)'}" (${cpBody.codeIndex + 1}/${cpBody.total})`);

  const WRONG_ATTEMPT = `import sys
data = sys.stdin.read().split()
print(len(data))`;

  // Wrong attempt variants — near-identical failing runs = stagnant (same failure sig) + non-trivial
  const variants = [
    WRONG_ATTEMPT,
    WRONG_ATTEMPT + '\n# attempt 2',
    WRONG_ATTEMPT + '\n# attempt 3',
    WRONG_ATTEMPT + '\n# attempt 4',
    WRONG_ATTEMPT + '\n# attempt 5',
  ];

  // ── Step 5a: Wrong run 1 — expect NO intervention ────────────────────────────
  console.log('\n[STEP 5a] Run 1 (wrong) — expect silence...');
  record('candidate', variants[0]!, 'code');
  const run1Res = await post(`/api/interviews/${id}/run`, {
    token, language: LANG, source: variants[0]!,
  });
  const run1 = run1Res.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  run1.status=${run1.status} interventionPending=${run1.interventionPending}`);

  if (run1.interventionPending) {
    const iv = await pollRunIntervention(id, token, 15_000, 'run1');
    if (iv.intervention) {
      record('interviewer', iv.intervention.text, iv.intervention.kind);
      console.log('  [TELL] interviewer spoke on run 1 — expected silence!');
    } else {
      console.log('  [PASS] no intervention on run 1 ✓');
    }
  } else if (run1.intervention) {
    record('interviewer', run1.intervention.text, run1.intervention.kind);
    console.log('  [TELL] intervention on run 1 — expected silence!');
  } else {
    console.log('  [PASS] no intervention on run 1 ✓');
  }

  // ── Step 5b: Wrong run 2 — expect PROBE ──────────────────────────────────────
  console.log('\n[STEP 5b] Run 2 (wrong, same signature) — expect probe...');
  // Ingest a few snapshots to establish churn signal between runs
  for (let s = 1; s <= 3; s++) {
    await post(`/api/interviews/${id}/snapshot`, {
      token, code: variants[0]! + `\n# thinking... ${s}`, language: LANG, seq: s,
    });
    await sleep(500);
  }
  record('candidate', variants[1]!, 'code');
  const run2Res = await post(`/api/interviews/${id}/run`, {
    token, language: LANG, source: variants[1]!,
  });
  const run2 = run2Res.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  run2.status=${run2.status} interventionPending=${run2.interventionPending}`);

  let run2Kind: string | undefined;
  if (run2.interventionPending) {
    console.log('  polling run-intervention at 2s / 4s / 7s...');
    const iv = await pollRunIntervention(id, token, 15_000, 'run2');
    if (iv.intervention) {
      run2Kind = iv.intervention.kind;
      record('interviewer', iv.intervention.text, iv.intervention.kind);
      console.log(`  [LADDER] kind=${iv.intervention.kind}`);
    } else {
      console.log('  [MISS] no intervention on run 2');
    }
  } else if (run2.intervention) {
    run2Kind = run2.intervention.kind;
    record('interviewer', run2.intervention.text, run2.intervention.kind);
    console.log(`  [LADDER] kind=${run2.intervention.kind}`);
  } else {
    console.log('  [MISS] no intervention on run 2');
  }

  // ── Step 5c: Wrong run 3 — expect OFFER (stagnant) ──────────────────────────
  console.log('\n[STEP 5c] Run 3 (wrong, stagnant) — expect offer...');
  for (let s = 4; s <= 6; s++) {
    await post(`/api/interviews/${id}/snapshot`, {
      token, code: variants[1]! + `\n# still thinking ${s}`, language: LANG, seq: s,
    });
    await sleep(500);
  }
  record('candidate', variants[2]!, 'code');
  const run3Res = await post(`/api/interviews/${id}/run`, {
    token, language: LANG, source: variants[2]!,
  });
  const run3 = run3Res.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  run3.status=${run3.status} interventionPending=${run3.interventionPending}`);

  let offerReceived = false;
  let run3Kind: string | undefined;
  if (run3.interventionPending) {
    const iv = await pollRunIntervention(id, token, 15_000, 'run3');
    if (iv.intervention) {
      run3Kind = iv.intervention.kind;
      offerReceived = iv.intervention.kind === 'offer';
      record('interviewer', iv.intervention.text, iv.intervention.kind);
      console.log(`  [LADDER] kind=${iv.intervention.kind}`);
    } else {
      console.log('  [MISS] no intervention on run 3');
    }
  } else if (run3.intervention) {
    run3Kind = run3.intervention.kind;
    offerReceived = run3.intervention.kind === 'offer';
    record('interviewer', run3.intervention.text, run3.intervention.kind);
    console.log(`  [LADDER] kind=${run3.intervention.kind}`);
  } else {
    console.log('  [MISS] no intervention on run 3');
  }

  // ── Step 5d: ACCEPT the offer (if received) ───────────────────────────────────
  if (offerReceived) {
    console.log('\n[STEP 5d] Accepting the offer ("yes please")...');
    record('candidate', 'yes please, give me a hint');
    const acceptRes = await post(`/api/interviews/${id}/answer`, {
      token, answer: 'yes please, give me a hint',
    });
    const acceptBody = acceptRes.body as { utterance: { text: string }; phase: string; assist?: { kind: string } };
    if (acceptBody.utterance?.text) {
      record('interviewer', acceptBody.utterance.text, acceptBody.assist?.kind ?? 'hint');
      console.log(`  [OFFER RESOLUTION] phase=${acceptBody.phase} kind=${acceptBody.assist?.kind ?? 'unknown'}`);
      if (acceptBody.assist?.kind !== 'hint') {
        console.log('  [BUG] offer accepted but kind is not hint!');
      }
    }
  } else {
    console.log('\n[STEP 5d] Skipping offer acceptance (no offer received on run 3).');
  }

  // ── Step 5e: Send 6 snapshots simulating churn, wait ~95s, POST /nudge with reason:'quiescent' ──
  console.log('\n[STEP 5e] Sending 6 churn snapshots then nudge with reason:quiescent...');
  const churnBase = WRONG_ATTEMPT;
  for (let i = 0; i < 6; i++) {
    const code = churnBase + `\n# churn edit ${i} ${'x'.repeat(i * 5)}`;
    await post(`/api/interviews/${id}/snapshot`, {
      token, code, language: LANG, seq: 10 + i,
    });
    console.log(`  snapshot ${i + 1}/6 sent`);
    await sleep(1000);
  }
  console.log('  snapshots sent. Waiting 5s then nudging with reason:quiescent...');
  await sleep(5_000);

  record('candidate', '[quiescent — 5s+ no run, churn detected]');
  const nudgeRes = await post(`/api/interviews/${id}/nudge`, {
    token,
    codeLength: churnBase.length,
    reason: 'quiescent',
  });
  const nudgeBody = nudgeRes.body as { intervention: { text: string; kind: string; strength: number } | null };
  console.log(`  nudge.status=${nudgeRes.status}`);
  if (nudgeBody.intervention) {
    record('interviewer', nudgeBody.intervention.text, nudgeBody.intervention.kind);
    console.log(`  [QUIESCENT] kind=${nudgeBody.intervention.kind} strength=${nudgeBody.intervention.strength}`);
  } else {
    console.log('  nudge → no intervention (expected: gated by cooldown or flag off)');
  }

  // ── Step 5f: PASSING run → expect encourage (if ENGAGEMENT_INTERVENTIONS=1) ──
  const CORRECT_ATTEMPT = `import sys

def solve():
    data = sys.stdin.read().split()
    # Intentionally wrong output but "Accepted" status (clean exit)
    print("done")

solve()`;

  console.log('\n[STEP 5f] Passing run (or a cleaner wrong run) — check for encourage...');
  for (let s = 20; s <= 22; s++) {
    await post(`/api/interviews/${id}/snapshot`, {
      token, code: CORRECT_ATTEMPT, language: LANG, seq: s,
    });
    await sleep(300);
  }
  record('candidate', CORRECT_ATTEMPT, 'code:improved');
  const run4Res = await post(`/api/interviews/${id}/run`, {
    token, language: LANG, source: CORRECT_ATTEMPT,
  });
  const run4 = run4Res.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  run4.status=${run4.status} interventionPending=${run4.interventionPending}`);

  if (run4.interventionPending) {
    const iv = await pollRunIntervention(id, token, 15_000, 'run4');
    if (iv.intervention) {
      record('interviewer', iv.intervention.text, iv.intervention.kind);
      console.log(`  [ENCOURAGE?] kind=${iv.intervention.kind}`);
    } else {
      console.log('  no encourage (expected if ENGAGEMENT_INTERVENTIONS off or budget empty)');
    }
  } else if (run4.intervention) {
    record('interviewer', run4.intervention.text, run4.intervention.kind);
    console.log(`  [ENCOURAGE?] kind=${run4.intervention.kind}`);
  } else {
    console.log('  no encourage after better run');
  }

  // ── Step 5g: SUBMIT — mandatory counter-question ──────────────────────────────
  console.log('\n[STEP 5g] SUBMIT — expect mandatory counter-question...');
  record('candidate', '[SUBMIT]', 'submit');
  const submitRes = await post(`/api/interviews/${id}/answer`, {
    token,
    answer: '',
    intent: 'submit',
    submittedCode: CORRECT_ATTEMPT,
  });
  const submitBody = submitRes.body as {
    utterance: { text: string };
    phase: string;
    assist?: { kind: string; mandatory?: boolean };
  };
  console.log(`  submit.status=${submitRes.status} phase=${submitBody.phase} assist.kind=${submitBody.assist?.kind} mandatory=${submitBody.assist?.mandatory}`);
  if (submitBody.utterance?.text) {
    record('interviewer', submitBody.utterance.text, submitBody.assist?.kind ?? 'counter_question');
  }

  // ── Step 6: Print full transcript ──────────────────────────────────────────────
  console.log('\n\n========== FULL VERBATIM TRANSCRIPT ==========');
  transcript.forEach((t, i) => {
    const prefix = t.role === 'interviewer' ? `AI[${t.kind ?? '-'}]` : `CAND`;
    console.log(`\n#${i + 1} ${prefix} (+${t.ms ?? 0}ms):\n  ${t.text.slice(0, 600)}`);
  });

  // ── Step 7: Query DB for engagement + observer_note events ────────────────────
  console.log('\n\n========== DB EVENTS ==========');
  console.log(`Interview ID: ${id}`);
  console.log('Run this on the beef-server:');
  console.log(`  DB=$(grep "^SUPABASE_DB_URL=" ~/overforge/deploy/backend.env | cut -d= -f2- | tr -d '"')`);
  console.log(`  psql "$DB" -c "select type, payload from interview_events where interview_id='${id}' and type in ('engagement','observer_note') order by seq"`);

  // ── Step 8: Ladder summary ─────────────────────────────────────────────────────
  console.log('\n\n========== LADDER VERDICT ==========');
  const ladderKinds = transcript
    .filter((t) => t.role === 'interviewer')
    .map((t) => t.kind ?? 'unknown');

  function pass(label: string, cond: boolean): void {
    console.log(`  ${cond ? 'PASS' : 'FAIL'} ${label}`);
  }

  pass('Run 1 → silence (no intervention)', !ladderKinds.slice(1).some((k) => k !== 'greeting' && k !== 'oral' && ladderKinds.indexOf(k) <= ladderKinds.indexOf(run2Kind ?? '')));
  pass('Run 2 → probe', run2Kind === 'probe');
  pass('Run 3 → offer (stagnant)', run3Kind === 'offer');
  pass('Offer acceptance → hint delivered', offerReceived ? ladderKinds.includes('hint') : true);
  pass('SUBMIT → counter_question with mandatory=true', submitBody.assist?.kind === 'counter_question' && submitBody.assist?.mandatory === true);
  pass('No hidden-test content in any utterance', transcript
    .filter((t) => t.role === 'interviewer')
    .every((t) => !t.text.toLowerCase().includes('referencepython') && !t.text.toLowerCase().includes('tests passed')));

  // ── Step 9: Cleanup ────────────────────────────────────────────────────────────
  console.log('\n[STEP 9] Deleting test interview...');
  const delRes = await del(`/api/interviews/${id}`, jwt);
  console.log(`  DELETE status=${delRes.status}`);
  if (delRes.status === 204 || delRes.status === 200) {
    console.log('  Interview deleted.');
  } else {
    console.log('  [WARN] delete did not return 2xx — check dashboard for leftover row');
  }

  console.log('\n=== Ladder scenario complete ===');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
