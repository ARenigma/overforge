/**
 * TypeScript mirror of voice/ws_protocol.py — FROZEN wire protocol shapes.
 * All JSON field names are camelCase exactly as they appear on the wire.
 * Do NOT add fields here without updating ws_protocol.py first.
 */

// Re-export shared types from api.ts so callers have one import path.
export type { InterviewPhase, Utterance } from '@/lib/api';

// ── Expects ──────────────────────────────────────────────────────────────────

export type Expects = 'voice' | 'text' | 'code';

// ── Wire utterance (server shape, identical to Utterance in api.ts) ──────────

export interface WireUtterance {
  text: string;
  expects: Expects;
}

// ── Client → Server messages ─────────────────────────────────────────────────

export interface ClientHello {
  type: 'hello';
  token: string;
}

export interface ClientSpoken {
  type: 'spoken';
  requestId: string;
  /** Browser-measured TTFB: performance.now() delta (ms) from turn_ready receipt to first PCM
   *  sample scheduled.  Omitted when first audio never played (TTS failure) or unknown. */
  firstAudioMs?: number;
}

export interface ClientMicOff {
  type: 'mic_off';
}

export interface ClientBye {
  type: 'bye';
}

export type ClientMessage = ClientHello | ClientSpoken | ClientMicOff | ClientBye;

// ── Server → Client cues ─────────────────────────────────────────────────────

export interface ServerReady {
  type: 'ready';
  phase: string;
  expects: Expects;
  language: string;
}

export interface ServerThinking {
  type: 'thinking';
}

export interface ServerTurnReady {
  type: 'turn_ready';
  requestId: string;
  transcript: string;
  utterance: WireUtterance;
  phase: string;
  isTerminal: boolean;
}

export interface ServerError {
  type: 'error';
  code: string;
  message: string;
}

export interface ServerClosing {
  type: 'closing';
  reason: 'terminal' | 'idle' | 'shutdown';
}

/** Discriminated union of all server→client JSON cues. */
export type VoiceCue = ServerReady | ServerThinking | ServerTurnReady | ServerError | ServerClosing;

// ── WebSocket close codes (4xxx = application-defined, mirrors ws_protocol.py) ─

export const WS_CLOSE = {
  BAD_PROTOCOL: 4400,
  UNAUTHORIZED: 4401,
  ORIGIN_DENIED: 4403,
  HANDSHAKE_TIMEOUT: 4408,
  NOT_IN_PROGRESS: 4409,
  AT_CAPACITY: 4503,
} as const;

// ── Audio frame constants (must match ws_protocol.py exactly) ────────────────

export const AUDIO = {
  SAMPLE_RATE: 16_000,
  FRAME_SAMPLES: 512,
  BYTES_PER_SAMPLE: 2,
  /** MUST be exactly 1024 bytes — server hard-rejects any other size. */
  FRAME_BYTES: 1024,
} as const;
