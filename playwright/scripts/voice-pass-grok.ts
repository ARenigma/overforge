// Voice pass — Grok TTS (xAI voice=sirius @ 0.92 speed) evaluation
//
// Drives a complete dev interview through the speak-stream endpoint, capturing every
// interviewer turn as a WAV. Measures TTFB and total stream duration, runs prosody
// analysis on the 3 longest utterances via autocorrelation F0, scans every returned
// utterance text for speech-tag leaks, and emits a final verdict table.
//
// Run:
//   OF_TEST_PASSWORD='...' npx tsx playwright/scripts/voice-pass-grok.ts
//
// Output WAVs: /Users/amit.ranjan/Downloads/overforge-voice-samples/PROD-VOICE-NN-<kind>.wav
// Prosody target (VAPI-Elliot reference): F0med≈157Hz, F0std≈45-50, voiced≈0.38-0.48

import { getAccessToken } from '../helpers/auth';
import { config } from '../helpers/env';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';

const API = config.apiUrl;
const LANG = 'python';
const OUT_DIR = '/Users/amit.ranjan/Downloads/overforge-voice-samples';
// Speech-tag detector — matches the T1 regression guard in prior passes
const SPEECH_TAG_RE = /[\[<](pause|sigh|soft|slow|laugh|whisper)/i;
// Any bracket-shaped token — broader scan for novel tags
const ANY_TAG_RE = /[\[<][a-z]+[\]>]/gi;

// ── Output dir ────────────────────────────────────────────────────────────────

function ensureDir(d: string): void {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function httpPost(
  p: string,
  body: Record<string, unknown>,
  jwt?: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) h['Authorization'] = `Bearer ${jwt}`;
  const r = await fetch(`${API}${p}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  });
  const ct = r.headers.get('content-type') ?? '';
  const b = ct.includes('json')
    ? ((await r.json()) as Record<string, unknown>)
    : ({ _text: await r.text() } as Record<string, unknown>);
  return { ok: r.ok, status: r.status, body: b };
}

async function httpDel(p: string, jwt: string): Promise<number> {
  const r = await fetch(`${API}${p}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return r.status;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── speak-stream capture ──────────────────────────────────────────────────────

interface CaptureResult {
  ttfbMs: number;
  durationS: number;
  totalBytes: number;
  sampleRate: number;
}

/** POST /:id/speak-stream, stream pcm_s16le → WAV file. Returns timing metrics.
 *  Returns null if the server responds with 404 (nothing to speak) or 503 (voice off). */
async function captureStream(
  id: string,
  token: string,
  source: 'turn' | 'run',
  outPath: string,
): Promise<CaptureResult | null> {
  const t0 = Date.now();
  const res = await fetch(`${API}/api/interviews/${id}/speak-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, source }),
  });

  if (res.status === 404 || res.status === 503) {
    console.log(`    [SKIP] speak-stream ${res.status} — ${res.status === 404 ? 'nothing to speak' : 'voice not configured'}`);
    return null;
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`speak-stream ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const sampleRate = Number(res.headers.get('x-sample-rate') ?? '24000') || 24000;
  const chunks: Buffer[] = [];
  let ttfbMs = 0;
  let firstChunk = true;

  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      if (firstChunk) {
        ttfbMs = Date.now() - t0;
        firstChunk = false;
      }
      chunks.push(Buffer.from(value));
    }
  }

  if (chunks.length === 0) {
    console.log('    [WARN] speak-stream returned 200 but zero bytes');
    return { ttfbMs, durationS: 0, totalBytes: 0, sampleRate };
  }

  const pcmBuf = Buffer.concat(chunks);
  const totalBytes = pcmBuf.length;
  // pcm_s16le: 2 bytes per sample
  const durationS = totalBytes / (sampleRate * 2);

  // Write raw PCM then convert to WAV via ffmpeg (-y overwrites)
  const rawPath = outPath.replace(/\.wav$/, '.pcm');
  fs.writeFileSync(rawPath, pcmBuf);
  try {
    execSync(
      `ffmpeg -y -f s16le -ar ${sampleRate} -ac 1 -i "${rawPath}" "${outPath}" 2>/dev/null`,
    );
  } finally {
    try { fs.unlinkSync(rawPath); } catch { /* ignore */ }
  }

  return { ttfbMs, durationS, totalBytes, sampleRate };
}

// ── Tag scan ─────────────────────────────────────────────────────────────────

/** Return any bracket-shaped tokens that match speech-tag patterns. */
function scanTags(text: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(ANY_TAG_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    if (SPEECH_TAG_RE.test(m[0])) found.push(m[0]);
  }
  return found;
}

// ── Prosody via Python (autocorr F0, 16 kHz decode) ─────────────────────────

const PROSODY_PY = `
import sys, json
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

def analyze(wav_path, target_sr=16000):
    sr, data = wavfile.read(wav_path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    mx = float(np.abs(data).max())
    if mx > 0:
        data /= mx

    # Resample to 16 kHz
    if sr != target_sr:
        g = int(np.gcd(target_sr, sr))
        data = resample_poly(data, target_sr // g, sr // g)

    # Frame parameters (25 ms / 10 ms hop)
    frame_len = int(0.025 * target_sr)  # 400 samples @ 16kHz
    hop       = int(0.010 * target_sr)  # 160 samples @ 16kHz
    # F0 range 70-320 Hz → lag range [50, 228] samples
    min_lag = int(target_sr / 320)
    max_lag = int(target_sr / 70)
    energy_gate = 0.04

    f0s = []
    n_frames = max(0, (len(data) - frame_len) // hop)
    for i in range(n_frames):
        frame = data[i*hop : i*hop + frame_len]
        rms = float(np.sqrt(np.mean(frame**2)))
        if rms < energy_gate:
            continue
        fn = frame - frame.mean()
        # Full autocorrelation — keep causal lags only
        ac = np.correlate(fn, fn, mode='full')
        ac = ac[len(fn)-1:]
        if ac[0] <= 0:
            continue
        ac = ac / ac[0]
        seg = ac[min_lag : max_lag + 1]
        if len(seg) == 0:
            continue
        pk = int(np.argmax(seg)) + min_lag
        if ac[pk] > 0.3:          # voiced-confidence threshold
            f0s.append(target_sr / pk)

    voiced = len(f0s)
    total  = n_frames
    print(json.dumps({
        "f0_median":    round(float(np.median(f0s)) if f0s else 0.0, 1),
        "f0_std":       round(float(np.std(f0s))    if f0s else 0.0, 1),
        "voiced_ratio": round(voiced / total if total > 0 else 0.0, 3),
        "voiced_frames": voiced,
        "total_frames":  total,
    }))

analyze(sys.argv[1])
`;

const PROSODY_SCRIPT_PATH = '/tmp/of_prosody_check.py';

function writeProsodyScript(): void {
  fs.writeFileSync(PROSODY_SCRIPT_PATH, PROSODY_PY.trimStart(), 'utf8');
}

interface ProsodyResult {
  f0_median: number;
  f0_std: number;
  voiced_ratio: number;
  voiced_frames: number;
  total_frames: number;
}

function runProsody(wavPath: string): ProsodyResult | null {
  try {
    const out = execSync(`python3 "${PROSODY_SCRIPT_PATH}" "${wavPath}"`, { encoding: 'utf8' });
    return JSON.parse(out.trim()) as ProsodyResult;
  } catch (err) {
    console.error(`  [prosody] failed on ${path.basename(wavPath)}:`, (err as Error).message.slice(0, 120));
    return null;
  }
}

// ── Run-intervention poll ─────────────────────────────────────────────────────

interface Intervention {
  text: string;
  kind: string;
}

async function pollRunIntervention(
  id: string,
  token: string,
  maxWaitMs = 20_000,
): Promise<Intervention | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const r = await httpPost(`/api/interviews/${id}/run-intervention`, { token });
    const { intervention, pending } = r.body as {
      intervention: Intervention | null;
      pending: boolean;
    };
    if (!pending) return intervention;
    await sleep(600);
  }
  console.log('  [WARN] run-intervention poll timed out');
  return null;
}

// ── Utterance record ──────────────────────────────────────────────────────────

interface UtteranceRow {
  nn: number;
  kind: string;
  text: string;
  chars: number;
  ttfbMs: number;
  durationS: number;
  file: string;
  tags: string[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== VOICE PASS — GROK TTS (xAI sirius @ 0.92 speed) ===');
  console.log(`  Backend  : ${API}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Out dir  : ${OUT_DIR}\n`);

  ensureDir(OUT_DIR);
  writeProsodyScript();

  const rows: UtteranceRow[] = [];
  let wavN = 0;

  function wavPath(nn: number, kind: string): string {
    return path.join(OUT_DIR, `PROD-VOICE-${String(nn).padStart(2, '0')}-${kind}.wav`);
  }

  async function speak(
    id: string,
    tok: string,
    source: 'turn' | 'run',
    kind: string,
    text: string,
  ): Promise<void> {
    wavN++;
    const nn = wavN;
    const fpath = wavPath(nn, kind);
    console.log(`  [speak #${nn}] ${kind}  chars=${text.length}  source=${source}`);
    const cap = await captureStream(id, tok, source, fpath);
    if (!cap) {
      console.log(`    → skipped`);
      wavN--;
      return;
    }
    console.log(`    TTFB: ${cap.ttfbMs} ms  dur: ${cap.durationS.toFixed(2)} s  bytes: ${cap.totalBytes}`);
    rows.push({
      nn,
      kind,
      text,
      chars: text.length,
      ttfbMs: cap.ttfbMs,
      durationS: cap.durationS,
      file: fpath,
      tags: scanTags(text),
    });
  }

  // ── 1. Auth + create dev interview ────────────────────────────────────────
  console.log('[1] Auth + create dev interview');
  const jwt = await getAccessToken();
  const cr = await httpPost(
    '/api/interviews',
    {
      candidateEmail: 'voice-grok-pass@overforge.local',
      candidateName: 'Voice Eval — Grok sirius',
      language: LANG,
      level: 'mid',
      devMode: true,
    },
    jwt,
  );
  if (!cr.ok) throw new Error(`create: ${cr.status} ${JSON.stringify(cr.body)}`);
  const { id, token: invToken } = cr.body as { id: string; token: string };
  console.log(`  interview.id = ${id}\n`);

  // ── 2. Begin ──────────────────────────────────────────────────────────────
  console.log('[2] Begin');
  const br = await httpPost(`/api/interviews/${id}/begin`, {
    token: invToken,
    tncAccepted: true,
  });
  if (!br.ok) throw new Error(`begin: ${br.status} ${JSON.stringify(br.body)}`);
  const { sessionToken, utterance: greetU, phase: ph0 } = br.body as {
    sessionToken: string;
    utterance: { text: string };
    phase: string;
  };
  const tok = sessionToken;
  const greetText = greetU?.text ?? '';
  console.log(`  phase: ${ph0}  greeting (${greetText.length} chars):`);
  console.log(`  "${greetText.slice(0, 160)}"`);
  console.log(`  tags: ${scanTags(greetText).join(',') || 'none'}`);

  await speak(id, tok, 'turn', 'greeting', greetText);

  // ── 3. Oral phase — 2 answers (dodge + genuine) ───────────────────────────
  console.log('\n[3] Oral phase');

  const ORAL_ANSWERS = [
    // Answer 1 — dodge: deployment/infra instead of algorithm detail
    'We had our microservices running on EKS across three availability zones. The CI/CD ' +
      'pipeline was GitHub Actions → ECR → Helm rolling update. Main challenge was getting ' +
      'readiness probes tuned so new pods passed health checks before traffic shifted.',

    // Answer 2 — genuine technical answer
    'For the sliding window I keep two pointers, left and right. Expand right until the ' +
      'window constraint is violated, then advance left to shrink it. Each element enters ' +
      'and leaves the window at most once, so the whole pass is O(n) with O(k) space for ' +
      'the window state where k is the constraint parameter.',
  ];

  let phase = ph0;

  for (let i = 0; i < ORAL_ANSWERS.length; i++) {
    if (['coding', 'done'].includes(phase)) break;
    const ans = ORAL_ANSWERS[i]!;
    console.log(`\n  Oral answer #${i + 1} (${ans.length} chars, ${i === 0 ? 'DODGE' : 'genuine'})`);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: ans });
    if (!ar.ok) { console.log(`  WARN: answer ${ar.status}`); continue; }
    const { utterance: oralU, phase: np } = ar.body as {
      utterance: { text: string };
      phase: string;
    };
    phase = np;
    const oralText = oralU?.text ?? '';
    if (oralText) {
      console.log(`  AI (${oralText.length} chars) phase=${phase}: "${oralText.slice(0, 120)}"`);
      console.log(`  tags: ${scanTags(oralText).join(',') || 'none'}`);
      await speak(id, tok, 'turn', `oral-q${i + 1}`, oralText);
    }
    await sleep(200);
  }

  // Extra genuine turns until we hit coding (safety net for longer FSMs)
  let extra = 0;
  const GENUINE =
    'I would use a hash map for O(1) average lookup. Store each element as a key pointing ' +
    'to its index. On each insertion check if the complement already exists in the map. ' +
    'This gives O(n) time and O(n) space for a single scan.';
  while (!['coding', 'done'].includes(phase) && extra < 8) {
    console.log(`\n  Extra oral turn #${extra + 1} (bridging to coding)`);
    const ar = await httpPost(`/api/interviews/${id}/answer`, { token: tok, answer: GENUINE });
    if (!ar.ok) break;
    const { utterance: u, phase: np } = ar.body as { utterance: { text: string }; phase: string };
    phase = np;
    const t = u?.text ?? '';
    if (t) {
      console.log(`  AI (${t.length} chars) phase=${phase}: "${t.slice(0, 100)}"`);
      await speak(id, tok, 'turn', `oral-extra${extra + 1}`, t);
    }
    extra++;
    await sleep(200);
    if (phase === 'coding') break;
  }

  console.log(`\n  Phase after oral: ${phase}`);
  if (phase !== 'coding') {
    console.log('  [WARN] did not reach coding phase — skipping coding section');
  }

  // ── 4–8. Coding section ───────────────────────────────────────────────────
  let interviewId = id; // keep for ledger query
  if (phase === 'coding') {
    // Fetch problem title for context
    console.log('\n[4] Coding problem');
    const cp = await httpPost(`/api/interviews/${id}/coding-problem`, { token: tok });
    const { problem } = cp.body as { problem?: { title?: string } };
    console.log(`  Problem: "${problem?.title ?? '(unknown)'}"`);

    // Wrong run
    console.log('\n[5] Wrong code run');
    const WRONG_CODE = [
      '# deliberately wrong — always returns -1',
      'import sys',
      'def solve(nums): return -1',
      'data = sys.stdin.read().split()',
      'print(solve(data))',
    ].join('\n');

    const rr = await httpPost(`/api/interviews/${id}/run`, {
      token: tok,
      language: LANG,
      source: WRONG_CODE,
      requestId: `vp-run-${Date.now()}`,
    });
    console.log(`  /run status=${rr.status}  interventionPending=${(rr.body as Record<string, unknown>).interventionPending}`);

    // Poll run intervention regardless of interventionPending flag
    console.log('\n[6] Poll run-intervention');
    const iv = await pollRunIntervention(id, tok, 20_000);
    if (iv) {
      console.log(`  kind: ${iv.kind}  chars=${iv.text.length}`);
      console.log(`  "${iv.text.slice(0, 140)}"`);
      console.log(`  tags: ${scanTags(iv.text).join(',') || 'none'}`);
      await speak(id, tok, 'run', 'run-probe', iv.text);
    } else {
      console.log('  No run intervention generated (null)');
    }

    // Accept hint offer
    console.log('\n[7] Accept hint offer');
    const offerText = iv?.text ?? '';
    const hintAns = offerText.toLowerCase().includes('hint')
      ? 'Yes please, I would like a hint to get unblocked.'
      : 'Could you give me a hint? I am not sure how to proceed from here.';
    const ha = await httpPost(`/api/interviews/${id}/answer`, {
      token: tok,
      answer: hintAns,
    });
    const { utterance: hintU, phase: hintPh } = ha.body as {
      utterance: { text: string };
      phase: string;
    };
    phase = hintPh;
    const hintText = hintU?.text ?? '';
    if (hintText) {
      console.log(`  Hint (${hintText.length} chars) phase=${phase}: "${hintText.slice(0, 120)}"`);
      console.log(`  tags: ${scanTags(hintText).join(',') || 'none'}`);
      await speak(id, tok, 'turn', 'hint', hintText);
    }

    // Submit code → counter-question
    console.log('\n[8] Submit code');
    const SUBMIT_CODE = [
      '# hash-map solution',
      'import sys',
      'def solve(nums):',
      '    seen = {}',
      '    for i, n in enumerate(nums):',
      '        if n in seen: return [seen[n], i]',
      '        seen[n] = i',
      '    return []',
      'print(solve(list(map(int, sys.stdin.read().split()))))',
    ].join('\n');

    const sa = await httpPost(`/api/interviews/${id}/answer`, {
      token: tok,
      answer: 'Submitting my hash-map solution.',
      intent: 'submit',
      submittedCode: SUBMIT_CODE,
    });
    const { utterance: cqU, phase: cqPh } = sa.body as {
      utterance: { text: string };
      phase: string;
    };
    phase = cqPh;
    const cqText = cqU?.text ?? '';
    if (cqText) {
      console.log(`  CQ (${cqText.length} chars) phase=${phase}: "${cqText.slice(0, 120)}"`);
      console.log(`  tags: ${scanTags(cqText).join(',') || 'none'}`);
      await speak(id, tok, 'turn', 'counter-question', cqText);
    }
  }

  // ── 9. /state tag scan ────────────────────────────────────────────────────
  console.log('\n[9] /state tag scan');
  const sr = await httpPost(`/api/interviews/${id}/state`, { token: tok });
  const { transcript: stateTx } = sr.body as {
    transcript?: Array<{ role: string; text: string }>;
  };
  let stateTagLeaks = 0;
  if (Array.isArray(stateTx)) {
    for (const turn of stateTx) {
      const tags = scanTags(turn.text ?? '');
      if (tags.length > 0) {
        stateTagLeaks++;
        console.log(`  [STATE TAG LEAK] role=${turn.role} tags=${tags.join(',')} text="${(turn.text ?? '').slice(0, 80)}"`);
      }
    }
    if (stateTagLeaks === 0) {
      console.log(`  /state: clean — ${stateTx.length} transcript turns, zero tag leaks`);
    }
  }

  // ── 10. Delete ────────────────────────────────────────────────────────────
  console.log('\n[10] Delete test interview');
  const ds = await httpDel(`/api/interviews/${id}`, jwt);
  console.log(`  DELETE status=${ds}`);

  // ── 11. Prosody analysis — top 3 longest utterances ──────────────────────
  console.log('\n[11] Prosody analysis — 3 longest utterances');
  const top3 = [...rows].sort((a, b) => b.chars - a.chars).slice(0, 3);

  interface ProsodyRow {
    nn: number; kind: string; chars: number;
    f0_median: number; f0_std: number; voiced_ratio: number;
    voiced_frames: number; total_frames: number;
  }
  const prosodyRows: ProsodyRow[] = [];

  for (const row of top3) {
    console.log(`\n  WAV #${row.nn} (${row.kind})  ${row.chars} chars  ${row.file}`);
    if (!fs.existsSync(row.file)) { console.log('    file missing — skip'); continue; }
    const p = runProsody(row.file);
    if (!p) continue;
    console.log(`    F0 median : ${p.f0_median} Hz   (target ≈ 157 Hz)`);
    console.log(`    F0 std    : ${p.f0_std} Hz   (target ≈ 45-50 Hz)`);
    console.log(`    Voiced    : ${p.voiced_ratio}   (target 0.38-0.48)`);
    console.log(`    Frames    : ${p.voiced_frames} voiced / ${p.total_frames} total`);
    prosodyRows.push({ nn: row.nn, kind: row.kind, chars: row.chars, ...p });
  }

  // ── 12. Chars/sec ratio outlier check (spoken-tag proxy) ─────────────────
  console.log('\n[12] Duration vs text-length ratio (spoken-tag proxy)');
  // At 150 wpm × 0.92 speed ≈ 138 wpm ≈ 11.5 chars/s (avg 5-char word).
  // Flag below 7 chars/s (suspiciously long audio for text length).
  // Flag above 70 chars/s (implausibly fast or near-silent).
  const FLOOR = 7;
  const CEIL  = 70;
  let ratioFlags = 0;
  for (const row of rows) {
    if (row.durationS < 0.3) continue;
    const cps = row.chars / row.durationS;
    if (cps < FLOOR || cps > CEIL) {
      ratioFlags++;
      const verdict = cps < FLOOR ? 'SLOW (possible spoken-tag audio?)' : 'FAST (near-silent?)';
      console.log(`  WAV #${row.nn} (${row.kind}): ${cps.toFixed(1)} chars/s — ${verdict}`);
      console.log(`    chars=${row.chars}  dur=${row.durationS.toFixed(2)}s`);
    }
  }
  if (ratioFlags === 0) {
    console.log('  All utterances within expected range — no spoken-tag audio anomalies.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESULTS
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('  PER-UTTERANCE TABLE');
  console.log('══════════════════════════════════════════════════════════════');
  const H = `${'#'.padEnd(3)} ${'kind'.padEnd(22)} ${'chars'.padEnd(6)} ${'TTFB ms'.padEnd(9)} ${'dur s'.padEnd(7)} ${'tags'.padEnd(8)} file`;
  console.log(H);
  console.log('─'.repeat(H.length));
  for (const row of rows) {
    const tagStr = row.tags.length > 0 ? row.tags.join(',') : 'clean';
    console.log(
      `${String(row.nn).padEnd(3)} ${row.kind.padEnd(22)} ${String(row.chars).padEnd(6)} ` +
      `${String(row.ttfbMs).padEnd(9)} ${row.durationS.toFixed(2).padEnd(7)} ` +
      `${tagStr.padEnd(8)} ${path.basename(row.file)}`,
    );
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  PROSODY vs TARGET (VAPI-Elliot: F0med≈157 Hz, F0std≈45-50, voiced≈0.38-0.48)');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(
    `${'#'.padEnd(3)} ${'kind'.padEnd(22)} ${'chars'.padEnd(6)} ${'F0med Hz'.padEnd(10)} ${'F0std Hz'.padEnd(10)} ${'voiced'.padEnd(8)} verdict`,
  );
  console.log('─'.repeat(75));
  for (const pr of prosodyRows) {
    const f0ok  = pr.f0_median > 100 && pr.f0_median < 220;
    const stdok = pr.f0_std > 20 && pr.f0_std < 80;
    const vrOk  = pr.voiced_ratio > 0.20 && pr.voiced_ratio < 0.65;
    const v = (f0ok ? 1 : 0) + (stdok ? 1 : 0) + (vrOk ? 1 : 0);
    const verdict = v === 3 ? 'PASS' : v === 2 ? 'PARTIAL' : 'CHECK';
    console.log(
      `${String(pr.nn).padEnd(3)} ${pr.kind.padEnd(22)} ${String(pr.chars).padEnd(6)} ` +
      `${String(pr.f0_median).padEnd(10)} ${String(pr.f0_std).padEnd(10)} ` +
      `${String(pr.voiced_ratio).padEnd(8)} ${verdict}`,
    );
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  TAG SCAN RESULT');
  console.log('══════════════════════════════════════════════════════════════');
  const apiTagLeaks = rows.filter((r) => r.tags.length > 0);
  if (apiTagLeaks.length === 0 && stateTagLeaks === 0) {
    console.log('  PASS — zero tag-shaped text in any API response or /state transcript');
  } else {
    console.log(`  FAIL — ${apiTagLeaks.length} API response leaks + ${stateTagLeaks} /state leaks`);
    for (const r of apiTagLeaks) {
      console.log(`    WAV #${r.nn} (${r.kind}): ${r.tags.join(',')}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  LATENCY VERDICT');
  console.log('══════════════════════════════════════════════════════════════');
  const ttfbs = rows.map((r) => r.ttfbMs);
  if (ttfbs.length === 0) {
    console.log('  No streams captured.');
  } else {
    const coldTtfb = ttfbs[0]!;
    const warmTtfbs = ttfbs.slice(1);
    const warmAvg = warmTtfbs.length > 0
      ? Math.round(warmTtfbs.reduce((a, b) => a + b, 0) / warmTtfbs.length)
      : 0;
    const maxTtfb = Math.max(...ttfbs);
    console.log(`  Cold TTFB (greeting)        : ${coldTtfb} ms`);
    console.log(`  Warm TTFB avg (subsequent)  : ${warmAvg} ms`);
    console.log(`  Max TTFB across all turns   : ${maxTtfb} ms`);
    console.log(`  Budget                      : ≤1500 ms recommended | >2500 ms = tell`);
    const ttfbPass = maxTtfb <= 2500;
    console.log(`  TTFB verdict                : ${ttfbPass ? 'PASS' : 'FAIL — exceeds 2500 ms tell threshold'}`);
    const allComplete = rows.every((r) => r.durationS > 0.3);
    console.log(`  Stream completion           : ${allComplete ? 'PASS — all streams >0.3 s' : 'WARN — some streams suspiciously short'}`);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  COST LEDGER (run manually after script — interview already deleted)');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  interview_id = ${interviewId}`);
  // Print the SSH command without embedding the DB URL (it stays on the server)
  console.log([
    '  ssh beef-server \'',
    '    DB=$(grep "^SUPABASE_DB_URL=" ~/overforge/deploy/backend.env | cut -d= -f2- | tr -d \'"\');',
    `    psql "$DB" -qA -c "select provider, count(*), round(sum(cost_usd)::numeric,4) from cost_events where interview_id=\'${interviewId}\' and kind=\'tts\' group by provider"`,
    '  \'',
  ].join('\n'));

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  VOICE PASS VERDICT');
  console.log('══════════════════════════════════════════════════════════════');
  const tagPass = apiTagLeaks.length === 0 && stateTagLeaks === 0;
  const ttfbOk  = rows.length === 0 || Math.max(...rows.map((r) => r.ttfbMs)) <= 2500;
  const compOk  = rows.every((r) => r.durationS > 0.3);
  console.log(`  Tag integrity    : ${tagPass ? 'PASS' : 'FAIL'}`);
  console.log(`  TTFB latency     : ${ttfbOk ? 'PASS' : 'FAIL'}`);
  console.log(`  Stream complete  : ${compOk ? 'PASS' : 'WARN'}`);
  console.log(`  Prosody numbers  : reported above — compare to VAPI-Elliot target`);
  console.log(`  Naturalness      : DEFERRED — reserved for owner's ear on saved WAVs at:`);
  console.log(`                     ${OUT_DIR}`);
  const techPass = tagPass && ttfbOk && compOk;
  console.log(`\n  Technical verdict : ${techPass ? 'PASS — pipeline integrity + latency OK' : 'FAIL — see above'}`);
  console.log(`  Naturalness call  : requires owner's ear — WAVs saved above`);
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
