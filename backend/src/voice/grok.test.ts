// Tests for the xAI Grok TTS adapter (grok.ts) and the TTS provider facade (tts.ts).
// WS streaming tests use a REAL in-process WebSocketServer on an ephemeral port so we
// exercise the actual socket lifecycle, pool logic, and Pcm16Aligner integration.

import type { AddressInfo } from 'net';
import type { IncomingMessage } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  grokConfigFromEnv,
  isGrokConfigured,
  synthesize,
  synthesizeStream,
  _resetPool,
  type GrokConfig,
} from './grok';
import { activeTtsProvider, isTtsConfigured } from './tts';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal 12-byte RIFF/WAV header (no actual audio samples). */
function minimalRiffBuffer(): Buffer {
  const buf = Buffer.alloc(12);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(4, 4); // chunk size
  buf.write('WAVE', 8, 'ascii');
  return buf;
}

/** Drain an async generator, returning all yielded Buffers. */
async function drain(gen: AsyncGenerator<Buffer, void, void>): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of gen) chunks.push(chunk);
  return chunks;
}

// ── Config gating + speed clamp ───────────────────────────────────────────────

describe('GrokConfig / isGrokConfigured', () => {
  const saved = {
    XAI_API_KEY: process.env.XAI_API_KEY,
    GROK_TTS_SPEED: process.env.GROK_TTS_SPEED,
    GROK_TTS_VOICE: process.env.GROK_TTS_VOICE,
    GROK_TTS_LANGUAGE: process.env.GROK_TTS_LANGUAGE,
  };
  afterEach(() => {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  });

  test('isGrokConfigured returns false when XAI_API_KEY is unset', () => {
    delete process.env.XAI_API_KEY;
    expect(isGrokConfigured()).toBe(false);
  });

  test('isGrokConfigured returns true when XAI_API_KEY is set', () => {
    process.env.XAI_API_KEY = 'xai-test';
    expect(isGrokConfigured()).toBe(true);
  });

  test('speed below SPEED_MIN (0.7) is clamped up to 0.7', () => {
    process.env.GROK_TTS_SPEED = '0.1';
    expect(grokConfigFromEnv().speed).toBe(0.7);
  });

  test('speed above SPEED_MAX (1.5) is clamped down to 1.5', () => {
    process.env.GROK_TTS_SPEED = '9';
    expect(grokConfigFromEnv().speed).toBe(1.5);
  });

  test('valid speed is preserved as-is', () => {
    process.env.GROK_TTS_SPEED = '1.1';
    expect(grokConfigFromEnv().speed).toBeCloseTo(1.1);
  });

  test('defaults: voice=sirius, language=en, speed=0.92', () => {
    delete process.env.GROK_TTS_SPEED;
    delete process.env.GROK_TTS_VOICE;
    delete process.env.GROK_TTS_LANGUAGE;
    const cfg = grokConfigFromEnv();
    expect(cfg.voice).toBe('sirius');
    expect(cfg.language).toBe('en');
    expect(cfg.speed).toBe(0.92);
  });
});

// ── Unary synthesize() ────────────────────────────────────────────────────────

describe('synthesize (unary WAV)', () => {
  const savedFetch = global.fetch;
  afterEach(() => {
    global.fetch = savedFetch;
  });

  const cfg: GrokConfig = { apiKey: 'xai-test', voice: 'sirius', language: 'en', speed: 0.92 };

  test('happy path: returns Buffer starting with RIFF magic', async () => {
    const riff = minimalRiffBuffer();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(riff.buffer.slice(riff.byteOffset, riff.byteOffset + riff.length)),
    } as unknown as Response);

    const result = await synthesize('Hello interviewer', cfg);
    expect(result.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  test('non-RIFF response throws a descriptive error', async () => {
    const notWav = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(notWav.buffer),
    } as unknown as Response);

    await expect(synthesize('Hello', cfg)).rejects.toThrow('RIFF magic missing');
  });

  test('HTTP error throws with status code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('duplicate field'),
    } as unknown as Response);

    await expect(synthesize('Hello', cfg)).rejects.toThrow('422');
  });

  test('throws immediately when apiKey is empty', async () => {
    await expect(synthesize('Hello', { ...cfg, apiKey: '' })).rejects.toThrow('XAI_API_KEY');
  });
});

// ── WebSocket streaming ───────────────────────────────────────────────────────

describe('synthesizeStream (WebSocket)', () => {
  let mockServer: WebSocketServer;
  let port: number;

  // Per-test connection handler — set in each test before calling synthesizeStream.
  let connectionHandler: ((ws: WebSocket, req: IncomingMessage) => void) | null = null;

  const testCfg: GrokConfig = { apiKey: 'xai-test', voice: 'sirius', language: 'en', speed: 0.92 };

  // Env vars saved before the suite and restored after.
  const savedEnv: Record<string, string | undefined> = {};
  const testEnvKeys = ['XAI_API_KEY', 'GROK_TTS_WS_BASE', 'GROK_FIRST_AUDIO_TIMEOUT_MS'];

  beforeAll(async () => {
    testEnvKeys.forEach((k) => {
      savedEnv[k] = process.env[k];
    });

    mockServer = new WebSocketServer({ port: 0 });
    mockServer.on('connection', (ws, req) => {
      connectionHandler?.(ws, req);
    });
    await new Promise<void>((r) => mockServer.once('listening', r));

    port = (mockServer.address() as AddressInfo).port;
    process.env.XAI_API_KEY = 'xai-test';
    process.env.GROK_TTS_WS_BASE = `ws://127.0.0.1:${port}`;
    process.env.GROK_FIRST_AUDIO_TIMEOUT_MS = '300'; // short so timeout test completes fast
  });

  afterAll((done) => {
    // Restore env, terminate all client sockets, close server.
    testEnvKeys.forEach((k) => {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    });
    mockServer.clients.forEach((ws) => ws.terminate());
    mockServer.close(done);
  });

  beforeEach(() => {
    connectionHandler = null;
    _resetPool();
  });

  // ── correct query params + auth header ──

  test('sends correct query params and Authorization header', async () => {
    let capturedUrl: string | undefined;
    let capturedAuth: string | undefined;

    connectionHandler = (ws, req) => {
      capturedUrl = req.url ?? '';
      capturedAuth = req.headers['authorization'] as string;
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === 'text.done') {
          ws.send(
            JSON.stringify({ type: 'audio.delta', delta: Buffer.alloc(4).toString('base64') })
          );
          ws.send(JSON.stringify({ type: 'audio.done' }));
        }
      });
    };

    await drain(synthesizeStream('hello', testCfg));

    expect(capturedUrl).toContain('voice=sirius');
    expect(capturedUrl).toContain('codec=pcm');
    expect(capturedUrl).toContain('sample_rate=24000');
    expect(capturedUrl).toContain('language=en');
    expect(capturedUrl).toContain('optimize_streaming_latency=1');
    expect(capturedAuth).toBe('Bearer xai-test');
  });

  // ── delta/done protocol + Pcm16Aligner ──

  test('decodes base64 chunks and aligns odd-byte splits via Pcm16Aligner', async () => {
    // Feed three chunks with odd byte lengths: 3, 3, 2 → total 8 bytes, all even.
    // Pcm16Aligner carries the trailing odd byte into the next chunk.
    connectionHandler = (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === 'text.done') {
          ws.send(
            JSON.stringify({
              type: 'audio.delta',
              delta: Buffer.from([0, 1, 2]).toString('base64'),
            })
          );
          ws.send(
            JSON.stringify({
              type: 'audio.delta',
              delta: Buffer.from([3, 4, 5]).toString('base64'),
            })
          );
          ws.send(
            JSON.stringify({ type: 'audio.delta', delta: Buffer.from([6, 7]).toString('base64') })
          );
          ws.send(JSON.stringify({ type: 'audio.done' }));
        }
      });
    };

    const chunks = await drain(synthesizeStream('hello', testCfg));
    const all = Buffer.concat(chunks);

    // INVARIANT: all yielded bytes are PCM s16le aligned (even count).
    expect(all.length % 2).toBe(0);
    expect([...all]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  // ── first-audio timeout ──

  test('throws when no audio.delta arrives within the first-audio timeout', async () => {
    // Server accepts the connection and receives text frames but deliberately never sends audio.
    connectionHandler = (ws) => {
      ws.on('message', () => {
        /* intentionally silent */
      });
    };

    // GROK_FIRST_AUDIO_TIMEOUT_MS=300 set in beforeAll; the server never sends audio,
    // so the timeout fires and the generator rejects.
    await expect(drain(synthesizeStream('hello', testCfg))).rejects.toThrow('first audio timeout');
  });

  // ── error frame → throw ──

  test('throws when the server sends an error frame', async () => {
    connectionHandler = (ws) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === 'text.done') {
          ws.send(JSON.stringify({ type: 'error', message: 'voice synthesis failed' }));
        }
      });
    };

    await expect(drain(synthesizeStream('hello', testCfg))).rejects.toThrow(
      'voice synthesis failed'
    );
  });

  // ── pool reuse: second utterance reuses the same socket ──

  test('reuses the same WebSocket connection for a second utterance', async () => {
    let connectionCount = 0;

    connectionHandler = (ws) => {
      connectionCount++;
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === 'text.done') {
          ws.send(
            JSON.stringify({ type: 'audio.delta', delta: Buffer.alloc(4).toString('base64') })
          );
          ws.send(JSON.stringify({ type: 'audio.done' }));
        }
      });
    };

    await drain(synthesizeStream('first utterance', testCfg));
    await drain(synthesizeStream('second utterance', testCfg));

    // Both utterances should have gone through a single WebSocket connection.
    expect(connectionCount).toBe(1);
  });

  // ── destroy-on-error: error frame removes socket from pool ──

  test('destroys the socket after an error frame (does not reuse it)', async () => {
    let connectionCount = 0;

    connectionHandler = (ws) => {
      const n = ++connectionCount;
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === 'text.done') {
          if (n === 1) {
            // First utterance: send error to trigger destroy.
            ws.send(JSON.stringify({ type: 'error', message: 'intentional error' }));
          } else {
            // Second utterance: send success.
            ws.send(
              JSON.stringify({ type: 'audio.delta', delta: Buffer.alloc(4).toString('base64') })
            );
            ws.send(JSON.stringify({ type: 'audio.done' }));
          }
        }
      });
    };

    // First call throws.
    await expect(drain(synthesizeStream('hello', testCfg))).rejects.toThrow('intentional error');

    // Second call must open a NEW connection (the errored socket must not be reused).
    await drain(synthesizeStream('hello', testCfg));

    expect(connectionCount).toBe(2);
  });

  // ── throw immediately when apiKey is empty ──

  test('throws before connecting when apiKey is empty', async () => {
    await expect(drain(synthesizeStream('hello', { ...testCfg, apiKey: '' }))).rejects.toThrow(
      'XAI_API_KEY'
    );
  });
});

// ── TTS provider facade (tts.ts) ──────────────────────────────────────────────

describe('activeTtsProvider / isTtsConfigured (tts.ts facade)', () => {
  const savedProvider = process.env.TTS_PROVIDER;
  const savedKey = process.env.XAI_API_KEY;
  const savedCartesiaKey = process.env.CARTESIA_API_KEY;
  const savedCartesiaVoice = process.env.CARTESIA_VOICE_ID;

  afterEach(() => {
    if (savedProvider === undefined) delete process.env.TTS_PROVIDER;
    else process.env.TTS_PROVIDER = savedProvider;
    if (savedKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = savedKey;
    if (savedCartesiaKey === undefined) delete process.env.CARTESIA_API_KEY;
    else process.env.CARTESIA_API_KEY = savedCartesiaKey;
    if (savedCartesiaVoice === undefined) delete process.env.CARTESIA_VOICE_ID;
    else process.env.CARTESIA_VOICE_ID = savedCartesiaVoice;
  });

  test('defaults to cartesia when TTS_PROVIDER is unset', () => {
    delete process.env.TTS_PROVIDER;
    expect(activeTtsProvider()).toBe('cartesia');
  });

  test('returns grok when TTS_PROVIDER=grok', () => {
    process.env.TTS_PROVIDER = 'grok';
    expect(activeTtsProvider()).toBe('grok');
  });

  test('case-insensitive: TTS_PROVIDER=GROK resolves to grok', () => {
    process.env.TTS_PROVIDER = 'GROK';
    expect(activeTtsProvider()).toBe('grok');
  });

  test('unknown value falls back to cartesia', () => {
    process.env.TTS_PROVIDER = 'elevenlabs';
    expect(activeTtsProvider()).toBe('cartesia');
  });

  test('isTtsConfigured() reflects grok key presence when TTS_PROVIDER=grok', () => {
    process.env.TTS_PROVIDER = 'grok';
    process.env.XAI_API_KEY = '';
    expect(isTtsConfigured()).toBe(false);
    process.env.XAI_API_KEY = 'xai-live';
    expect(isTtsConfigured()).toBe(true);
  });

  test('isTtsConfigured() reflects cartesia config when TTS_PROVIDER=cartesia', () => {
    process.env.TTS_PROVIDER = 'cartesia';
    process.env.CARTESIA_API_KEY = '';
    process.env.CARTESIA_VOICE_ID = '';
    expect(isTtsConfigured()).toBe(false);
    process.env.CARTESIA_API_KEY = 'sk-cart';
    process.env.CARTESIA_VOICE_ID = 'voice-abc';
    expect(isTtsConfigured()).toBe(true);
  });
});
