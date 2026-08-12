"""Soniox ``stt-rt-v5`` SHADOW streamer for A/B STT comparison.

Runs in PARALLEL with the primary engine (local whisper or AssemblyAI) on the SAME mic
audio, producing an independent transcript per turn for offline cross-engine comparison.
It is a pure OBSERVER:

  - it NEVER drives turn detection (the primary owns end-of-turn),
  - it NEVER touches the live turn (log-only), and
  - it swallows ALL of its own errors — a Soniox outage degrades to "no shadow
    transcript", never a broken interview.

Because a shadow must never add latency to the candidate's turn, sending is fully
decoupled: :meth:`feed` only enqueues (non-blocking, bounded, drop-oldest) and a private
sender task drains the queue to the socket. A slow/stalled Soniox connection therefore
cannot back-pressure the primary hot path.

Wire format (verified against ``eval/soniox_stream_bench.py``):
  - WS ``wss://stt-rt.soniox.com/transcribe-websocket``.
  - First frame: JSON config ``{api_key, model, audio_format:"s16le", sample_rate,
    num_channels, language_hints, [context:{terms}]}``.
  - Then binary PCM16 frames; the empty-string frame signals end-of-audio.
  - Server pushes ``{tokens:[{text, is_final}], finished?}``; we accumulate the ``is_final``
    token text (Soniox tokens carry their own leading spaces, so join with "").

Lifecycle (single asyncio loop, owned by :class:`~session.VoiceSession`):
  - ``await start()``     connect + send config + spawn the recv/sender loops (best-effort).
  - ``await feed(f32)``   float32→PCM16 → enqueue. No-op once failed/closed.
  - ``reset()``           begin a new turn window (clear accumulator + window clock).
  - ``take_snapshot()``   consume the current window's transcript + latency.
  - ``await close()``     flush + EOS + close (idempotent, exception-safe).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from contracts import AudioArray, ShadowSnapshot

logger = logging.getLogger(__name__)

_DEFAULT_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket"
_SR = 16_000

# Batch binary sends to ≥50 ms of PCM16 @ 16 kHz (= 1600 bytes) — mic frames arrive as
# 32 ms / 512-sample float32 chunks, so this coalesces ~2 frames per send.
_MIN_SEND_BYTES = 1600

# Bounded send queue: enqueue is non-blocking and drops the OLDEST chunk when full so a
# stalled socket can never grow memory without bound. ~30 s of PCM16 @ 16 kHz in ~1600-byte
# chunks ≈ 600 chunks; round up.
_SEND_QUEUE_MAX = 1024

_OPEN_TIMEOUT_S = 10.0
_CLOSE_TIMEOUT_S = 3.0

#: Sentinel enqueued by :meth:`close` to tell the sender to emit Soniox's end-of-audio frame.
_EOS = object()

#: Sentinel enqueued by :meth:`flush_turn` → the sender emits a mid-stream ``{"type":"finalize"}``
#: control frame, flushing pending tokens to ``is_final`` WITHOUT ending the session.
_FINALIZE = object()

#: Control tokens Soniox emits (finalize / endpoint sentinels) — not real transcript, so skip them.
_CONTROL_TOKENS = frozenset({"<fin>", "<end>"})


def _f32_to_pcm16(pcm_f32: AudioArray) -> bytes:
    """Convert float32 [-1, 1] mono PCM to little-endian int16 bytes (``pcm_s16le``)."""
    clipped = np.clip(np.asarray(pcm_f32, dtype=np.float32), -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


@dataclass(frozen=True)
class SonioxConfig:
    """Connection + biasing config for one Soniox ``stt-rt-v5`` shadow session."""

    api_key: str
    model: str = "stt-rt-v5"
    sample_rate: int = _SR
    num_channels: int = 1
    language_hints: tuple[str, ...] = ("en",)
    #: Domain terms for context biasing (shared with the primary via ``STT_KEYTERMS``).
    keyterms: tuple[str, ...] = ()
    #: Soniox's OWN semantic endpoint detection (default ON for the A/B): it emits an ``<end>``
    #: token where IT thinks the turn ended (pauses/intonation/context, not pure silence). We
    #: capture that timing to compare Soniox's turn detection vs the AAI primary's — log-only.
    enable_endpoint_detection: bool = True
    #: Speaker diarization (default ON). When True, ``enable_speaker_diarization`` is sent in the
    #: config frame so Soniox returns a ``speaker`` label on each token (e.g. "A", "B"). We use
    #: this ONLY to count distinct speakers and measure non-primary speaker time per turn — we
    #: NEVER store or compare speaker labels across sessions (that would be a biometric voiceprint).
    #: Disable via ``STT_SHADOW_DIARIZE=0`` if the provider API changes or costs increase.
    enable_diarization: bool = True
    url: str = _DEFAULT_WS_URL

    @classmethod
    def from_env(
        cls, env: Mapping[str, str] | None = None, *, language: str = "en"
    ) -> SonioxConfig:
        """Build from the environment.

        - ``SONIOX_API_KEY``           raw API key (required for the soniox shadow).
        - ``STT_KEYTERMS``             comma-separated domain terms → ``context.terms`` (shared with
          the primary engine so both are biased identically — a fair comparison).
        - ``SONIOX_MODEL``             model override (default ``stt-rt-v5``).
        - ``SONIOX_ENDPOINT_DETECTION`` set to ``0`` to disable Soniox's semantic endpointing
          (default on — it's how we A/B Soniox's turn detection against the primary).
        - ``STT_SHADOW_DIARIZE``       set to ``0`` to disable speaker diarization on the shadow
          (default on — advisory second-voice detection without identity/voiceprint storage).
        """
        e: Mapping[str, str] = env if env is not None else os.environ
        keyterms = tuple(t.strip() for t in e.get("STT_KEYTERMS", "").split(",") if t.strip())
        return cls(
            api_key=e.get("SONIOX_API_KEY", ""),
            model=e.get("SONIOX_MODEL", "stt-rt-v5"),
            keyterms=keyterms,
            enable_endpoint_detection=e.get("SONIOX_ENDPOINT_DETECTION", "1") != "0",
            enable_diarization=e.get("STT_SHADOW_DIARIZE", "1") != "0",
            language_hints=(language,),
        )

    def config_message(self) -> dict[str, object]:
        """The opening JSON config frame Soniox expects before any audio."""
        msg: dict[str, object] = {
            "api_key": self.api_key,
            "model": self.model,
            "audio_format": "s16le",
            "sample_rate": self.sample_rate,
            "num_channels": self.num_channels,
            "language_hints": list(self.language_hints),
        }
        if self.keyterms:
            msg["context"] = {"terms": list(self.keyterms)}
        if self.enable_endpoint_detection:
            msg["enable_endpoint_detection"] = True
        if self.enable_diarization:
            msg["enable_speaker_diarization"] = True
        return msg


class _WsLike(Protocol):
    """The slice of a ``websockets`` client connection the shadow uses (fakeable in tests)."""

    async def send(self, data: bytes | str) -> None: ...
    async def recv(self) -> bytes | str: ...
    async def close(self) -> None: ...


#: Opens one WS connection for a fully-formed URL. Injected by tests; the default connects
#: with ``websockets`` (Soniox authenticates via the config frame, not a header).
ConnectFn = Callable[[str], Awaitable[_WsLike]]


class SonioxShadow:
    """One Soniox ``stt-rt-v5`` shadow session, living exactly as long as its VoiceSession.

    API (all asyncio, single event loop):
      - ``await start()``    connect + send config + spawn recv/sender loops (best-effort;
        any failure just leaves the shadow disabled, ``failed=True``).
      - ``await feed(f32)``  float32→PCM16 → enqueue (non-blocking, drop-oldest when full).
      - ``reset()``          open a fresh per-turn window (clear accumulator + window clock).
      - ``take_snapshot()``  consume this window's ShadowSnapshot (transcript + latency +
        Soniox's own semantic endpoint timing/count).
      - ``await close()``    flush + Soniox EOS + close (idempotent, exception-safe).
      - ``failed``           True once the connection is permanently unusable.
    """

    engine = "soniox"

    def __init__(
        self,
        config: SonioxConfig,
        *,
        connect: ConnectFn | None = None,
        min_send_bytes: int = _MIN_SEND_BYTES,
    ) -> None:
        self._config = config
        self._connect: ConnectFn = connect if connect is not None else self._default_connect
        self._min_send_bytes = min_send_bytes

        self.failed = False
        self._ws: _WsLike | None = None
        self._started = False
        self._closed = False
        self._recv_task: asyncio.Task[None] | None = None
        self._sender_task: asyncio.Task[None] | None = None
        self._send_q: asyncio.Queue[object] = asyncio.Queue(maxsize=_SEND_QUEUE_MAX)

        # Per-turn window state (protected by the single event loop; snapshot+reset are sync).
        self._finals: list[str] = []
        self._window_start: float | None = None
        self._last_final_t: float | None = None
        # perf_counter timestamp when the _FINALIZE sentinel was physically SENT to the Soniox
        # socket (set in the sender loop, not at enqueue time). Used to compute finalize_lag_ms =
        # (last_final_t - _flush_sent_t), which measures Soniox's round-trip response time to the
        # mid-stream finalize message. Distinct from stt_ms (window_start → last_final_t), which
        # measures the total window duration and is always ~utterance_duration.
        self._flush_sent_t: float | None = None
        # perf_counter timestamps of Soniox's own semantic endpoints (<end>) in this window.
        self._endpoints: list[float] = []
        # Speaker diarization — advisory only, never biometric identity.
        # Session-level: cumulative speech time (ms) per speaker label across ALL turns.
        # "Primary" speaker = the label with the most accumulated ms in _session_speaker_ms.
        # This is a positional label (e.g. "A"/"B"), NOT a named or enrolled voiceprint —
        # we use it only to distinguish which mic participant is dominant across the session
        # so that a brief secondary voice in one turn is attributed correctly.
        self._session_speaker_ms: dict[str, float] = {}
        # Per-turn: per-label speech time (ms) within the current listening window only.
        # Cleared on reset() and consumed+cleared by take_snapshot().
        self._turn_speaker_ms: dict[str, float] = {}

    # ── lifecycle ────────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Connect, send the config frame, and spawn the recv + sender loops.

        Best-effort: any failure logs once, flips :attr:`failed`, and returns — the shadow
        is simply absent for the rest of the session; the primary is untouched.
        """
        if self._started or self._closed:
            return
        self._started = True
        if not self._config.api_key:
            logger.error("Soniox shadow: SONIOX_API_KEY unset — shadow disabled.")
            self.failed = True
            return
        try:
            self._ws = await self._connect(self._config.url)
            await self._ws.send(json.dumps(self._config.config_message()))
        except Exception:
            logger.exception("Soniox shadow failed to start — shadow disabled.")
            self.failed = True
            self._ws = None
            return
        self._recv_task = asyncio.create_task(self._recv_loop(), name="soniox-shadow-recv")
        self._sender_task = asyncio.create_task(self._sender_loop(), name="soniox-shadow-send")

    async def feed(self, pcm_f32: AudioArray) -> None:
        """Enqueue one frame's PCM for the shadow. Non-blocking; drops oldest when the queue
        is full so a stalled socket can never back-pressure the primary hot path."""
        if self.failed or self._closed or self._ws is None:
            return
        if self._window_start is None:
            self._window_start = time.perf_counter()
        chunk = _f32_to_pcm16(pcm_f32)
        try:
            self._send_q.put_nowait(chunk)
        except asyncio.QueueFull:
            # Drop the oldest chunk to make room — shadow audio is disposable.
            try:
                self._send_q.get_nowait()
                self._send_q.put_nowait(chunk)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass

    async def flush_turn(self) -> None:
        """Finalize all audio streamed so far MID-STREAM (the session stays open) so the current
        turn's tail tokens become ``is_final`` before the next :meth:`take_snapshot`. Without this,
        Soniox leaves the tail non-final until the next window's audio arrives, so a snapshot taken
        at the primary's end-of-turn misses the tail (it bleeds into the next turn). Best-effort;
        never raises — the shadow is an observer."""
        if self.failed or self._closed or self._ws is None:
            return
        try:
            self._send_q.put_nowait(_FINALIZE)
        except asyncio.QueueFull:
            pass

    def reset(self) -> None:
        """Begin a new per-turn listening window: clear the accumulator + window clock.

        Called by :class:`~session.VoiceSession` on every re-arm so the shadow window aligns
        to the primary's listening window. Session-level speaker totals are retained across
        resets — they accumulate across all turns to keep the primary-speaker determination stable.
        """
        self._finals.clear()
        self._window_start = None
        self._last_final_t = None
        self._flush_sent_t = None
        self._endpoints.clear()
        self._turn_speaker_ms.clear()

    def take_snapshot(self) -> ShadowSnapshot:
        """Consume the current window's shadow observation (transcript + latency + endpoints +
        speaker diarization).

        ``endpoint_ms`` is when Soniox FIRST decided the turn ended (its own semantic EOT),
        relative to the window start — compare it against when the primary actually cut the
        turn. ``speaker_count`` is the number of distinct speaker labels observed in this turn's
        window (None when the provider returned no labels); ``non_primary_speaker_ms`` is the
        total ms attributable to non-primary speakers (0.0 when only one speaker was heard).
        Clears the per-turn accumulators so the next window starts clean even before
        :meth:`reset`. Session-level speaker totals are never cleared here.
        """
        text = "".join(self._finals).strip()
        latency_ms: float | None = None
        if self._window_start is not None and self._last_final_t is not None:
            latency_ms = max(0.0, (self._last_final_t - self._window_start) * 1000.0)
        endpoint_ms: float | None = None
        if self._window_start is not None and self._endpoints:
            endpoint_ms = max(0.0, (self._endpoints[0] - self._window_start) * 1000.0)
        endpoint_count = len(self._endpoints)
        # finalize_lag_ms = time from when {"type":"finalize"} was physically SENT to Soniox
        # to when the last is_final token arrived back. This is Soniox's response latency to the
        # mid-stream flush command — a small number (~50–300 ms). Distinct from stt_ms, which
        # measures window_start → last_final_t and is always approximately equal to the utterance
        # duration (not a useful latency metric). Both are recorded: stt_ms for total-window
        # analysis; finalize_lag_ms for provider round-trip comparison.
        finalize_lag_ms: float | None = None
        if self._flush_sent_t is not None and self._last_final_t is not None:
            finalize_lag_ms = max(0.0, (self._last_final_t - self._flush_sent_t) * 1000.0)
        self._finals.clear()
        self._last_final_t = None
        self._flush_sent_t = None
        self._endpoints.clear()

        # Diarization: derive speaker_count + non-primary ms from this turn's window.
        speaker_count: int | None = None
        non_primary_speaker_ms: float | None = None
        if self._turn_speaker_ms:
            speaker_count = len(self._turn_speaker_ms)
            # Primary = the session-dominant speaker label (by total ms across all turns so far).
            # This is a positional label, NOT a named voiceprint — see class docstring.
            primary = max(self._session_speaker_ms, key=lambda k: self._session_speaker_ms[k])
            non_primary_speaker_ms = sum(
                ms for label, ms in self._turn_speaker_ms.items() if label != primary
            )
        self._turn_speaker_ms.clear()

        return ShadowSnapshot(
            transcript=text,
            stt_ms=latency_ms,
            endpoint_ms=endpoint_ms,
            endpoint_count=endpoint_count,
            finalize_lag_ms=finalize_lag_ms,
            speaker_count=speaker_count,
            non_primary_speaker_ms=non_primary_speaker_ms,
        )

    async def close(self) -> None:
        """Flush + send Soniox's end-of-audio frame + close the socket. Idempotent."""
        if self._closed:
            return
        self._closed = True
        try:
            self._send_q.put_nowait(_EOS)
        except asyncio.QueueFull:
            pass
        sender = self._sender_task
        if sender is not None:
            try:
                await asyncio.wait_for(asyncio.shield(sender), timeout=_CLOSE_TIMEOUT_S)
            except Exception:  # noqa: BLE001 — teardown is best-effort (incl. TimeoutError)
                # The EOS may have been dropped (full queue) → the sender is blocked on get()
                # forever. Cancel it explicitly so it can never leak past teardown.
                sender.cancel()
        if self._recv_task is not None:
            self._recv_task.cancel()
        ws = self._ws
        self._ws = None
        if ws is not None:
            try:
                await asyncio.wait_for(ws.close(), timeout=_CLOSE_TIMEOUT_S)
            except Exception:  # noqa: BLE001 — teardown is best-effort (incl. TimeoutError)
                pass

    # ── internal loops ───────────────────────────────────────────────────────────

    async def _sender_loop(self) -> None:
        """Drain the send queue to the socket, coalescing to ≥ ``_min_send_bytes`` per send."""
        buf = bytearray()
        try:
            while True:
                item = await self._send_q.get()
                if item is _EOS:
                    if buf and self._ws is not None:
                        await self._ws.send(bytes(buf))
                        buf.clear()
                    if self._ws is not None:
                        await self._ws.send("")  # Soniox end-of-audio
                    return
                if item is _FINALIZE:
                    # Flush buffered audio FIRST (so finalize covers it), then the control frame.
                    if buf and self._ws is not None:
                        await self._ws.send(bytes(buf))
                        buf.clear()
                    if self._ws is not None:
                        # Timestamp the SEND (not the enqueue) so finalize_lag_ms measures
                        # the true round-trip: socket send → is_final tokens arrive.
                        self._flush_sent_t = time.perf_counter()
                        await self._ws.send('{"type": "finalize"}')  # flush → is_final; stays open
                    continue
                buf.extend(item)  # type: ignore[arg-type]
                if len(buf) >= self._min_send_bytes and self._ws is not None:
                    await self._ws.send(bytes(buf))
                    buf.clear()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Soniox shadow sender stopped (connection lost) — shadow disabled.")
            self.failed = True

    async def _recv_loop(self) -> None:
        """Accumulate final token text; stamp the last-final + semantic-endpoint (<end>) clocks."""
        ws = self._ws
        if ws is None:
            return
        try:
            while True:
                raw = await ws.recv()
                msg = json.loads(raw)
                got_final = False
                for tok in msg.get("tokens", []):
                    text = tok.get("text", "")
                    if text == "<end>":
                        # Soniox's OWN semantic endpoint (its EOT decision) — timestamp it for the
                        # A/B against the primary's cut; never treat it as transcript.
                        self._endpoints.append(time.perf_counter())
                        continue
                    if not tok.get("is_final"):
                        continue
                    if text in _CONTROL_TOKENS:
                        continue  # <fin> finalize sentinel — control token, not transcript
                    self._finals.append(text)
                    got_final = True
                    # Speaker diarization (advisory). Accumulate per-label speech time using the
                    # token's start_time/end_time (seconds from audio start, per Soniox stt-rt-v5
                    # API). When speaker or timing fields are absent, degrade silently — speaker_count
                    # stays None for this turn rather than raising.
                    if self._config.enable_diarization:
                        speaker = tok.get("speaker")
                        if isinstance(speaker, str) and speaker:
                            start = tok.get("start_time")
                            end = tok.get("end_time")
                            dur_ms = (
                                max(0.0, (float(end) - float(start)) * 1000.0)
                                if isinstance(start, (int, float))
                                and isinstance(end, (int, float))
                                else 0.0
                            )
                            self._turn_speaker_ms[speaker] = (
                                self._turn_speaker_ms.get(speaker, 0.0) + dur_ms
                            )
                            self._session_speaker_ms[speaker] = (
                                self._session_speaker_ms.get(speaker, 0.0) + dur_ms
                            )
                if got_final:
                    self._last_final_t = time.perf_counter()
                if msg.get("finished"):
                    return
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Soniox shadow receiver stopped (connection lost) — shadow disabled.")
            self.failed = True

    async def _default_connect(self, url: str) -> _WsLike:
        import websockets  # noqa: PLC0415 — deferred so tests with a fake never import it

        conn: _WsLike = await websockets.connect(
            url, max_size=None, open_timeout=_OPEN_TIMEOUT_S
        )
        return conn
