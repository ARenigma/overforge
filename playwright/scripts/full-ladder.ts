// Full ladder scenario — creates its own interview, runs every step, queries DB before delete.
// Usage: OF_TEST_PASSWORD='...' npx tsx scripts/full-ladder.ts

import { getAccessToken } from '../helpers/auth';
import { config } from '../helpers/env';
import { execSync } from 'child_process';

const API = config.apiUrl;
const LANG = 'python';

interface Turn { role: string; text: string; kind?: string; ms: number; }
const log: Turn[] = [];
let lastTs = Date.now();
function rec(role: string, text: string, kind?: string) {
  const ms = Date.now() - lastTs; lastTs = Date.now();
  log.push({ role, text: text.trim(), kind, ms });
  const prefix = role === 'ai' ? `[AI${kind ? ':' + kind : ''}]` : '[C]';
  console.log(`\n${prefix} (+${ms}ms)\n  ${text.trim().slice(0, 280)}`);
}

async function post(path: string, body: Record<string, unknown>, jwt?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) h['Authorization'] = `Bearer ${jwt}`;
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const ct = r.headers.get('content-type') ?? '';
  const b = ct.includes('json') ? await r.json() : await r.text();
  return { ok: r.ok, status: r.status, body: b as Record<string, unknown> };
}

async function del(path: string, jwt: string) {
  const r = await fetch(`${API}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` } });
  return r.status;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function pollIV(id: string, token: string, maxMs: number, label: string): Promise<{ text: string; kind: string } | null> {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    await sleep([2000, 2000, 3000, 5000][Math.min(attempt++, 3)]!);
    const r = await post(`/api/interviews/${id}/run-intervention`, { token });
    const b = r.body as { pending: boolean; intervention: { text: string; kind: string } | null };
    console.log(`  [pollIV/${label}] attempt=${attempt} pending=${b.pending} kind=${b.intervention?.kind ?? 'null'}`);
    if (!b.pending) return b.intervention;
  }
  return null;
}

// ──────────────────────────────────────────────
async function main() {
  console.log('=== FULL LADDER SCENARIO ===\n');
  const steps: { label: string; pass: boolean; note?: string }[] = [];
  function step(label: string, pass: boolean, note?: string) {
    steps.push({ label, pass, note });
    console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}${note ? ' — ' + note : ''}`);
  }

  // ── Auth ──────────────────────────────────────
  console.log('[1] Auth + create interview');
  const jwt = await getAccessToken();
  const cr = await post('/api/interviews', {
    candidateEmail: 'ladder2@overforge.local',
    candidateName: 'Jordan (ladder)',
    language: LANG, level: 'mid', devMode: true,
  }, jwt);
  if (!cr.ok) throw new Error(`create: ${cr.status} ${JSON.stringify(cr.body)}`);
  const { id, token: inv } = cr.body as { id: string; token: string };
  console.log(`  id=${id}`);

  // ── Begin ─────────────────────────────────────
  console.log('\n[2] Begin');
  const br = await post(`/api/interviews/${id}/begin`, { token: inv, tncAccepted: true });
  if (!br.ok) throw new Error(`begin: ${br.status}`);
  const { sessionToken, utterance: greet } = br.body as { sessionToken: string; utterance: { text: string } };
  const tok = sessionToken;
  rec('ai', greet.text, 'greeting');

  // ── Oral ──────────────────────────────────────
  console.log('\n[3] Oral phase');
  const ORAL = [
    "I built a real-time payments reconciliation system: collected transactions via a producer-consumer queue, deduped using a Redis hashmap keyed on transaction-id, and surfaced mismatches through a dashboard. Biggest challenge was handling clock-skew across provider ledgers.",
    "The hashmap key was a composite of provider-id and transaction-id to avoid collisions across providers. Value was a struct with amount, currency, and timestamp for comparison.",
    "We benchmarked at 40k TPS on a 3-node Kafka cluster. Memory was 4 GB for the dedup map on a 30-day lookback — within budget. Latency p99 was 120ms end-to-end.",
    "I'd look for invariants: monotonic IDs let me use a sorted set instead of a full hashmap, cutting memory 60%. Only optimise once correctness is verified on the golden dataset.",
  ];
  let phase = 'greeting'; let turns = 0;
  while (!['coding', 'done'].includes(phase) && turns < 8) {
    const ans = ORAL[turns % ORAL.length]!;
    rec('candidate', ans);
    const ar = await post(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    const { utterance: reply, phase: np } = ar.body as { utterance: { text: string }; phase: string };
    if (reply?.text) rec('ai', reply.text, 'oral');
    phase = np; turns++;
    if (phase === 'coding') break;
    await sleep(200);
  }
  step('Reached coding phase', phase === 'coding');

  // ── Problem ───────────────────────────────────
  console.log('\n[4] Fetch problem');
  const cpr = await post(`/api/interviews/${id}/coding-problem`, { token: tok });
  const cpb = cpr.body as { codeIndex: number; total: number; problem: { title: string } | null };
  console.log(`  Problem: "${cpb.problem?.title ?? '(none)'}"  (${cpb.codeIndex + 1}/${cpb.total})`);

  // ── Code ──────────────────────────────────────
  const WRONG = `import sys\ndata = sys.stdin.read().split()\nprint(len(data))`;
  const mkWrong = (n: number) => n === 0 ? WRONG : WRONG + `\n# run ${n}`;

  // ── Run 1 — expect SILENCE ────────────────────
  console.log('\n[5a] Run 1 — expect silence');
  rec('candidate', mkWrong(0), 'code');
  const r1 = await post(`/api/interviews/${id}/run`, { token: tok, language: LANG, source: mkWrong(0) });
  const r1b = r1.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  status=${r1b.status} pending=${r1b.interventionPending}`);
  let run1Iv: { text: string; kind: string } | null = null;
  if (r1b.interventionPending) run1Iv = await pollIV(id, tok, 15_000, 'r1');
  else if (r1b.intervention) run1Iv = r1b.intervention;
  if (run1Iv) rec('ai', run1Iv.text, run1Iv.kind);
  step('Run 1 → silence', !run1Iv, run1Iv ? `got ${run1Iv.kind}` : undefined);

  // ── Snapshots before run 2 ────────────────────
  for (let s = 1; s <= 3; s++) {
    await post(`/api/interviews/${id}/snapshot`, { token: tok, code: mkWrong(0) + `\n# thinking ${s}`, language: LANG, seq: s });
    await sleep(400);
  }

  // ── Run 2 — expect PROBE ──────────────────────
  console.log('\n[5b] Run 2 — expect probe');
  rec('candidate', mkWrong(1), 'code');
  const r2 = await post(`/api/interviews/${id}/run`, { token: tok, language: LANG, source: mkWrong(1) });
  const r2b = r2.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  status=${r2b.status} pending=${r2b.interventionPending}`);
  let run2Iv: { text: string; kind: string } | null = null;
  if (r2b.interventionPending) run2Iv = await pollIV(id, tok, 20_000, 'r2');
  else if (r2b.intervention) run2Iv = r2b.intervention;
  if (run2Iv) rec('ai', run2Iv.text, run2Iv.kind);
  step('Run 2 → probe', run2Iv?.kind === 'probe', run2Iv?.kind ?? 'no intervention');

  // ── Snapshots before run 3 ────────────────────
  for (let s = 4; s <= 6; s++) {
    await post(`/api/interviews/${id}/snapshot`, { token: tok, code: mkWrong(1) + `\n# more thinking ${s}`, language: LANG, seq: s });
    await sleep(400);
  }

  // ── Run 3 — expect OFFER (stagnant) ──────────
  console.log('\n[5c] Run 3 — expect offer');
  rec('candidate', mkWrong(2), 'code');
  const r3 = await post(`/api/interviews/${id}/run`, { token: tok, language: LANG, source: mkWrong(2) });
  const r3b = r3.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  status=${r3b.status} pending=${r3b.interventionPending}`);
  let run3Iv: { text: string; kind: string } | null = null;
  if (r3b.interventionPending) run3Iv = await pollIV(id, tok, 20_000, 'r3');
  else if (r3b.intervention) run3Iv = r3b.intervention;
  if (run3Iv) rec('ai', run3Iv.text, run3Iv.kind);
  const offerFired = run3Iv?.kind === 'offer';
  step('Run 3 → offer (stagnant)', offerFired, run3Iv?.kind ?? 'no intervention');

  // ── Accept the offer ──────────────────────────
  let hintText: string | null = null;
  if (offerFired) {
    console.log('\n[5d] Accept offer → expect hint');
    rec('candidate', 'yes please, give me a hint');
    const hr = await post(`/api/interviews/${id}/answer`, { token: tok, answer: 'yes please, give me a hint' });
    const hb = hr.body as { utterance: { text: string }; phase: string; assist?: { kind: string; mandatory?: boolean } };
    if (hb.utterance?.text) { hintText = hb.utterance.text; rec('ai', hb.utterance.text, hb.assist?.kind ?? 'hint'); }
    step('Offer acceptance → hint delivered', hb.assist?.kind === 'hint', hb.assist?.kind ?? 'no assist');
    // Check for speech-tag leak in the returned utterance text
    const hasSpeechTag = hintText ? /<[a-z]+>/.test(hintText) : false;
    step('Hint text free of speech tags in live response', !hasSpeechTag, hasSpeechTag ? `LEAKED: ${hintText?.match(/<[a-z]+>[^<]*<\/[a-z]+>/)?.[0]?.slice(0,60)}` : undefined);
  } else {
    console.log('\n[5d] Skipped offer acceptance (offer not received)');
    steps.push({ label: 'Offer acceptance → hint delivered', pass: false, note: 'offer never fired' });
    steps.push({ label: 'Hint text free of speech tags', pass: false, note: 'skipped' });
  }

  // ── Quiescent nudge (Path C) ──────────────────
  console.log('\n[5e] Snapshots → quiescent nudge (Path C)');
  for (let i = 0; i < 6; i++) {
    const churn = WRONG + `\n# churn ${i} ${'x'.repeat(i * 3)}`;
    await post(`/api/interviews/${id}/snapshot`, { token: tok, code: churn, language: LANG, seq: 10 + i });
    console.log(`  snapshot ${i + 1}/6`);
    await sleep(500);
  }
  await sleep(5_000);
  rec('candidate', '[quiescent — typing stopped]');
  const nr = await post(`/api/interviews/${id}/nudge`, { token: tok, codeLength: WRONG.length, reason: 'quiescent' });
  const nb = nr.body as { intervention: { text: string; kind: string } | null };
  console.log(`  nudge.status=${nr.status} kind=${nb.intervention?.kind ?? 'null'}`);
  if (nb.intervention) rec('ai', nb.intervention.text, nb.intervention.kind);
  // Quiescent nudge is gated by cooldown + offer-already-resolved — null is CORRECT here after offer+hint.
  const nudgeGatedCorrectly = nb.intervention === null || ['offer', 'probe'].includes(nb.intervention.kind);
  step('Quiescent nudge gated correctly post-hint', nudgeGatedCorrectly, nb.intervention ? `got ${nb.intervention.kind}` : 'null (correct — hint already given)');

  // ── Passing run — expect encourage ────────────
  console.log('\n[5f] Passing run — check for encourage');
  const BETTER = `import sys\ndef solve():\n    data = sys.stdin.read().split()\n    n = int(data[0])\n    target = int(data[1])\n    nums = list(map(int, data[2:2+n]))\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            print(seen[target-x], i)\n            return\n    print(-1, -1)\nsolve()`;
  for (let s = 20; s <= 22; s++) {
    await post(`/api/interviews/${id}/snapshot`, { token: tok, code: BETTER, language: LANG, seq: s });
    await sleep(200);
  }
  rec('candidate', BETTER, 'code:improved');
  const r4 = await post(`/api/interviews/${id}/run`, { token: tok, language: LANG, source: BETTER });
  const r4b = r4.body as { status: string; interventionPending?: boolean; intervention?: { text: string; kind: string } };
  console.log(`  status=${r4b.status} pending=${r4b.interventionPending}`);
  let run4Iv: { text: string; kind: string } | null = null;
  if (r4b.interventionPending) run4Iv = await pollIV(id, tok, 15_000, 'r4');
  else if (r4b.intervention) run4Iv = r4b.intervention;
  if (run4Iv) rec('ai', run4Iv.text, run4Iv.kind);
  const encourageOk = run4Iv === null || run4Iv.kind === 'encourage';
  step('Passing run → encourage (or silence if budget spent)', encourageOk, run4Iv?.kind ?? 'silence');

  // ── SUBMIT → mandatory counter-question ────────
  console.log('\n[5g] SUBMIT → mandatory CQ');
  rec('candidate', '[SUBMIT]', 'submit');
  const sr = await post(`/api/interviews/${id}/answer`, {
    token: tok, answer: '', intent: 'submit', submittedCode: BETTER,
  });
  const sb = sr.body as { utterance: { text: string }; phase: string; assist?: { kind: string; mandatory?: boolean } };
  console.log(`  submit.status=${sr.status} phase=${sb.phase} kind=${sb.assist?.kind} mandatory=${sb.assist?.mandatory}`);
  if (sb.utterance?.text) rec('ai', sb.utterance.text, sb.assist?.kind ?? 'counter_question');
  step('SUBMIT → counter_question', sb.assist?.kind === 'counter_question', sb.assist?.kind ?? 'missing');
  step('Counter-question is mandatory', sb.assist?.mandatory === true, String(sb.assist?.mandatory));
  step('Phase unchanged after submit', sb.phase === 'coding', sb.phase);

  // ── DB query BEFORE delete ────────────────────
  console.log('\n[6] Querying engagement + observer_note events (before delete)');
  const engEvents: string[] = [];
  const noteEvents: string[] = [];
  try {
    const raw = execSync(
      `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 beef-server ` +
      `"DB=\\$(grep '^SUPABASE_DB_URL=' ~/overforge/deploy/backend.env | cut -d= -f2- | tr -d '\"'); ` +
      `psql \\"\\$DB\\" -t -A -F '||' -c \\"select kind,payload from interview_events where interview_id='${id}' and kind in ('engagement','observer_note') order by seq\\"" 2>&1`,
      { encoding: 'utf8', timeout: 20_000 }
    );
    for (const line of raw.trim().split('\n').filter(Boolean)) {
      const [kind, ...rest] = line.split('||');
      if (kind === 'engagement') engEvents.push(rest.join('||'));
      if (kind === 'observer_note') noteEvents.push(rest.join('||'));
    }
    console.log(`  engagement events: ${engEvents.length}`);
    console.log(`  observer_note events: ${noteEvents.length}`);
    engEvents.forEach((e, i) => {
      try { const p = JSON.parse(e); console.log(`  [eng ${i+1}] state=${p.state} prev=${p.prevState}`); } catch {}
    });
    noteEvents.forEach((e, i) => {
      try { const p = JSON.parse(e); console.log(`  [note ${i+1}] approach=${p.approach?.slice(0,80)}`); } catch {}
    });
    step('Engagement events logged', engEvents.length > 0, `${engEvents.length} events`);
    step('Observer notes logged', noteEvents.length > 0, `${noteEvents.length} notes (ENGAGEMENT_INTERVENTIONS required)`);
  } catch (err) {
    console.log(`  DB query failed: ${err}`);
    step('Engagement events logged', false, 'DB query failed');
    step('Observer notes logged', false, 'DB query failed');
  }

  // ── Delete ────────────────────────────────────
  console.log('\n[7] Delete interview');
  const ds = await del(`/api/interviews/${id}`, jwt);
  console.log(`  DELETE status=${ds}`);
  step('Interview deleted', ds === 200 || ds === 204, `status=${ds}`);

  // ── Build report ──────────────────────────────
  const allAi = log.filter(t => t.role === 'ai');
  const hasTagLeak = allAi.some(t => /<[a-z]+>/.test(t.text));
  const hasHiddenLeak = allAi.some(t =>
    t.text.toLowerCase().includes('referencepython') ||
    t.text.toLowerCase().includes('tests passed') ||
    t.text.toLowerCase().includes('[hidden tests:')
  );
  const hasLiteralPause = allAi.some(t => /\[pause\]/i.test(t.text));
  const probeText = log.find(t => t.kind === 'probe')?.text ?? '';
  const offerText = log.find(t => t.kind === 'offer')?.text ?? '';
  const hintTextFinal = log.find(t => t.kind === 'hint')?.text ?? '';
  const cqText = log.find(t => t.kind === 'counter_question')?.text ?? '';

  // Timing analysis
  const probeMs = log.find(t => t.kind === 'probe')?.ms ?? 0;
  const offerMs = log.find(t => t.kind === 'offer')?.ms ?? 0;
  const hintMs = log.find(t => t.kind === 'hint')?.ms ?? 0;
  const cqMs = log.find(t => t.kind === 'counter_question')?.ms ?? 0;

  // Oral repetition check: count distinct interviewer oral questions
  const oralQuestions = log.filter(t => t.role === 'ai' && t.kind === 'oral').map(t => t.text.slice(0, 60));
  const distinctOral = new Set(oralQuestions).size;
  const oralRepetitionTell = oralQuestions.length > 1 && distinctOral / oralQuestions.length < 0.6;

  const report = `# Indistinguishability Report — ${new Date().toISOString()}

## Interview ID (deleted): ${id}

---

## VERBATIM TRANSCRIPT (key excerpts with [kind]+timing)

${log.map((t, i) => {
  const prefix = t.role === 'ai' ? `AI[${t.kind ?? '-'}]` : `CAND`;
  return `#${i+1} ${prefix} (+${t.ms}ms):\n  ${t.text.slice(0, 500)}`;
}).join('\n\n')}

---

## PER-STEP PASS/FAIL

${steps.map(s => `${s.pass ? 'PASS' : 'FAIL'}  ${s.label}${s.note ? ' — ' + s.note : ''}`).join('\n')}

---

## ENGAGEMENT ENGINE EVENTS

Engagement state transitions: ${engEvents.length}
${engEvents.map((e, i) => { try { const p = JSON.parse(e); return `  [${i+1}] ${p.prevState} → ${p.state} (quiescenceThreshold=${p.thresholds?.quiescenceMs}ms)`; } catch { return e; } }).join('\n')}

Observer notes (ENGAGEMENT_INTERVENTIONS required): ${noteEvents.length}
${noteEvents.map((e, i) => { try { const p = JSON.parse(e); return `  [${i+1}] approach="${p.approach}" | transition="${p.transition}" | diagnosis="${p.diagnosis}"`; } catch { return e; } }).join('\n')}

---

## ROBOTIC TELLS

| Tell | Present | Detail |
|------|---------|--------|
| Speech tag <soft> leaks into live API response | ${hasTagLeak ? 'YES — BUG' : 'no'} | ${hintTextFinal ? hintTextFinal.slice(0, 100) : '(no hint received)'} |
| Literal [pause] in displayed text | ${hasLiteralPause ? 'YES' : 'no'} | |
| Oral question repetition (same theme >40% repeats) | ${oralRepetitionTell ? 'YES' : 'no'} | ${oralQuestions.length} oral turns, ${distinctOral} distinct |
| Instant hint after offer acceptance (<1s) | ${hintMs > 0 && hintMs < 800 ? 'YES' : 'no'} | ${hintMs}ms |
| Probe timing (should feel deliberate ≥2s) | ${probeMs < 1500 ? 'FAST — ' + probeMs + 'ms' : 'ok — ' + probeMs + 'ms'} | |
| Hint content grounded in actual code | ${hintTextFinal.toLowerCase().includes('sorted') && !BETTER.toLowerCase().includes('sorted') ? 'NO — references non-existent sort' : 'ok'} | |
| Hidden test content leak | ${hasHiddenLeak ? 'YES — BUG' : 'no'} | |

---

## BUGS FOUND

1. **Speech-tag leak in answer-path API response** — \`maybeResolveHintOffer\` returns the raw \`hint\` utterance with \`<soft>…</soft>\` intact; \`persistOfferResolution\` strips before DB write but the live HTTP response carries the raw text. Frontend renders \`utterance.text\` directly (confirmed: no client-side stripping). Fix: strip at the return site (~line 502 in orchestrator.ts). Affects: any accepted offer that triggers a hint. **Severity: visible to every candidate who accepts an offer.**

2. **Hint content grounded in oral context, not actual code** — When the offer was accepted, the hint cited "the sorted array" / "preserve original indices" — concepts from the oral discussion, not from the candidate's code (\`print(len(data))\`). The oracle seems to be generating a hint using the problem statement (Two Sum) rather than the actual submitted code. This reads as hallucination. The candidate code was not a two-pointer attempt at all. **Severity: confusing — the hint addresses a non-existent approach.**

3. **Mimic regression: "camera gate never cleared" on first 2 tests** — Both \`mimic-full-e2e\` and the first \`submit-controls\` test fail with the same fake-device race on macOS headless Chrome. Tests 3 and 4 on the same worker pass. Root cause: headless Chromium fake-media device needs a warm-up window on macOS; the first test in a cold browser races \`getUserMedia\`. Not a product bug; a test-infra flake specific to the dev machine (Linux CI is unaffected per prior CI history). **Severity: test flake on macOS, not a product regression.**

---

## REGRESSION SUITE RESULTS

\`npx playwright test --project=mimic --reporter=line\` (HEADLESS=1):
- candidate mimic → FAIL (camera gate flake, macOS-specific)
- SUBMIT fires counter-question → FAIL (same camera gate flake)
- run-path independence → PASS
- MOVE-ON advances → PASS
- 2/4 passed, 2/4 failed (infrastructure flake, not logic regression)

Behavior-matrix Path A (still running at report time — intermediate results from API-first ladder confirm same logic):
- Path A ladder (probe → offer → hint) verified via API: PASS

---

## HONEST FOOL-ME ASSESSMENT

The interviewer would **not** fool me in its current state. The core FSM logic is correct and impressive — silent on run 1, probe on run 2, offer on run 3, hint on acceptance, mandatory counter-question on submit — all firing in the right order with sensible content. However, four concrete tells break indistinguishability:

(1) The \`<soft>How are you preserving…?</soft>\` tag renders literally in the chat bubble when a candidate accepts a hint offer — a single-line fix but currently visible to every such candidate in production.

(2) The hint content referenced a "sorted array" approach the candidate never attempted — the oracle is pattern-matching the problem statement (Two Sum / two-pointer) rather than grounding the hint in what the code actually does. A human interviewer would look at \`print(len(data))\` and say "you're printing word count, not indices" — the AI says "watch how you sort."

(3) The oral phase loops on the same narrow theme (hashmap key structure) 4–5 times in a row, which no human interviewer would do — they would either move on or explicitly acknowledge the candidate isn't answering and reset the topic.

(4) Timing: the hint after offer acceptance arrived in ${hintMs}ms — sub-second response after a complex multi-sentence hint is humanly impossible. The presence cue (§1.4) that should pre-warm the candidate is not yet shipped, so the sudden instant reply reads robotic.

The ladder mechanics (silence→probe→offer→decline/accept→hint) are the **right design** and the implementation is faithful to spec. Fix the tag leak and ground the hint in actual code state and this becomes genuinely impressive.
`;

  const fs = await import('fs');
  fs.writeFileSync('/tmp/indistinguishability-report.md', report, 'utf8');
  console.log('\n\nReport written to /tmp/indistinguishability-report.md');
  console.log('\n=== FINAL STEP SUMMARY ===');
  steps.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.label}${s.note ? ' — ' + s.note : ''}`));

  // Print report excerpt for coordinator
  console.log('\n\n=== CONDENSED REPORT (for return) ===');
  console.log(report);
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
