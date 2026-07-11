// Generates per-turn spoken-answer WAVs for the voice-interview-mimic spec via Cartesia TTS.
// Run via:  npm run fixtures:voice
// Requires: CARTESIA_API_KEY in env. CANDIDATE_VOICE_ID may be overridden via env.
//
// Produces fixtures/voice/turn-01-*.wav … turn-06-*.wav:
//   16 kHz mono PCM-16 WAV, each with ~0.5 s leading silence so the room's AEC warm-up
//   tail and the 200 ms min-speech gate clear before real speech starts.
//
// If CARTESIA_API_KEY is absent the script exits 0 (graceful) so CI doesn't red.
// Each WAV is ~1–4 MB; the whole set is gitignored (fixtures/voice/).

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ── Cartesia config ────────────────────────────────────────────────────────────

const API_KEY = process.env.CARTESIA_API_KEY;

/** A male candidate voice ("Liam") — perceptually distinct from typical interviewer voices.
 *  Override via CANDIDATE_VOICE_ID if you prefer a different Cartesia voice. */
const CANDIDATE_VOICE_ID = process.env.CANDIDATE_VOICE_ID ?? 'a0e99841-438c-4a64-b679-ae501e7d6091';

const MODEL_ID = 'sonic-3.5'; // latest Sonic, matches backend DEFAULT_MODEL
const API_VERSION = '2026-03-01'; // Cartesia-Version header, matches backend DEFAULT_VERSION
const CARTESIA_BYTES_URL = 'https://api.cartesia.ai/tts/bytes';

/** Raw PCM-16 output at 16 kHz mono — smallest payload; WAV header is added by buildWav(). */
const OUTPUT_FORMAT = {
  container: 'raw',
  encoding: 'pcm_s16le',
  sample_rate: 16_000,
} as const;

// ── Silence prefix ─────────────────────────────────────────────────────────────
// 500 ms × 16 000 samples/s × 2 bytes/sample = 16 000 bytes of zeroes.

const SILENCE_MS = 500;
const SAMPLE_RATE = OUTPUT_FORMAT.sample_rate;
const SILENCE_BYTES = Buffer.alloc(Math.round((SILENCE_MS / 1000) * SAMPLE_RATE) * 2);

// ── Answer scripts ─────────────────────────────────────────────────────────────
// All answers are interview.io-calibre: structured, concrete, no made-up stats.

interface Clip {
  filename: string;
  /** Approximate target duration label (for the reader). */
  label: string;
  text: string;
}

const CLIPS: Clip[] = [
  // (a) ~50 s — project deep-dive: architecture, hard tradeoff, production incident + fix
  {
    filename: 'turn-01-project-deepdive.wav',
    label: '~50 s deep-dive',
    text:
      'Let me walk you through a distributed rate-limiter I built. ' +
      'We had a microservices API gateway handling around 50 000 requests per second, ' +
      'and a single Redis node was becoming the bottleneck for our token-bucket counters. ' +
      'The hard tradeoff was between strong consistency — serialising every increment through one primary — ' +
      'versus a small window of over-admission in exchange for horizontal scale. ' +
      'We chose a sliding-window approximate algorithm, sharding Redis by user-id hash, ' +
      'and accepted roughly a two-percent overage at the shard boundaries. ' +
      'In production we hit an incident where a hash-slot rebalance during a cluster resize ' +
      'caused a 400-millisecond spike in counter misses — effectively no rate-limiting for that window. ' +
      'We fixed it by pre-warming new slot owners from a read replica before cutting traffic over, ' +
      'and added a circuit-breaker that falls back to a local in-process leaky bucket ' +
      'if Redis latency exceeds 20 milliseconds. ' +
      'After that the system handled a 3x surge during a launch without any escapement.',
  },

  // (b) ~30 s — follow-up with numbers, tools, reasoning
  {
    filename: 'turn-02-followup-specifics.wav',
    label: '~30 s specifics',
    text:
      'The shard count was 64, which gave even distribution across our user-id space ' +
      'and kept the worst-case rebalance window under 30 milliseconds. ' +
      'We used Redis 7 Cluster with a replication factor of two per shard ' +
      'so reads could hit replicas during a failover. ' +
      'The local leaky-bucket fallback was tuned to 90 percent of the configured limit — ' +
      'conservative enough to protect downstream services ' +
      'but not so tight that a brief Redis hiccup would visibly degrade the API. ' +
      'Monitoring used Prometheus with a custom histogram for the admit-versus-reject ratio, ' +
      'alerting at a 5 percent sustained rejection rate above the baseline.',
  },

  // (c) ~30 s — conceptual think-aloud (hash-map internals / big-O trade-offs)
  {
    filename: 'turn-03-conceptual.wav',
    label: '~30 s conceptual',
    text:
      'A hash map achieves amortised O of 1 lookup by hashing the key to a bucket index ' +
      'then storing key-value pairs there. ' +
      'Worst case is O of n when all keys collide into the same bucket — ' +
      'a good hash function makes that extremely unlikely. ' +
      'The main cost is space: most implementations resize, ' +
      'doubling the bucket array and rehashing all entries, when the load factor crosses 0.75. ' +
      'Rehashing is O of n but amortised once over a sequence, ' +
      'so insertions are O of 1 amortised overall. ' +
      'Open addressing avoids pointer overhead but degrades faster under high load ' +
      'because linear probing creates clustering — long probe sequences that hurt cache locality.',
  },

  // (d) ~15 s — clarifying question before coding
  {
    filename: 'turn-04-clarifying.wav',
    label: '~15 s clarifying',
    text:
      'Before I start coding — should I optimise for time even if it means extra memory, ' +
      'or is space the tighter constraint here? ' +
      'And is the input guaranteed to be sorted, or should I handle the general unsorted case?',
  },

  // (e) ~20 s — approach summary before writing code
  {
    filename: 'turn-05-approach.wav',
    label: '~20 s approach',
    text:
      'My plan is a two-pointer approach on a sorted copy of the input, ' +
      'giving O of n log n time from the sort and O of 1 extra space for the scan itself. ' +
      "I'll walk left and right pointers inward, " +
      'adjusting based on whether the current sum is too low or too high, ' +
      'and skip duplicates before each iteration. ' +
      "I'll code this up now and verify the edge cases: " +
      'empty input, single element, and all identical values.',
  },

  // (f) ~10 s — wrap-up / post-run reflection
  {
    filename: 'turn-06-wrapup.wav',
    label: '~10 s wrap-up',
    text:
      "Overall I'm satisfied with the approach. The two-pointer scan is clean and covers all cases. " +
      "I'd add an early-return guard for inputs shorter than two elements to handle that edge case properly.",
  },
];

// ── WAV builder ────────────────────────────────────────────────────────────────

/** Wraps raw PCM-16 LE bytes in a standard RIFF WAV container (44-byte header). */
function buildWav(pcmBytes: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBytes.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // AudioFormat = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBytes]);
}

// ── TTS call ───────────────────────────────────────────────────────────────────

async function synthesise(text: string): Promise<Buffer> {
  const res = await fetch(CARTESIA_BYTES_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY!,
      'Cartesia-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: MODEL_ID,
      transcript: text,
      voice: { mode: 'id', id: CANDIDATE_VOICE_ID },
      output_format: OUTPUT_FORMAT,
      language: 'en',
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Cartesia TTS (${res.status}): ${msg.slice(0, 300)}`);
  }

  const rawPcm = Buffer.from(await res.arrayBuffer());
  // Prepend silence: clears the AEC warm-up tail + 200 ms min-speech gate
  return buildWav(Buffer.concat([SILENCE_BYTES, rawPcm]), SAMPLE_RATE);
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!API_KEY) {
    console.warn(
      '[fixtures:voice] CARTESIA_API_KEY is not set — skipping generation.\n' +
        '  Export CARTESIA_API_KEY=<your_key> and re-run: npm run fixtures:voice\n' +
        '  The voice-interview-mimic spec will skip if fixtures/voice/ is empty.'
    );
    process.exit(0); // graceful — no key, no fixtures; spec skips automatically
  }

  const outDir = resolve(__dirname, '../fixtures/voice');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(
    `[fixtures:voice] generating ${CLIPS.length} clips → ${outDir}\n` +
      `  model=${MODEL_ID}  voice=${CANDIDATE_VOICE_ID}  rate=${SAMPLE_RATE} Hz\n`
  );

  for (const clip of CLIPS) {
    const outPath = resolve(outDir, clip.filename);
    process.stdout.write(`  -> ${clip.filename}  (${clip.label}) … `);
    try {
      const wav = await synthesise(clip.text);
      writeFileSync(outPath, wav);
      const durationS = ((wav.length - 44) / (SAMPLE_RATE * 2)).toFixed(1);
      console.log(`ok  ${(wav.length / 1024).toFixed(0)} KB  ~${durationS} s`);
    } catch (err) {
      console.error(`\n  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  console.log(`\n[fixtures:voice] done. ${CLIPS.length} clips written to fixtures/voice/`);
}

void main();
