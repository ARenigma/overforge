"""Frozen WebSocket wire protocol for the Overforge voice service (P2-B.4).

SINGLE SOURCE OF TRUTH for the browser↔voice-service contract: message shapes, close codes, and the
binary audio frame format. The TypeScript mirror lives in frontend/lib/voice/types.ts and the E2E
harness asserts against these same names. All JSON field names on the wire are camelCase
(``requestId``, ``isTerminal``); audio is uplinked as little-endian Int16 PCM.

Flow:
    C→S {hello, token} → S verifies via POST /api/interviews/:id/state → S→C {ready, phase, expects}
    C→S binary frames (Int16 mono 16k, EXACTLY 1024 bytes = 512 samples) while expects=='voice'
    on EOT: S→C {thinking} → (STT+brain) → S→C {turn_ready, transcript, utterance, phase}
    C→S {spoken, requestId} when playback finishes → server arms the next turn
    terminal turn → S awaits {spoken}, sends {closing, terminal}, closes 1000.
"""

from __future__ import annotations

from typing import Literal, TypedDict

import numpy as np
import numpy.typing as npt

# ── Audio frame format (uplink, binary) ───────────────────────────────────────────
SAMPLE_RATE = 16_000
FRAME_SAMPLES = 512  # SilenceGatedEndpointer hard-requires EXACTLY 512 samples per frame
BYTES_PER_SAMPLE = 2  # little-endian Int16 PCM
FRAME_BYTES = FRAME_SAMPLES * BYTES_PER_SAMPLE  # 1024

Expects = Literal["voice", "text", "code"]

# ── WebSocket close codes (4xxx = application-defined) ─────────────────────────────
CLOSE_BAD_PROTOCOL = 4400  # malformed message / wrong binary frame length
CLOSE_UNAUTHORIZED = 4401  # invalid / expired token (/state 403/404)
CLOSE_ORIGIN_DENIED = 4403  # Origin header not the allowed frontend
CLOSE_HANDSHAKE_TIMEOUT = 4408  # no 'hello' in time / idle while listening
CLOSE_NOT_IN_PROGRESS = 4409  # interview not in progress / already terminal
CLOSE_AT_CAPACITY = 4503  # server at MAX_CONNECTIONS


# ── Client → Server ────────────────────────────────────────────────────────────────
class ClientHello(TypedDict):
    type: Literal["hello"]
    token: str


class ClientSpoken(TypedDict):
    type: Literal["spoken"]
    requestId: str


class ClientMute(TypedDict):
    type: Literal["mute"]
    muted: bool


class ClientMicOff(TypedDict):
    type: Literal["mic_off"]


class ClientBye(TypedDict):
    type: Literal["bye"]


# ── Server → Client ──────────────────────────────────────────────────────────────
class ServerReady(TypedDict):
    type: Literal["ready"]
    phase: str
    expects: Expects
    language: str


class ServerThinking(TypedDict):
    # Payload-less: fired pre-STT (before a turn requestId exists). The browser plays a filler and
    # cancels it via its own playback sequence when the next turn_ready arrives — no id needed.
    type: Literal["thinking"]


class WireUtterance(TypedDict):
    text: str
    expects: Expects


class ServerTurnReady(TypedDict):
    type: Literal["turn_ready"]
    requestId: str
    transcript: str
    utterance: WireUtterance
    phase: str
    isTerminal: bool


class ServerError(TypedDict):
    type: Literal["error"]
    code: str
    message: str


class ServerClosing(TypedDict):
    type: Literal["closing"]
    reason: Literal["terminal", "idle", "shutdown"]


class ServerBargeIn(TypedDict):
    """Sent server→client when the candidate interrupts the interviewer mid-speech.

    The browser must: stop all queued/in-flight TTS audio, bump its speak-sequence counter so
    late chunks are ignored, and re-arm the mic for the next candidate turn.  No ``requestId``
    is carried — the browser tracks the current turn via its own ``pendingVoiceRequestRef``.
    No ``{spoken}`` ack is required in response; the server resolves the speak wait internally.
    """

    type: Literal["barge_in"]


def decode_frame(buf: bytes) -> npt.NDArray[np.float32]:
    """Decode one uplink binary audio frame into a FRESH 512-sample float32 array in [-1, 1).

    The frame MUST be exactly ``FRAME_BYTES`` (1024) bytes of little-endian Int16 mono PCM;
    anything else raises ValueError and the caller closes with ``CLOSE_BAD_PROTOCOL``. A fresh array
    is returned every call (``astype`` copies — never a reused view into ``buf``).
    """
    if len(buf) != FRAME_BYTES:
        raise ValueError(f"expected {FRAME_BYTES}-byte audio frame, got {len(buf)}")
    samples: npt.NDArray[np.float32] = np.frombuffer(buf, dtype="<i2").astype(np.float32)
    samples /= 32768.0
    return samples
