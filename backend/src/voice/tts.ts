// TTS provider facade — the single import target for all routes.
// Dispatches to Cartesia (default) or Grok based on TTS_PROVIDER env var.
// Both providers yield raw pcm_s16le mono @ STREAM_SAMPLE_RATE (24 kHz) from synthesizeStream,
// so the route implementation is identical for both.
//
// Usage: replace `import { ... } from './cartesia'` with `import { ... } from './tts'` in routes.
// The Config/internal-helper exports (CartesiaConfig, GrokConfig, etc.) stay on their own modules;
// routes that need them import directly. This facade only exposes what the routes need.

export { splitSentences, STREAM_SAMPLE_RATE } from './cartesia';

import {
  isCartesiaConfigured,
  synthesize as cartesiaSynthesize,
  synthesizeStream as cartesiaSynthesizeStream,
} from './cartesia';

import {
  isGrokConfigured,
  synthesize as grokSynthesize,
  synthesizeStream as grokSynthesizeStream,
  synthesizeStreamSentences as grokSynthesizeStreamSentences,
  prewarmTts as grokPrewarmTts,
  hasIdleGrokSocket,
} from './grok';

import { stripSpeechTags } from './speech-tags';

/** Which TTS provider is active. Reads TTS_PROVIDER at call time (not module-load time) so tests
 *  can flip the env var between assertions. */
export function activeTtsProvider(): 'cartesia' | 'grok' {
  return process.env.TTS_PROVIDER?.toLowerCase() === 'grok' ? 'grok' : 'cartesia';
}

/** True when the active provider has the credentials it needs to synthesize. */
export function isTtsConfigured(): boolean {
  return activeTtsProvider() === 'grok' ? isGrokConfigured() : isCartesiaConfigured();
}

/** Synthesize `text` to a WAV buffer using the active TTS provider.
 *  Grok: speech tags are sanitized inside grok.ts (whitelist passes, unknowns stripped).
 *  Cartesia: ALL speech tags are stripped — Cartesia only knows its own <break>/<spell> syntax. */
export async function synthesize(text: string): Promise<Buffer> {
  return activeTtsProvider() === 'grok'
    ? grokSynthesize(text)
    : cartesiaSynthesize(stripSpeechTags(text));
}

/** Stream one utterance as raw pcm_s16le mono @ STREAM_SAMPLE_RATE using the active provider.
 *  Same tag-handling rules as synthesize(). */
export async function* synthesizeStream(text: string): AsyncGenerator<Buffer, void, void> {
  if (activeTtsProvider() === 'grok') {
    yield* grokSynthesizeStream(text);
  } else {
    yield* cartesiaSynthesizeStream(stripSpeechTags(text));
  }
}

/** Stream pre-split sentences over a single connection (Grok) or as one synthesis call (Cartesia).
 *  For Grok: each sentence is sent as its own text.delta/text.done pair on one pooled WebSocket;
 *  the first sentence's audio lands before the full utterance is synthesised, cutting TTFB.
 *  For Cartesia: falls back to a single synthesizeStream call with the joined text.
 *  Audio format is byte-identical to synthesizeStream (pcm_s16le mono 24 kHz). */
export async function* synthesizeStreamSentences(
  sentences: string[]
): AsyncGenerator<Buffer, void, void> {
  if (activeTtsProvider() === 'grok') {
    yield* grokSynthesizeStreamSentences(sentences);
  } else {
    // Cartesia does not have a per-sentence incremental protocol; join and stream as one call.
    yield* cartesiaSynthesizeStream(stripSpeechTags(sentences.join(' ')));
  }
}

/** Fire-and-forget: open one idle TTS WebSocket so the next synthesis call costs ~0 ms instead of
 *  ~978 ms (Grok cold-connect measured in prod). No-op for Cartesia or when Grok is not configured.
 *  Never throws. Call at interview begin and at every candidate turn start. */
export function prewarmTts(): void {
  if (activeTtsProvider() === 'grok') {
    grokPrewarmTts();
  }
  // Cartesia uses HTTP; no WebSocket pool to pre-warm.
}

/** True when a pre-warmed Grok socket is waiting idle in the pool (i.e. the next synthesis will
 *  be a pool hit). Always false for Cartesia. Use before synthesis to log a hit/miss metric. */
export function hasPriorWarmSocket(): boolean {
  return activeTtsProvider() === 'grok' ? hasIdleGrokSocket() : false;
}
