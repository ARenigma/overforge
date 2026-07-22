// xAI Grok TTS adapter — two paths:
//   1. Unary: POST https://api.x.ai/v1/tts → raw WAV bytes (RIFF PCM16 mono 24 kHz).
//   2. Streaming: WebSocket wss://api.x.ai/v1/tts → pcm_s16le mono 24 kHz via base64 chunks.
//
// Public surface mirrors cartesia.ts exactly so the route swap in interviews.ts is a pure
// import-path change. Text shaping uses prepareTranscript() from cartesia (tag-aware identifier
// normalisation) but NOT insertProsodyBreak (that embeds Cartesia-specific <break> SSML; Grok
// pauses come from punctuation + speed).
//
// NOTE: The xAI streaming endpoint returns raw PCM s16le when codec=pcm. PCM s16le samples are
// 2 bytes each so a valid stream always has an even total byte count. Network/base64 chunk
// boundaries can produce an odd-length Buffer; every chunk MUST pass through Pcm16Aligner before
// yielding. UNIT-TESTABLE INVARIANT: every Buffer yielded by synthesizeStream has even length.

import WebSocket from 'ws';
import { Pcm16Aligner, prepareTranscript } from './cartesia';

const DEFAULT_VOICE = 'sirius';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_SPEED = 0.92;
const SPEED_MIN = 0.7;
const SPEED_MAX = 1.5;
const MAX_CHARS = 2000;
const POOL_CAP = 8;
const IDLE_TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 5_000;
const UTTERANCE_TIMEOUT_MS = 120_000;
const RIFF_MAGIC = Buffer.from('RIFF');

// Internal base URLs — readable from env so unit tests can redirect to an in-process mock server
// without touching prod routing. Not documented for production overrides.
function wsBaseUrl(): string {
  return process.env.GROK_TTS_WS_BASE ?? 'wss://api.x.ai/v1/tts';
}
function httpBaseUrl(): string {
  return process.env.GROK_TTS_HTTP_BASE ?? 'https://api.x.ai/v1/tts';
}

// Read at call time so tests can set GROK_FIRST_AUDIO_TIMEOUT_MS before the first call.
function firstAudioTimeoutMs(): number {
  const n = Number(process.env.GROK_FIRST_AUDIO_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 15_000;
}

export interface GrokConfig {
  apiKey: string;
  voice: string;
  language: string;
  speed: number; // clamped to [SPEED_MIN, SPEED_MAX] at construction
}

export function grokConfigFromEnv(): GrokConfig {
  const rawSpeed = Number(process.env.GROK_TTS_SPEED);
  const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : DEFAULT_SPEED;
  return {
    apiKey: process.env.XAI_API_KEY ?? '',
    voice: process.env.GROK_TTS_VOICE ?? DEFAULT_VOICE,
    language: process.env.GROK_TTS_LANGUAGE ?? DEFAULT_LANGUAGE,
    speed: Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed)),
  };
}

/** Voice is OFF unless the xAI API key is set. Grok TTS needs only a key (no voice-id lookup). */
export function isGrokConfigured(cfg: GrokConfig = grokConfigFromEnv()): boolean {
  return Boolean(cfg.apiKey);
}

// ── Unary path ────────────────────────────────────────────────────────────────

/** Synthesize `text` to a WAV buffer via the xAI TTS REST endpoint.
 *  Validates the RIFF magic so callers get a clear error instead of a corrupt audio blob.
 *  Throws on config errors, HTTP errors, or non-WAV responses. */
export async function synthesize(
  text: string,
  cfg: GrokConfig = grokConfigFromEnv()
): Promise<Buffer> {
  if (!cfg.apiKey) {
    throw new Error('Grok TTS not configured: set XAI_API_KEY.');
  }
  const shaped = prepareTranscript(text).slice(0, MAX_CHARS);
  const res = await fetch(httpBaseUrl(), {
    signal: AbortSignal.timeout(30_000),
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: shaped,
      voice: cfg.voice,
      language: cfg.language,
      speed: cfg.speed,
      text_normalization: true,
      output_format: { codec: 'wav', sample_rate: 24000 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Grok TTS HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4 || !buf.subarray(0, 4).equals(RIFF_MAGIC)) {
    throw new Error(
      `Grok TTS: response is not a valid WAV file (RIFF magic missing; got 0x${buf.subarray(0, 4).toString('hex')})`
    );
  }
  return buf;
}

// ── WebSocket connection pool ─────────────────────────────────────────────────

interface WsMessage {
  type?: string;
  delta?: string;
  message?: string;
}

interface PoolEntry {
  key: string;
  ws: WebSocket;
  leased: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  unpooled: boolean;
}

// Module-level pool — shared across all synthesizeStream calls. Keyed by config params so
// a voice/language/speed change gets a fresh socket rather than sending mismatched params.
const pool: PoolEntry[] = [];

function configKey(cfg: GrokConfig): string {
  return `${cfg.voice}|${cfg.language}|${cfg.speed}`;
}

function buildWsUrl(cfg: GrokConfig): string {
  const p = new URLSearchParams({
    voice: cfg.voice,
    language: cfg.language,
    speed: String(cfg.speed),
    codec: 'pcm',
    sample_rate: '24000',
    optimize_streaming_latency: '1',
    text_normalization: 'true',
  });
  return `${wsBaseUrl()}?${p.toString()}`;
}

function destroyEntry(entry: PoolEntry): void {
  if (entry.idleTimer !== null) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
  const idx = pool.indexOf(entry);
  if (idx !== -1) pool.splice(idx, 1);
  try {
    entry.ws.terminate();
  } catch {
    /* already closed */
  }
}

function releaseEntry(entry: PoolEntry): void {
  entry.leased = false;
  if (entry.unpooled) {
    destroyEntry(entry);
    return;
  }
  if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
  // Close idle sockets after 120s (lazy cleanup also fires at acquire).
  entry.idleTimer = setTimeout(() => destroyEntry(entry), IDLE_TIMEOUT_MS);
}

/** Reset the connection pool. For unit tests only — production code must not call this. */
export function _resetPool(): void {
  const entries = [...pool];
  for (const e of entries) destroyEntry(e);
}

function connectEntry(cfg: GrokConfig, unpooled: boolean): Promise<PoolEntry> {
  return new Promise<PoolEntry>((resolve, reject) => {
    const ws = new WebSocket(buildWsUrl(cfg), {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Grok TTS WebSocket connect timeout (5s)'));
    }, CONNECT_TIMEOUT_MS);

    ws.once('open', () => {
      clearTimeout(timer);
      const entry: PoolEntry = { key: configKey(cfg), ws, leased: true, idleTimer: null, unpooled };
      if (!unpooled) pool.push(entry);
      resolve(entry);
    });
    ws.once('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function acquireSocket(cfg: GrokConfig): Promise<PoolEntry> {
  const key = configKey(cfg);
  // Lazy cleanup: evict sockets that closed outside our control (server restart, network drop).
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i].ws.readyState !== WebSocket.OPEN) destroyEntry(pool[i]);
  }
  const idle = pool.find((e) => e.key === key && !e.leased && e.ws.readyState === WebSocket.OPEN);
  if (idle) {
    idle.leased = true;
    if (idle.idleTimer !== null) {
      clearTimeout(idle.idleTimer);
      idle.idleTimer = null;
    }
    return idle;
  }
  // Add to pool if under cap; connect unpooled (and close after use) if at cap.
  return connectEntry(cfg, pool.length >= POOL_CAP);
}

function rawToString(raw: WebSocket.RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw as Buffer[]).toString('utf8');
  return Buffer.from(raw as ArrayBuffer).toString('utf8');
}

// ── Streaming path ────────────────────────────────────────────────────────────

/** Stream one utterance progressively as raw pcm_s16le mono @ 24 kHz using a pooled WebSocket.
 *
 *  Protocol (validated live against api.x.ai 2026-07-22):
 *    client → {type:"text.delta", delta:"<full utterance>"}
 *    client → {type:"text.done"}
 *    server → {type:"audio.delta", delta:"<base64 PCM chunk>"} × N
 *    server → {type:"audio.done"}
 *    (connection stays open; next utterance sends another text.delta/text.done pair)
 *
 *  Timeouts: first audio.delta within firstAudioTimeoutMs() (default 15 s); whole utterance
 *  within 120 s. The generator's finally ALWAYS releases or destroys the lease so a client
 *  disconnect (generator.return()) never leaks a socket. */
export async function* synthesizeStream(
  text: string,
  cfg: GrokConfig = grokConfigFromEnv()
): AsyncGenerator<Buffer, void, void> {
  if (!cfg.apiKey) {
    throw new Error('Grok TTS not configured: set XAI_API_KEY.');
  }

  const entry = await acquireSocket(cfg);
  const aligner = new Pcm16Aligner();
  const shaped = prepareTranscript(text).slice(0, MAX_CHARS);

  // Single-producer single-consumer queue: WS message callbacks push; the async generator pulls.
  // All callbacks run on the Node.js event loop so there are no concurrent pushes.
  type QItem = { buf: Buffer } | { done: true } | { err: Error };
  const queue: QItem[] = [];
  let notify: (() => void) | null = null;

  function pushItem(item: QItem): void {
    queue.push(item);
    if (notify) {
      const fn = notify;
      notify = null;
      fn();
    }
  }

  function waitForItem(): Promise<void> {
    return new Promise<void>((r) => {
      notify = r;
    });
  }

  let firstAudioReceived = false;

  const onMessage = (raw: WebSocket.RawData): void => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(rawToString(raw)) as WsMessage;
    } catch {
      return;
    }
    if (msg.type === 'audio.delta' && typeof msg.delta === 'string' && msg.delta) {
      if (!firstAudioReceived) firstAudioReceived = true;
      const aligned = aligner.push(Buffer.from(msg.delta, 'base64'));
      if (aligned) pushItem({ buf: aligned });
    } else if (msg.type === 'audio.done') {
      pushItem({ done: true });
    } else if (msg.type === 'error') {
      pushItem({
        err: new Error(`Grok stream error: ${String(msg.message ?? 'unknown').slice(0, 200)}`),
      });
    }
  };
  const onError = (err: Error): void => pushItem({ err });
  // Unexpected server-side close: treat as done so the caller can decide whether to retry.
  const onClose = (): void => pushItem({ done: true });

  entry.ws.on('message', onMessage);
  entry.ws.on('error', onError);
  entry.ws.on('close', onClose);

  const firstAudioTimer = setTimeout(() => {
    if (!firstAudioReceived) {
      pushItem({
        err: new Error('Grok TTS: first audio timeout (no audio received within timeout)'),
      });
    }
  }, firstAudioTimeoutMs());

  const utteranceTimer = setTimeout(
    () => pushItem({ err: new Error('Grok TTS: utterance timeout (120s)') }),
    UTTERANCE_TIMEOUT_MS
  );

  // Set on clean audio.done; determines whether to release (reuse) or destroy the socket.
  let healthy = false;
  try {
    entry.ws.send(JSON.stringify({ type: 'text.delta', delta: shaped }));
    entry.ws.send(JSON.stringify({ type: 'text.done' }));

    for (;;) {
      while (queue.length > 0) {
        const item = queue.shift()!;
        if ('err' in item) throw item.err;
        if ('done' in item) {
          healthy = true;
          return;
        }
        yield item.buf;
      }
      await waitForItem();
    }
  } finally {
    // Runs on normal return, thrown errors, AND generator.return() (client disconnect).
    clearTimeout(firstAudioTimer);
    clearTimeout(utteranceTimer);
    entry.ws.off('message', onMessage);
    entry.ws.off('error', onError);
    entry.ws.off('close', onClose);
    if (healthy) releaseEntry(entry);
    else destroyEntry(entry);
  }
}
