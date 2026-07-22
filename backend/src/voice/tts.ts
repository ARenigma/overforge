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
} from './grok';

/** Which TTS provider is active. Reads TTS_PROVIDER at call time (not module-load time) so tests
 *  can flip the env var between assertions. */
export function activeTtsProvider(): 'cartesia' | 'grok' {
  return process.env.TTS_PROVIDER?.toLowerCase() === 'grok' ? 'grok' : 'cartesia';
}

/** True when the active provider has the credentials it needs to synthesize. */
export function isTtsConfigured(): boolean {
  return activeTtsProvider() === 'grok' ? isGrokConfigured() : isCartesiaConfigured();
}

/** Synthesize `text` to a WAV buffer using the active TTS provider. */
export async function synthesize(text: string): Promise<Buffer> {
  return activeTtsProvider() === 'grok' ? grokSynthesize(text) : cartesiaSynthesize(text);
}

/** Stream one utterance as raw pcm_s16le mono @ STREAM_SAMPLE_RATE using the active provider. */
export async function* synthesizeStream(text: string): AsyncGenerator<Buffer, void, void> {
  if (activeTtsProvider() === 'grok') {
    yield* grokSynthesizeStream(text);
  } else {
    yield* cartesiaSynthesizeStream(text);
  }
}
