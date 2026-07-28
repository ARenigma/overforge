// Targeted persistence check — runs independently of the dodge scenario.
// Creates an interview, drives quickly to coding, sends 8 snapshots + 2 failing runs,
// waits 10s, then queries the DB for engagement/observer_note BEFORE deleting.
//
// Run: OF_TEST_PASSWORD='...' npx tsx playwright/scripts/persistence-check.ts

import { getAccessToken } from '../helpers/auth';
import { config } from '../helpers/env';
import { execSync } from 'child_process';

const API = config.apiUrl;
const LANG = 'python';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function post(
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
    const r = await post(`/api/interviews/${id}/run-intervention`, { token });
    const b = r.body as { pending: boolean; intervention: { text: string; kind: string } | null };
    console.log(`  [poll/${label}] attempt=${attempt} pending=${b.pending} kind=${b.intervention?.kind ?? 'null'}`);
    if (!b.pending) return b.intervention;
  }
  return null;
}

async function main(): Promise<void> {
  console.log('=== PERSISTENCE CHECK (engagement + observer_note) ===');
  console.log(`  Backend: ${API}  Time: ${new Date().toISOString()}\n`);

  const jwt = await getAccessToken();

  // Create
  const cr = await post(
    '/api/interviews',
    { candidateEmail: 'persist-check@overforge.local', candidateName: 'Persist Check', language: LANG, level: 'mid', devMode: true },
    jwt,
  );
  if (!cr.ok) throw new Error(`create: ${cr.status} ${JSON.stringify(cr.body)}`);
  const { id, token: inv } = cr.body as { id: string; token: string };
  console.log(`  interview.id = ${id}`);

  // Begin
  const br = await post(`/api/interviews/${id}/begin`, { token: inv, tncAccepted: true });
  if (!br.ok) throw new Error(`begin: ${br.status}`);
  const { sessionToken, phase: startPhase } = br.body as {
    sessionToken: string;
    utterance: { text: string };
    phase: string;
  };
  const tok = sessionToken;
  console.log(`  greeting received, phase=${startPhase}`);

  // Drive oral to coding with 3 genuine answers
  const ORAL = [
    'I built a distributed task queue using Redis Streams and consumer groups. The main challenge was exactly-once delivery guarantees under consumer failure — we used XACK plus a periodic dead-letter sweeper that re-queued unacknowledged messages after a TTL.',
    'We used optimistic locking via a version field on each task row in Postgres. The consumer would read, process, then UPDATE WHERE version=N; if 0 rows affected, it backed off and retried. This eliminated double-processing without a distributed lock.',
    'We measured end-to-end latency via OpenTelemetry spans from enqueue to completion. P99 was 340ms at 1k tasks/sec. The bottleneck was Postgres WAL sync; switching to async commit cut it to 180ms at the cost of rare duplicate delivery.',
  ];
  let phase = startPhase;
  let turn = 0;
  while (!['coding', 'done'].includes(phase) && turn < 8) {
    const ans = ORAL[turn % ORAL.length]!;
    const ar = await post(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { phase: np } = ar.body as { utterance: { text: string }; phase: string };
    phase = np;
    turn++;
    console.log(`  oral turn ${turn}: phase=${phase}`);
    if (phase === 'coding') break;
    await sleep(300);
  }
  if (phase !== 'coding') throw new Error(`Never reached coding (last: ${phase})`);
  console.log('\n  Reached coding phase.');

  // Fetch problem
  const cpr = await post(`/api/interviews/${id}/coding-problem`, { token: tok });
  const cpb = cpr.body as { problem: { title: string } | null; codeIndex: number; total: number };
  console.log(`  Problem: "${cpb.problem?.title ?? '(none)'}" (${cpb.codeIndex + 1}/${cpb.total})`);

  // 8 snapshots: grow then deletion burst
  const BASE = `import sys\ndata = sys.stdin.read().split()\n`;
  const SNAPS = [
    BASE + `print(0)`,
    BASE + `n = int(data[0])\nprint(n)`,
    BASE + `n = int(data[0])\nnums = list(map(int, data[1:n+1]))\nprint(n)`,
    BASE + `n = int(data[0])\nnums = list(map(int, data[1:n+1]))\nmin_p = nums[0]\nmax_p = 0`,
    BASE + `n = int(data[0])\nnums = list(map(int, data[1:n+1]))\nmin_p = nums[0]\nmax_profit = 0\nfor p in nums:\n    max_profit = max(max_profit, p - min_p)\n    min_p = min(min_p, p)`,
    // deletion burst
    BASE + `print(0)`,
    BASE + `pass`,
    BASE + `n = 0\nprint(n)`,
  ];
  console.log('\n  Sending 8 snapshots...');
  for (let s = 0; s < SNAPS.length; s++) {
    await post(`/api/interviews/${id}/snapshot`, { token: tok, code: SNAPS[s]!, language: LANG, seq: s + 1 });
    console.log(`  snap ${s + 1}/8`);
    await sleep(400);
  }

  // Failing run 1
  const WRONG1 = BASE + `print(0)`;
  console.log('\n  Run 1 (wrong)...');
  const rn1 = await post(`/api/interviews/${id}/run`, { token: tok, language: LANG, source: WRONG1 });
  const rn1b = rn1.body as { status: string; interventionPending?: boolean };
  console.log(`  run1.status=${rn1b.status} pending=${rn1b.interventionPending}`);
  if (rn1b.interventionPending) {
    const iv = await pollIV(id, tok, 15_000, 'r1');
    if (iv) console.log(`  run1 intervention: kind=${iv.kind} text="${iv.text.slice(0, 80)}"`);
    else console.log('  run1: no intervention (silence — expected)');
  }

  // Failing run 2
  const WRONG2 = BASE + `n = int(data[0])\nprint(n)`;
  console.log('\n  Run 2 (wrong)...');
  const rn2 = await post(`/api/interviews/${id}/run`, { token: tok, language: LANG, source: WRONG2 });
  const rn2b = rn2.body as { status: string; interventionPending?: boolean };
  console.log(`  run2.status=${rn2b.status} pending=${rn2b.interventionPending}`);
  if (rn2b.interventionPending) {
    const iv = await pollIV(id, tok, 20_000, 'r2');
    if (iv) console.log(`  run2 intervention: kind=${iv.kind} text="${iv.text.slice(0, 120)}"`);
    else console.log('  run2: no intervention');
  }

  // Wait for async writer
  console.log('\n  Waiting 10s for async engagement writer...');
  await sleep(10_000);

  // DB query BEFORE delete — write interview ID to a temp file on beef-server, then query
  console.log('\n=== DB QUERY (before delete) ===');
  console.log(`  Interview ID: ${id}`);
  try {
    // First check if any events landed at all (all kinds)
    const allKinds = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 beef-server bash -s`,
      {
        encoding: 'utf8',
        timeout: 25_000,
        input: `DB=$(grep '^SUPABASE_DB_URL=' ~/overforge/deploy/backend.env | cut -d= -f2- | tr -d '"')
psql "$DB" -qA -F '|' -c "select kind, count(*) from interview_events where interview_id='${id}' group by kind order by kind"`,
      },
    );
    console.log('  All event kinds for this interview:');
    console.log(allKinds.trim() || '  (no events at all)');

    // Now check engagement + observer_note specifically
    const engRaw = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 beef-server bash -s`,
      {
        encoding: 'utf8',
        timeout: 25_000,
        input: `DB=$(grep '^SUPABASE_DB_URL=' ~/overforge/deploy/backend.env | cut -d= -f2- | tr -d '"')
psql "$DB" -qA -F '|' -c "select kind, payload->>'state' as state, left(payload::text,120) from interview_events where interview_id='${id}' and kind in ('engagement','observer_note') order by seq"`,
      },
    );
    console.log('\n  engagement + observer_note rows:');
    console.log(engRaw.trim() || '  (none)');

    const engCount = (engRaw.match(/^engagement/gm) ?? []).length;
    const noteCount = (engRaw.match(/^observer_note/gm) ?? []).length;
    console.log(`\n  RESULT: engagement=${engCount} observer_note=${noteCount}`);

    if (engCount > 0) {
      console.log('  PASS B1: engagement events ARE flowing to DB');
    } else {
      console.log('  FAIL B1: NO engagement events in DB');
    }
    if (noteCount > 0) {
      console.log('  PASS B2: observer_note events present');
    } else {
      console.log('  NOTE B2: no observer_note (needs ENGAGEMENT_INTERVENTIONS=1 + LLM observer call)');
    }
  } catch (err) {
    console.log(`  DB query error: ${String(err).slice(0, 300)}`);
  }

  // Delete
  console.log('\n=== DELETE ===');
  const dr = await fetch(`${API}/api/interviews/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  console.log(`  DELETE status=${dr.status}`);
}

main().catch((err) => { console.error('[FATAL]', err); process.exit(1); });
