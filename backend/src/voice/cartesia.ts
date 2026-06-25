// Cartesia TTS — synthesize an interviewer utterance to audio bytes server-side, so the API key
// never reaches the browser. P1 ("the interviewer speaks") uses the non-streaming /tts/bytes
// endpoint: for the half-duplex flow (candidate types, interviewer speaks) a full short clip is
// plenty fast. Streaming + a held-open WebSocket is a P2/P3 concern for real-time turn-taking.

const DEFAULT_MODEL = 'sonic-2';
const DEFAULT_VERSION = '2024-11-13';
const MAX_CHARS = 2000; // an interviewer turn is 1–3 sentences; cap defensively

export interface CartesiaConfig {
  apiKey: string;
  voiceId: string;
  model: string;
  version: string;
}

export function cartesiaConfigFromEnv(): CartesiaConfig {
  return {
    apiKey: process.env.CARTESIA_API_KEY ?? '',
    voiceId: process.env.CARTESIA_VOICE_ID ?? '',
    model: process.env.CARTESIA_MODEL || DEFAULT_MODEL,
    version: process.env.CARTESIA_VERSION || DEFAULT_VERSION,
  };
}

/** Voice is OFF unless both the key and a voice id are set — the room degrades to text-only. */
export function isCartesiaConfigured(cfg: CartesiaConfig = cartesiaConfigFromEnv()): boolean {
  return Boolean(cfg.apiKey && cfg.voiceId);
}

/** Synthesize `text` to a WAV buffer. Throws (caller decides how to degrade) if unconfigured or
 *  the API errors — voice is never allowed to break the text interview. */
export async function synthesize(
  text: string,
  cfg: CartesiaConfig = cartesiaConfigFromEnv()
): Promise<Buffer> {
  if (!cfg.apiKey || !cfg.voiceId) {
    throw new Error('Cartesia not configured: set CARTESIA_API_KEY and CARTESIA_VOICE_ID.');
  }
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': cfg.apiKey,
      'Cartesia-Version': cfg.version,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: cfg.model,
      transcript: text.slice(0, MAX_CHARS),
      voice: { mode: 'id', id: cfg.voiceId },
      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cartesia HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
