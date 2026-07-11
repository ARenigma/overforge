import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'fs';
import { resolve } from 'path';

// ── Fake-media wiring ─────────────────────────────────────────────────────────
// A real headed Chromium drives the camera+mic-gated room. --use-fake-ui auto-grants getUserMedia
// (the actual gate-pass); --use-fake-device feeds a fake stream. Optional files replace that fake
// stream with a headshot (so MediaPipe registers a face) and an audio clip. --autoplay-policy lets
// the interviewer's Cartesia TTS play without a user gesture. --no-sandbox is a macOS-only
// workaround (the sandbox silently drops the fake-audio file read); Linux CI omits it.
const FIX = resolve(__dirname, 'fixtures');
const isMac = process.platform === 'darwin';

function chromiumArgs(audioFile?: string): string[] {
  const args = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ];
  const face = resolve(FIX, 'face.y4m');
  if (existsSync(face)) args.push(`--use-file-for-fake-video-capture=${face}`);
  if (audioFile) {
    const audio = resolve(FIX, audioFile);
    if (existsSync(audio)) args.push(`--use-file-for-fake-audio-capture=${audio}%noloop`);
  }
  if (isMac) args.push('--no-sandbox');
  return args;
}

const baseUse = {
  ...devices['Desktop Chrome'],
  headless: process.env.HEADLESS === '1',
  permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
  trace: 'retain-on-failure' as const,
  video: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
};

export default defineConfig({
  testDir: './tests',
  // Interviews are stateful + share one dev account + the Groq free-tier TPM budget — serialize.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  projects: [
    {
      name: 'mimic',
      testMatch: /mimic-full-e2e\.spec\.ts/,
      // Silent mic: the mimic types its answers; a silent stream keeps the voice STT path quiet so
      // it can't race the text composer. Falls back to the default fake device if silence.wav is
      // absent (a low-level tone, still harmless for a text-driven run).
      use: { ...baseUse, launchOptions: { args: chromiumArgs('silence.wav') } },
    },
    {
      name: 'matrix',
      testMatch: /(behavior-matrix|capture-marketing|mobile-sweep)\.spec\.ts/,
      // Text-driven like the mimic: silent mic so STT can't race the composer while the matrix
      // drives the probing/hinting ladder + idle behaviors.
      use: { ...baseUse, launchOptions: { args: chromiumArgs('silence.wav') } },
    },
    {
      name: 'stt',
      testMatch: /stt-smoke\.spec\.ts/,
      // Speech mic: a spoken clip (with a leading silence to clear the AEC warm-up) drives the
      // real STT path so the FSM advances from voice alone.
      use: { ...baseUse, launchOptions: { args: chromiumArgs('answer.wav') } },
    },
    {
      name: 'voice-mimic',
      testMatch: /voice-interview-mimic\.spec\.ts/,
      // Per-turn audio injection via addInitScript overrides navigator.mediaDevices.getUserMedia
      // for both the camera (canvas.captureStream) and mic (AudioContext destination node).
      // No --use-file-for-fake-audio-capture: our __speakClip API controls each turn's audio.
      // --use-fake-device + --use-fake-ui are still required so permission prompts auto-dismiss
      // and a valid fake device is registered as a fallback before our override intercepts calls.
      use: { ...baseUse, launchOptions: { args: chromiumArgs() } },
    },
  ],
});
