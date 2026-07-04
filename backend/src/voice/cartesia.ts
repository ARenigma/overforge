// Cartesia TTS — synthesize an interviewer utterance to audio bytes server-side, so the API key
// never reaches the browser. Two paths:
//   1. Non-streaming /tts/bytes (WAV) — used by the legacy per-sentence /speak route and /filler.
//   2. Streaming /tts/sse (raw pcm_s16le) — used by /speak-stream (P1-B): audio chunks are
//      forwarded to the room as Cartesia generates them, so the first audio lands at ~TTFB
//      instead of after full-sentence synthesis. SSE was chosen over the WebSocket endpoint
//      because we always have the FULL utterance text up front (one POST per utterance, no
//      connection lifecycle / context_id continuation management) and over chunked /tts/bytes
//      because SSE has explicit chunk/done/error events (clean-completion is distinguishable
//      from truncation).

const DEFAULT_MODEL = 'sonic-3.5'; // latest Sonic (docs.cartesia.ai, verified 2026-07)
const DEFAULT_VERSION = '2026-03-01'; // Cartesia-Version required for the sonic-3.x models
const MAX_CHARS = 2000; // an interviewer turn is 1–3 sentences; cap defensively
const SAMPLE_RATE = 22050; // 22k is ample for speech and ~halves bytes vs 44.1k (snappier transfer)
/** Raw PCM sample rate for the streaming path (pcm_s16le mono @ 24 kHz). */
export const STREAM_SAMPLE_RATE = 24000;
const MAX_CHUNKS = 8;
// Hard ceiling on one streamed synthesis (connect + full body). Sonic generates much faster than
// realtime, so even a MAX_CHARS utterance finishes well inside this; it exists so an upstream
// stall can never hold the route (and the candidate's mic gate) open forever.
const STREAM_TIMEOUT_MS = 120_000;

/** Split an interviewer turn into sentence-ish chunks so the room can synthesize + start playing
 *  the FIRST one in ~1–2s instead of waiting ~6–10s for the whole clip. Tiny fragments merge into
 *  the previous chunk; overflow past MAX_CHUNKS folds into the last so we never fan out unboundedly. */
export function splitSentences(text: string, maxChunks = MAX_CHUNKS): string[] {
  const pieces = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const p of pieces) {
    const prev = chunks[chunks.length - 1];
    // Merge very short fragments (e.g. "Hi.") into the previous chunk to avoid choppy playback.
    if (prev && (p.length < 16 || prev.length < 16)) chunks[chunks.length - 1] = `${prev} ${p}`;
    else chunks.push(p);
  }
  if (chunks.length <= maxChunks) return chunks.length ? chunks : [text.trim()];
  const head = chunks.slice(0, maxChunks - 1);
  head.push(chunks.slice(maxChunks - 1).join(' '));
  return head;
}

/** Normalize interviewer text for TEXT-TO-SPEECH. Code identifiers read aloud badly — Cartesia
 *  pronounces "max_attempts" as "max underscore attempts" and "ExternalTaskSensor" as one mashed
 *  word. This converts snake_case / camelCase identifiers and strips backticks so they're spoken as
 *  natural words. Applied ONLY to TTS input; the stored transcript (scoring + on-screen display) is
 *  untouched. Normal prose (no underscores/camelCase/backticks) passes through unchanged. Exported
 *  for unit tests. */
export function prepareTranscript(text: string): string {
  return text
    .replace(/`/g, '') // drop code backticks
    .replace(/_/g, ' ') // snake_case → words: "max_attempts" → "max attempts"
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase → words: "maxAttempts" → "max Attempts"
    .replace(/[ \t]{2,}/g, ' ') // collapse doubled spaces introduced above
    .trim();
}

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

/** Both documented auth schemes with the same key: X-API-Key (legacy, prod-proven here) and
 *  Authorization: Bearer (what the current API reference shows). Sending both is harmless and
 *  keeps us compatible across Cartesia-Version values. */
function authHeaders(cfg: CartesiaConfig): Record<string, string> {
  return {
    'X-API-Key': cfg.apiKey,
    Authorization: `Bearer ${cfg.apiKey}`,
    'Cartesia-Version': cfg.version,
    'Content-Type': 'application/json',
  };
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
    headers: authHeaders(cfg),
    body: JSON.stringify({
      model_id: cfg.model,
      transcript: prepareTranscript(text).slice(0, MAX_CHARS),
      voice: { mode: 'id', id: cfg.voiceId },
      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: SAMPLE_RATE },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cartesia HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── Streaming path (P1-B) ─────────────────────────────────────────────────────

/** Incremental Server-Sent-Events parser: feed decoded text as it arrives, get back the payload
 *  string of each COMPLETE event (its `data:` lines joined). Events split across network chunks
 *  are reassembled; `event:`/`id:`/comment lines are ignored (Cartesia carries everything in the
 *  data JSON). Exported for unit tests. */
export class SseEventParser {
  private buf = '';

  push(textChunk: string): string[] {
    this.buf += textChunk.replace(/\r\n/g, '\n');
    const events: string[] = [];
    let sep: number;
    while ((sep = this.buf.indexOf('\n\n')) !== -1) {
      const rawEvent = this.buf.slice(0, sep);
      this.buf = this.buf.slice(sep + 2);
      const data = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) events.push(data);
    }
    return events;
  }
}

/** PCM16 chunk aligner: network/base64 chunk boundaries can land mid-sample (odd byte length);
 *  playing a misaligned tail as Int16 turns the rest of the clip into noise. `push` returns the
 *  even-length prefix (or null) and carries the odd trailing byte into the next chunk.
 *  Exported for unit tests. */
export class Pcm16Aligner {
  private carry: Buffer | null = null;

  push(chunk: Buffer): Buffer | null {
    const merged = this.carry ? Buffer.concat([this.carry, chunk]) : chunk;
    const even = merged.length & ~1;
    this.carry = even < merged.length ? Buffer.from(merged.subarray(even)) : null;
    return even > 0 ? merged.subarray(0, even) : null;
  }
}

interface SseTtsEvent {
  type?: string;
  data?: string;
  done?: boolean;
  message?: string;
}

/** Stream one utterance's audio progressively as raw pcm_s16le mono @ STREAM_SAMPLE_RATE.
 *  Sends the FULL utterance text in one POST to /tts/sse — Cartesia synthesizes and pushes
 *  base64 chunks as they're ready, which this generator decodes, 2-byte-aligns and yields.
 *  Throws before the first yield on config/HTTP errors (the route maps that to 502); a mid-stream
 *  `error` event also throws so the route can end the response. */
export async function* synthesizeStream(
  text: string,
  cfg: CartesiaConfig = cartesiaConfigFromEnv()
): AsyncGenerator<Buffer, void, void> {
  if (!cfg.apiKey || !cfg.voiceId) {
    throw new Error('Cartesia not configured: set CARTESIA_API_KEY and CARTESIA_VOICE_ID.');
  }
  const res = await fetch('https://api.cartesia.ai/tts/sse', {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify({
      model_id: cfg.model,
      transcript: prepareTranscript(text).slice(0, MAX_CHARS),
      voice: { mode: 'id', id: cfg.voiceId },
      output_format: {
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: STREAM_SAMPLE_RATE,
      },
    }),
    signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cartesia HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseEventParser();
  const aligner = new Pcm16Aligner();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return; // upstream closed without a done event — treat as end-of-audio
      for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
        let evt: SseTtsEvent;
        try {
          evt = JSON.parse(payload) as SseTtsEvent;
        } catch {
          continue; // non-JSON keepalive/comment — ignore
        }
        if (evt.type === 'error') {
          throw new Error(
            `Cartesia stream error: ${String(evt.message ?? 'unknown').slice(0, 200)}`
          );
        }
        if (evt.type === 'chunk' && typeof evt.data === 'string' && evt.data) {
          const aligned = aligner.push(Buffer.from(evt.data, 'base64'));
          if (aligned) yield aligned;
          continue;
        }
        if (evt.type === 'done' || evt.done === true) return;
      }
    }
  } finally {
    // Runs on normal completion, thrown errors AND generator.return() (client disconnect):
    // always release the upstream connection.
    reader.cancel().catch(() => undefined);
  }
}
