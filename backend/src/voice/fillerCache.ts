// Process-lifetime cache of synthesized filler clips. Each of the (few) fixed FILLERS phrases is
// synthesized via Cartesia at most ONCE per process, then served from memory — so the backchannel
// adds no per-turn TTS cost and the filler always uses the SAME voice id as the interviewer reply
// (/speak), so "Hmm." and the answer sound like one person. Cleared on restart (which also re-picks
// up a changed CARTESIA_VOICE_ID).

import { CartesiaConfig, cartesiaConfigFromEnv, synthesize } from './cartesia';
import { FILLERS } from './fillers';

type SynthFn = (text: string, cfg?: CartesiaConfig) => Promise<Buffer>;

// Keyed by filler index → the in-flight (or resolved) synthesis. Storing the Promise (not just the
// resolved Buffer) coalesces concurrent first-requests for the same index onto ONE synthesize() call.
const cache = new Map<number, Promise<Buffer>>();

/** WAV audio for filler `idx`, memoized for the process lifetime. `synth` is injectable for tests. */
export function getFillerAudio(
  idx: number,
  cfg?: CartesiaConfig,
  synth: SynthFn = synthesize
): Promise<Buffer> {
  const phrase = FILLERS[idx];
  if (phrase === undefined) {
    return Promise.reject(new Error(`filler index out of range: ${idx}`));
  }
  const hit = cache.get(idx);
  if (hit) return hit;
  // Resolve config lazily — only on a cache MISS (avoids reading process.env on every cache hit).
  // Don't cache a failure — drop it so a later request can retry the synthesis.
  const pending = synth(phrase, cfg ?? cartesiaConfigFromEnv()).catch((err: unknown) => {
    cache.delete(idx);
    throw err;
  });
  cache.set(idx, pending);
  return pending;
}

/** Test-only: drop all cached clips. */
export function _clearFillerCache(): void {
  cache.clear();
}
