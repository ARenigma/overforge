// Multi-turn spoken-interview harness: a real headed Chromium drives the full interview using
// injected audio clips per turn — bypassing the single-file --use-file-for-fake-audio-capture
// limitation — so the STT pipeline processes each turn independently and produces
// voice_turn_telemetry rows in the database.
//
// ARCHITECTURE
//   addInitScript overrides navigator.mediaDevices.getUserMedia BEFORE any page JS runs:
//     • video calls  → a static canvas.captureStream() track (satisfies camera/proctor gate)
//     • audio calls  → AudioContext → MediaStreamDestinationNode (controlled audio source)
//   window.__speakClip(base64Wav) decodes + plays each clip through that destination node.
//   The app's AudioContext reads from the destination's MediaStreamTrack, so the worklet
//   produces PCM frames exactly as if a real microphone were speaking.
//
// TIMING NOTES
//   • AEC warm-up: 3 s from begin() — the room gates mic frames via micCooldownUntilRef.
//   • TTS tail cooldown: 800 ms after each interviewer turn.
//   • 200 ms min-speech gate: each WAV has 500 ms leading silence to clear both.
//   • Between clips we wait for the "Listening" voice-status pill, which only appears after
//     TTS + cooldown completes and micForwarding flips to true — the authoritative seam.
//
// GATE
//   Skipped unless RUN_VOICE_MIMIC=1. Skipped if fixtures/voice/ is empty.
//   Skipped if the prod deployment has no NEXT_PUBLIC_VOICE_WS_URL (typed-only mode).
//   Set VOICE_MIMIC_KEEP=1 to retain the interview row after the run.

import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';
import type { Page } from '@playwright/test';

// ── Type augmentation ──────────────────────────────────────────────────────────

declare global {
  interface Window {
    /**
     * Decode a base64-encoded WAV and play it through the injected AudioContext destination.
     * Resolves when playback ends. Installed by addInitScript before any page JS executes.
     */
    __speakClip: (base64Wav: string) => Promise<void>;
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FIXTURES_DIR = resolve(__dirname, '../fixtures/voice');

/** Sorted list of WAV files in fixtures/voice/ — present only after `npm run fixtures:voice`. */
function voiceClips(): string[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.wav'))
    .sort()
    .map((f) => resolve(FIXTURES_DIR, f));
}

const CLIPS = voiceClips();

/** Generic Python attempt that reads stdin cleanly (non-zero exit = sandbox OK) but is wrong
 *  for the real hidden tests — drives the probe/hint ladder, same as the mimic spec. */
const GENERIC_ATTEMPT = ['import sys', 'data = sys.stdin.read().split()', 'print(len(data))'].join(
  '\n'
);

// ── Browser init script ────────────────────────────────────────────────────────
// Installed via page.addInitScript — runs in the browser before React mounts.
// Must be pure JS (no TS annotations; TypeScript strips them here at build time, but
// Playwright serialises the function body verbatim for the browser).

function browserInitScript(): void {
  // One AudioContext + destination for the whole session. All clips play through it.
  // --autoplay-policy=no-user-gesture-required (set in the project's chromium args) means
  // AudioContext starts running without a gesture; we call resume() defensively anyway.
  const _ctx = new AudioContext();
  const _dest = _ctx.createMediaStreamDestination();

  // Static canvas for the camera/proctor gate: provides a valid MediaStreamVideoTrack.
  // MediaPipe will note faceAbsent, but cameraState still transitions to 'granted' so the
  // room proceeds — the proctor gate is device-level, not face-level.
  const _canvas = document.createElement('canvas');
  _canvas.width = 640;
  _canvas.height = 480;
  const _canvasCtx = _canvas.getContext('2d');
  if (_canvasCtx) {
    _canvasCtx.fillStyle = '#1a1a1a';
    _canvasCtx.fillRect(0, 0, 640, 480);
    // Draw a simple circle so the canvas is non-trivially non-blank.
    _canvasCtx.beginPath();
    _canvasCtx.arc(320, 240, 60, 0, Math.PI * 2);
    _canvasCtx.strokeStyle = '#444';
    _canvasCtx.lineWidth = 2;
    _canvasCtx.stroke();
  }
  const _videoStream = _canvas.captureStream(15);
  const _videoTrack = _videoStream.getVideoTracks()[0];

  // Override getUserMedia: the app makes two separate calls —
  //   useCameraProctor → { video: true }        returns canvas video track
  //   useVoiceMic      → { audio: constraints } returns our destination audio track
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    // Resume the AudioContext in case Chrome suspended it (it shouldn't given the
    // --autoplay-policy flag, but this is a cheap guard).
    void _ctx.resume().catch(() => undefined);
    const stream = new MediaStream();
    if (constraints && constraints.audio) {
      const track = _dest.stream.getAudioTracks()[0];
      if (track) stream.addTrack(track);
    }
    if (constraints && constraints.video) {
      if (_videoTrack) stream.addTrack(_videoTrack);
    }
    return stream;
  };

  // __speakClip: feed one WAV clip into the destination so the app's worklet picks it up
  // as PCM frames and forwards them over the voice WebSocket.
  window.__speakClip = (base64Wav) => {
    return _ctx
      .resume()
      .then(() => {
        // atob → Uint8Array → ArrayBuffer. .slice(0) copies the buffer because
        // decodeAudioData() transfers (detaches) the ArrayBuffer it receives.
        const binary = atob(base64Wav);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return _ctx.decodeAudioData(bytes.buffer.slice(0));
      })
      .then(
        (audioBuffer) =>
          new Promise<void>((resolve) => {
            const source = _ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(_dest); // → destination.stream → app's MediaStreamSource → worklet
            source.onended = () => resolve();
            source.start(0);
          })
      );
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Wait for the voice-status pill to show "Listening" (micForwarding=true in the room).
 *  This is the authoritative seam: the pill only appears in voice mode and only shows
 *  "Listening" once TTS + AEC cooldown have cleared and the WS server has re-armed the mic. */
async function waitForListening(page: Page, timeout: number): Promise<boolean> {
  return page
    .getByText('Listening', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

/** Play one clip and wait for the STT to commit it (a new candidate-message bubble appears).
 *  Returns true if a transcript bubble appeared within the timeout. */
async function speakAndWaitCommit(
  page: Page,
  clipPath: string,
  opts: { transcriptTimeout: number }
): Promise<boolean> {
  const prevCount = await page.getByTestId('candidate-message').count();
  const base64 = readFileSync(clipPath).toString('base64');

  // evaluate() awaits the Promise returned by __speakClip, so this line resolves when
  // the entire clip has played through. The STT engine commits asynchronously after.
  await page.evaluate((b64: string) => window.__speakClip(b64), base64);

  // Wait for the candidate transcript bubble that the voice WS produces when it commits
  // the STT turn (handleVoiceTurnReady → setMessages([..., { role: 'candidate', text }])).
  return page
    .waitForFunction(
      (n: number) => document.querySelectorAll('[data-testid="candidate-message"]').length > n,
      prevCount,
      { timeout: opts.transcriptTimeout }
    )
    .then(() => true)
    .catch(() => false);
}

// ── Gate ───────────────────────────────────────────────────────────────────────

// Primary gate: must opt-in with RUN_VOICE_MIMIC=1.
test.skip(
  !process.env.RUN_VOICE_MIMIC,
  'set RUN_VOICE_MIMIC=1 to run the multi-turn voice harness'
);

// Secondary gate: requires generated WAV fixtures.
test.skip(
  CLIPS.length === 0,
  'fixtures/voice/ is empty — run `npm run fixtures:voice` (needs CARTESIA_API_KEY)'
);

// ── Teardown ───────────────────────────────────────────────────────────────────

let createdId: string | null = null;
test.afterEach(async () => {
  // Keep the row when VOICE_MIMIC_KEEP=1 so the operator can inspect voice_turn_telemetry.
  if (createdId && !process.env.VOICE_MIMIC_KEEP) {
    await deleteInterview(createdId);
  }
  createdId = null;
});

// ── Spec ───────────────────────────────────────────────────────────────────────

test('multi-turn voice interview: spoken oral turns drive STT → voice_turn_telemetry', async ({
  page,
}) => {
  // 15-minute budget: interviewer TTS turns take 10–30 s each; up to 8 oral clips, then the
  // full coding round (runs + submit + counter-question + move-on) and wrap-up Q&A to done.
  test.setTimeout(900_000);

  // ── 1. Install getUserMedia override + __speakClip BEFORE any navigation ──────
  // addInitScript fires before every page.goto() — must be called before room.enter().
  await page.addInitScript(browserInitScript);

  // ── 2. Create the interview ────────────────────────────────────────────────────
  // devMode:false — a REAL-duration interview. Spoken answers run 12-58s each plus interviewer
  // replies; the 2-minute dev window concludes the interview mid-oral (proven on the first run).
  const interview = await createInterview({ language: 'python', level: 'mid', devMode: false });
  createdId = interview.id;
  test.info().annotations.push({ type: 'interview', description: interview.id });
  console.log(`[voice-mimic] interview id: ${interview.id}`);

  // ── 3. Enter room, clear consent gate ─────────────────────────────────────────
  const room = new CandidateRoom(page);
  await room.enter(interview.link);
  // Greeting spinner (aiThinking is NOT set for the initial greeting, but TTS plays).
  await room.waitForSettled(60_000);

  // ── 4. Verify voice mode is active in this deployment ─────────────────────────
  // The voice-status pill (micForwarding state label) only renders when voiceMode=true,
  // which requires NEXT_PUBLIC_VOICE_WS_URL to be set in the frontend build.
  // If the pill never shows, this deployment is typed-only and cannot produce telemetry.
  const voiceModeActive = await page
    .locator('text=/^(Listening|Connecting|Speaking|Voice off)$/')
    .first()
    .waitFor({ state: 'visible', timeout: 12_000 })
    .then(() => true)
    .catch(() => false);

  if (!voiceModeActive) {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(
      true,
      'Voice mode is not active in this deployment (NEXT_PUBLIC_VOICE_WS_URL not set) — ' +
        'cannot produce voice_turn_telemetry rows. Run against a voice-enabled frontend.'
    );
    return;
  }

  console.log(`[voice-mimic] voice mode active — waiting for first Listening state`);

  // ── 5. Wait for first "Listening" ─────────────────────────────────────────────
  // The "Listening" pill appears once:
  //   • The voice WS connects and the server sends its first ready cue (expects:'voice')
  //   • The 3 s AEC warm-up has elapsed (micCooldownUntilRef expired)
  //   • The greeting TTS + 800 ms tail cooldown are done
  // By that point the room is genuinely ready for the first candidate utterance.
  const firstListening = await waitForListening(page, 45_000);
  if (!firstListening) {
    throw new Error(
      '[voice-mimic] Timed out waiting for "Listening" pill — voice WS may not be connected or AEC warm-up stalled'
    );
  }
  console.log(`[voice-mimic] room is listening — starting oral turns`);

  // ── 6. Oral turns: inject clips, wait for STT commit + interviewer reply ───────
  // First pass: deep-dive, specifics, conceptual, clarifying (clips 1-4). The interviewer
  // probes and answers clarifying questions rather than advancing on them (that's the product
  // working — a 4-clip hard stop failed here on 2026-08-03), so past 4 turns we keep answering
  // by cycling substantive clips (specifics, conceptual, wrap-up) until the FSM leaves oral,
  // exactly like the text mimic's advanceThroughOral rotation. Clip 5 (approach) stays reserved
  // for the coding-phase voice probe.
  const MAX_ORAL_TURNS = 8;
  const cyclePool = [CLIPS[1], CLIPS[2], CLIPS[5]].filter(Boolean);
  const clipFor = (i: number): string =>
    i < 4 ? CLIPS[i] : cyclePool[(i - 4) % cyclePool.length];
  const oralPhases = new Set(['greeting', 'oral', 'handoff', '']);
  let candidateTurns = 0;

  for (let i = 0; i < MAX_ORAL_TURNS; i++) {
    // Stop when the FSM has left oral phases.
    const currentPhase = await room.phase();
    if (!oralPhases.has(currentPhase)) {
      console.log(`[voice-mimic] oral loop exit: phase=${currentPhase} after ${i} clips`);
      break;
    }
    if (await room.isDone()) break;

    // For turns after the first, re-wait for "Listening" (TTS + cooldown of previous turn).
    if (i > 0) {
      console.log(`[voice-mimic] waiting for Listening before turn ${i + 1}…`);
      const isListening = await waitForListening(page, 90_000);
      if (!isListening) {
        console.warn(
          `[voice-mimic] turn ${i + 1}: "Listening" did not re-appear — breaking oral loop`
        );
        break;
      }
    }

    console.log(`[voice-mimic] turn ${i + 1}: playing ${clipFor(i).split('/').pop()}`);

    // Play the clip and wait for the STT commit (candidate-message bubble appears).
    // 90 s covers: clip playback (up to ~55 s for the deep-dive) + STT processing (2–8 s).
    const committed = await speakAndWaitCommit(page, clipFor(i), { transcriptTimeout: 90_000 });
    if (committed) {
      candidateTurns++;
      console.log(`[voice-mimic] turn ${i + 1}: transcript committed ✓ (total=${candidateTurns})`);
    } else {
      console.warn(`[voice-mimic] turn ${i + 1}: no transcript bubble within timeout`);
    }

    // Wait for the interviewer's reply and let its TTS settle before the next clip.
    const prevAiCount = await room.aiCount();
    await page
      .waitForFunction(
        (n: number) => document.querySelectorAll('[data-testid="ai-message"]').length > n,
        prevAiCount,
        { timeout: 90_000 }
      )
      .catch(() => undefined);
    await room.waitForSettled(60_000);
  }

  // Require at least 3 committed candidate transcript bubbles — the minimum to confirm
  // the voice STT pipeline ran end-to-end and produced telemetry rows.
  expect(
    candidateTurns,
    'need ≥3 committed spoken turns to confirm voice_turn_telemetry'
  ).toBeGreaterThanOrEqual(3);

  // ── 7. Wait for coding phase ───────────────────────────────────────────────────
  await room.waitForCoding(60_000);
  expect(await room.isCoding(), 'should reach coding phase after oral turns').toBeTruthy();

  // The blocking stage modal now HOLDS the spoken problem intro until acknowledged
  // (dual-attention fix) — acknowledge it first, like a real candidate, so the ask_code
  // TTS plays and the mic re-arms.
  await room.acknowledgeStageModalIfOpen();

  const title = await room.problemTitle();
  console.log(`[voice-mimic] coding problem: "${title}"`);
  expect(title.length, 'problem title must be non-empty').toBeGreaterThan(0);

  // ── 8. Coding phase: the approach question is answered BY VOICE ────────────────
  // Regression for interview e3c07b8f (2026-08-09): the room went permanently deaf the
  // moment the coding intro finished (stopMic on expects!=='voice'), so no spoken word
  // in the entire coding phase ever committed. With the always-listening fix the mic
  // must be live here: "Listening" must reappear after the intro TTS and a spoken
  // answer must commit. HARD assertions — this failing again means the deafness is back.
  const codingListening = await waitForListening(page, 45_000);
  expect(
    codingListening,
    'mic must be live in the coding phase (deafness regression, e3c07b8f)'
  ).toBeTruthy();
  const approachCommitted = await speakAndWaitCommit(page, CLIPS[4], {
    transcriptTimeout: 60_000,
  });
  expect(
    approachCommitted,
    'a spoken answer during coding must produce a transcript commit (deafness regression)'
  ).toBeTruthy();
  await room.waitForSettled(30_000);

  // ── 9. Code + run (typed — reuses the mimic's proven driver) ──────────────────
  await room.typeCode(GENERIC_ATTEMPT);
  const r1 = await room.run();
  console.log(`[voice-mimic] run 1: status=${r1.status}`);
  expect(r1.status.length, 'run must report a status').toBeGreaterThan(0);

  await room.typeCode(GENERIC_ATTEMPT + '\n# retry');
  const r2 = await room.run();
  console.log(`[voice-mimic] run 2: status=${r2.status}  hintFired=${await room.hintFired()}`);

  // ── 10. Invariant: no hidden-test data leaked to the candidate view ────────────
  await room.assertNoHiddenTestLeak();

  // ── 11. Drive the flow to its natural end ──────────────────────────────────────
  // devMode:false has no short time cap, so the interview only concludes by completing:
  // SUBMIT (mandatory counter-question) → typed reply advances → MOVE ON through any
  // remaining problems (forward-only) → wrap-up Q&A → done. The room helper acknowledges
  // the blocking stage modals (coding / wrap-up) on the way, as a real candidate would.
  await room.submitSolution();
  const counterQ = await room.lastAiText();
  console.log(`[voice-mimic] submit counter-question: "${counterQ.slice(0, 100)}"`);
  expect(counterQ.length, 'SUBMIT must fire a counter-question').toBeGreaterThan(0);

  // Regression for e3c07b8f: the candidate answered the mandatory counter-question ALOUD
  // and nothing committed (47s dead air → typed "hey can you hear me?"). The spoken CQ
  // answer must now commit. HARD assertion. Falls back to a typed reply afterwards only
  // if the FSM still wants one (keeps the flow moving either way).
  const cqListening = await waitForListening(page, 45_000);
  expect(
    cqListening,
    'mic must be listening after the counter-question (deafness regression, e3c07b8f)'
  ).toBeTruthy();
  const cqCommitted = await speakAndWaitCommit(page, CLIPS[3], { transcriptTimeout: 60_000 });
  expect(
    cqCommitted,
    'the spoken counter-question answer must commit (deafness regression, e3c07b8f)'
  ).toBeTruthy();
  await room.waitForSettled(60_000);
  // If the spoken reply did not advance past the problem (coding_ack path), advance with a
  // typed answer as before.
  if ((await room.phase()) === 'coding' && !(await room.isDone())) {
    await room.answer(
      'I counted tokens from stdin as a first pass; with more time I would group anagrams by ' +
        'their sorted character key in a hash map to make it correct for the actual problem.'
    );
  }

  // Forward-only through any remaining coding problems.
  for (let p = 0; p < 4 && !(await room.isDone()); p++) {
    if ((await room.phase()) !== 'coding') break;
    await room.moveOn();
  }

  // Wrap-up: answer closing questions until the FSM concludes (bounded).
  for (let w = 0; w < 5 && !(await room.isDone()); w++) {
    if ((await room.phase()) !== 'wrap_up') break;
    await room.answer(
      'Thanks — the rate-limiter walkthrough was a fair test, and the anagram problem was a nice ' +
        'complexity check. No further questions from my side.'
    );
  }

  await room.waitForDone(140_000);
  console.log(`[voice-mimic] done. concludedByTime=${await room.concludedByTime()}`);
  expect(await room.isDone(), 'interview must reach done state').toBeTruthy();

  // Remind the operator how to inspect telemetry.
  if (process.env.VOICE_MIMIC_KEEP) {
    console.log(
      `[voice-mimic] interview ${interview.id} kept. ` +
        `Query: SELECT * FROM voice_turn_telemetry WHERE interview_id = '${interview.id}';`
    );
  }
});
