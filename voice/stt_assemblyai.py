"""AssemblyAI v3 real-time streaming STT + built-in turn detection (P1-A, flag-gated).

When ``STT_PROVIDER=assemblyai`` the voice session forwards mic frames here instead of the
local Silero + Smart-Turn + whisper pipeline (which false-cuts interview thinking-pauses).
AssemblyAI's Universal-Streaming turn model is semantic — it waits through mid-answer pauses
and only commits end-of-turn when the utterance is actually complete — and the transcript
rides ON the end-of-turn event, so the post-EOT STT latency is ~0.

Wire protocol (verified against the v3 API reference, 2026-07):
  - Endpoint    ``wss://streaming.assemblyai.com/v3/ws`` + query params.
  - Auth        ``Authorization: <raw api key>`` header — NO ``Bearer`` prefix.
  - Audio       binary WS frames of PCM16 mono; sends must be 50–1000 ms (we batch ≥50 ms).
  - Server JSON ``{"type":"Begin"}``, ``{"type":"Turn", transcript, end_of_turn,
    turn_is_formatted, turn_order, ...}``, ``{"type":"Termination"}``.
  - Client JSON ``{"type":"Terminate"}`` to end, ``{"type":"KeepAlive"}`` to hold an idle
    socket open (the mic is gated between turns, so the socket idles while the interviewer
    speaks — it must NOT be closed between turns).

Query params used (names verified against the v3 streaming API spec):
  - ``speech_model``       tier; default ``universal-3-5-pro`` (plain ``universal-3-pro`` is
                           rejected on v3). Turn detection on this tier is punctuation-based;
                           the ``universal-streaming-*`` tiers are confidence-based.
  - ``format_turns=true``  deliver a punctuated/formatted final. On ``universal-3-5-pro`` the
                           final Turn is already formatted; on ``universal-streaming-*`` an
                           unformatted final arrives first and the formatted twin follows
                           immediately (we hold the unformatted one for a short grace window).
  - ``end_of_turn_confidence_threshold``  (float 0–1, default 0.4; confidence-based tiers
                           only) — how sure the semantic model must be before committing EOT.
  - ``min_turn_silence``   (ms) — minimum trailing silence before a confident EOT may fire.
                           Generous 800 ms default: interview clause-pauses stay uncut.
  - ``max_turn_silence``   (ms) — acoustic backstop: silence alone force-commits the turn.
                           Generous 3000 ms default (matches the local endpointer's backstop)
                           so a candidate thinking mid-answer is not cut off.
  - ``keyterms_prompt``    JSON-encoded array of domain terms (max 100, ≤50 chars each).

BILLING TRAP: an unterminated v3 session auto-closes only after 3 HOURS and bills the full
duration. :meth:`AssemblyAIStreamer.close` therefore always sends ``Terminate`` + closes the
socket, is idempotent and exception-safe, and MUST be reached from every session-teardown
path (``VoiceSession.aclose``/``close`` guarantee this).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import urlencode

import numpy as np

from contracts import AudioArray, TurnEvent

logger = logging.getLogger(__name__)

_DEFAULT_WS_URL = "wss://streaming.assemblyai.com/v3/ws"
_SR = 16_000

# AAI wants 50–1000 ms per binary send; 50 ms of 16 kHz PCM16 mono = 800 samples = 1600 bytes.
# Mic frames arrive as 32 ms/512-sample float32 chunks, so sends batch every 2 frames (64 ms).
_MIN_SEND_BYTES = 1600

# While disconnected (mid-reconnect) audio keeps buffering so speech isn't lost; cap the buffer
# (drop oldest) so a long outage can never grow memory without bound. 30 s of PCM16 @ 16 kHz.
_SEND_BUFFER_CAP_BYTES = 30 * _SR * 2

# On the universal-streaming tiers the formatted final "immediately follows" the unformatted
# one; hold an unformatted final at most this long for its formatted twin. On the default
# universal-3-5-pro tier the final is already formatted, so this path never adds latency.
_FORMAT_GRACE_S = 1.0

_KEEPALIVE_INTERVAL_S = 15.0
_RECONNECT_BACKOFF_S = 0.75
_OPEN_TIMEOUT_S = 10.0
_TERMINATE_TIMEOUT_S = 3.0

# Default transcription prompt (universal-3-5-pro / u3-pro only). On u3-pro, end-of-turn is
# PUNCTUATION-driven: the model committing a lone filler as "Um." (with a terminal period) is what
# fires a premature end-of-turn (observed in prod). This is AssemblyAI's own recommended fix —
# rule 5 makes the model withhold terminal punctuation after a filler, so a thinking pause after
# "um"/"uh" does NOT commit a turn. MUTUALLY EXCLUSIVE with keyterms_prompt (AAI rejects both).
_DEFAULT_PROMPT = (
    "Transcribe verbatim. Rules:\n"
    "1) Always include punctuation in output.\n"
    "2) Use period/question mark ONLY for complete sentences.\n"
    "3) Use comma for mid-sentence pauses.\n"
    "4) Use no punctuation for incomplete trailing speech.\n"
    "5) Filler words (um, uh, so, like) indicate the speaker will continue."
)


def _f32_to_pcm16(pcm_f32: AudioArray) -> bytes:
    """Convert float32 [-1, 1] mono PCM to little-endian int16 bytes (``pcm_s16le``)."""
    clipped = np.clip(np.asarray(pcm_f32, dtype=np.float32), -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


@dataclass(frozen=True)
class AssemblyAIConfig:
    """Connection + turn-detection tuning for one streaming session.

    Defaults are GENEROUS for interview thinking-pauses — see the module docstring for what
    each wire param does. All fields map 1:1 onto verified v3 query params.
    """

    api_key: str
    speech_model: str = "universal-3-5-pro"
    sample_rate: int = _SR
    format_turns: bool = True
    keyterms: tuple[str, ...] = ()
    #: → prompt (u3-pro only): steers punctuation, which IS turn detection on u3-pro. The default
    #: filler-continuation prompt stops a lone "um"/"uh" + thinking pause from getting terminal
    #: punctuation (→ no premature end-of-turn). MUTUALLY EXCLUSIVE with keyterms_prompt; set to ""
    #: to disable (falls back to AAI's built-in default + keyterms).
    prompt: str = _DEFAULT_PROMPT
    #: → end_of_turn_confidence_threshold (confidence-based tiers only; harmless otherwise).
    end_of_turn_confidence: float = 0.4
    #: → min_turn_silence (ms). 800 ms ≈ the validated local hold gate — clause pauses uncut.
    min_turn_silence_ms: int = 800
    #: → max_turn_silence (ms). 3000 ms acoustic backstop — thinking pauses are not cut off.
    max_turn_silence_ms: int = 3000
    language: str = "en"
    url: str = _DEFAULT_WS_URL

    @classmethod
    def from_env(
        cls, env: Mapping[str, str] | None = None, *, language: str = "en"
    ) -> AssemblyAIConfig:
        """Build from the environment. Env vars (all optional except the key):

        - ``ASSEMBLYAI_API_KEY``          raw API key (required for the assemblyai provider).
        - ``STT_KEYTERMS``                comma-separated domain terms → ``keyterms_prompt`` (only
                                          used when ``STT_PROMPT`` is empty — the two are mutually
                                          exclusive on u3-pro).
        - ``STT_PROMPT``                  transcription prompt (u3-pro) steering punctuation/turns;
                                          defaults to the filler-continuation prompt. Set to "" to
                                          disable and fall back to AAI's built-in default.
        - ``STT_SPEECH_MODEL``            tier override (default ``universal-3-5-pro``).
        - ``STT_EOT_CONFIDENCE``          → ``end_of_turn_confidence_threshold``.
        - ``STT_MIN_TURN_SILENCE_MS``     → ``min_turn_silence``.
        - ``STT_MAX_TURN_SILENCE_MS``     → ``max_turn_silence``.
        """
        e: Mapping[str, str] = env if env is not None else os.environ
        keyterms = tuple(t.strip() for t in e.get("STT_KEYTERMS", "").split(",") if t.strip())
        return cls(
            api_key=e.get("ASSEMBLYAI_API_KEY", ""),
            speech_model=e.get("STT_SPEECH_MODEL", "universal-3-5-pro"),
            keyterms=keyterms,
            prompt=e.get("STT_PROMPT", _DEFAULT_PROMPT),
            end_of_turn_confidence=float(e.get("STT_EOT_CONFIDENCE", "0.4")),
            min_turn_silence_ms=int(e.get("STT_MIN_TURN_SILENCE_MS", "800")),
            max_turn_silence_ms=int(e.get("STT_MAX_TURN_SILENCE_MS", "3000")),
            language=language,
        )

    def query_params(self) -> dict[str, str]:
        """The verified v3 query params for this config (see module docstring)."""
        params: dict[str, str] = {
            "sample_rate": str(self.sample_rate),
            "encoding": "pcm_s16le",
            "speech_model": self.speech_model,
            "format_turns": "true" if self.format_turns else "false",
            "end_of_turn_confidence_threshold": f"{self.end_of_turn_confidence:g}",
            "min_turn_silence": str(self.min_turn_silence_ms),
            "max_turn_silence": str(self.max_turn_silence_ms),
        }
        # `prompt` and `keyterms_prompt` are MUTUALLY EXCLUSIVE on u3-pro (AAI rejects a request
        # that sends both), so the prompt wins when set; keyterms only apply when no prompt.
        if self.prompt:
            params["prompt"] = self.prompt
        elif self.keyterms:
            params["keyterms_prompt"] = json.dumps(list(self.keyterms))
        if self.language and self.language != "en":
            # universal-3-5-pro / universal-streaming-multilingual accept language_codes;
            # omitted for English so the english-only tier stays usable unmodified.
            params["language_codes"] = json.dumps([self.language])
        return params

    def ws_url(self) -> str:
        return f"{self.url}?{urlencode(self.query_params())}"


class _WsLike(Protocol):
    """The slice of a ``websockets`` client connection the streamer uses (fakeable in tests)."""

    async def send(self, data: bytes | str) -> None: ...
    async def recv(self) -> bytes | str: ...
    async def close(self) -> None: ...


#: Opens one WS connection for a fully-formed URL. Injected by tests; the default adds the
#: raw-key Authorization header and connects with ``websockets``.
ConnectFn = Callable[[str], Awaitable[_WsLike]]


@dataclass
class _PendingFinal:
    """An unformatted end-of-turn transcript held for its formatted twin (grace window)."""

    turn_order: int
    transcript: str
    grace_task: asyncio.Task[None] = field(repr=False, kw_only=True)


class AssemblyAIStreamer:
    """One AssemblyAI v3 streaming session, living exactly as long as its VoiceSession.

    API (all asyncio, single event loop):
      - ``await start()``   connect (one retry with backoff) + spawn the receive loop.
      - ``await feed(f32)`` convert float32→PCM16 and batch-send (≥50 ms per send). While
        disconnected the audio buffers (bounded) and flushes after reconnect.
      - ``events``          asyncio.Queue of :class:`TurnEvent` — one per committed turn
        (formatted final preferred), plus a ``fatal`` poison pill on permanent failure.
      - ``await close()``   ALWAYS send Terminate + close (idempotent, exception-safe) —
        see the billing trap in the module docstring.
      - ``failed``          True once the connection is permanently lost (after the single
        reconnect attempt) — the session falls back to the local whisper path.
    """

    def __init__(
        self,
        config: AssemblyAIConfig,
        *,
        connect: ConnectFn | None = None,
        format_grace_s: float = _FORMAT_GRACE_S,
        reconnect_backoff_s: float = _RECONNECT_BACKOFF_S,
    ) -> None:
        self._config = config
        self._connect: ConnectFn = connect if connect is not None else self._default_connect
        self._format_grace_s = format_grace_s
        self._reconnect_backoff_s = reconnect_backoff_s

        self.events: asyncio.Queue[TurnEvent] = asyncio.Queue()
        # Set on ANY Turn message (partial or final) so the session can reset its idle probe
        # timer without needing partials to flow through the events queue.  The session calls
        # clear() on each re-arm and the streamer calls set() on every Turn receipt.
        self.speech_activity: asyncio.Event = asyncio.Event()
        self.failed = False

        self._ws: _WsLike | None = None
        self._recv_task: asyncio.Task[None] | None = None
        self._keepalive_task: asyncio.Task[None] | None = None
        self._close_task: asyncio.Task[None] | None = None
        self._send_buf = bytearray()
        self._started = False
        self._closed = False
        self._reconnected_once = False
        self._pending: _PendingFinal | None = None
        self._last_emitted_order = -1
        self._last_send_t = 0.0

    # ── lifecycle ────────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Connect and spawn the receive + keepalive loops. Idempotent.

        One retry with backoff on the initial connect; if both attempts fail this marks the
        streamer ``failed`` (enqueuing the fatal poison pill) and re-raises so the caller can
        log — the session then falls back to the local whisper path.
        """
        if self._started or self._closed:
            return
        self._started = True
        try:
            await self._open()
        except Exception:
            logger.exception("AssemblyAI connect failed — retrying once …")
            await asyncio.sleep(self._reconnect_backoff_s)
            try:
                await self._open()
            except Exception:
                self._mark_failed("initial connect failed twice")
                raise
        self._recv_task = asyncio.create_task(self._recv_loop(), name="aai-recv")
        self._keepalive_task = asyncio.create_task(self._keepalive_loop(), name="aai-keepalive")

    async def close(self) -> None:
        """Terminate + close the socket and stop all tasks. Idempotent, exception-safe.

        ALWAYS sends ``{"type": "Terminate"}`` first when a socket exists: an unterminated v3
        session auto-closes only after 3 h and bills the full duration. Every failure here is
        swallowed (logged) — teardown must never raise into the session.
        """
        if self._closed:
            return
        self._closed = True  # recv loop checks this and will not treat our close as a drop
        self._cancel_grace()
        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
        ws, self._ws = self._ws, None
        if ws is not None:
            try:
                await asyncio.wait_for(
                    ws.send(json.dumps({"type": "Terminate"})), timeout=_TERMINATE_TIMEOUT_S
                )
            except Exception:
                logger.warning("AssemblyAI Terminate send failed (socket likely already dead).")
            try:
                await asyncio.wait_for(ws.close(), timeout=_TERMINATE_TIMEOUT_S)
            except Exception:
                logger.warning("AssemblyAI socket close failed — continuing teardown.")
        recv = self._recv_task
        if recv is not None and recv is not asyncio.current_task():
            recv.cancel()
            try:
                await recv
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("AssemblyAI recv loop raised during teardown — ignored.")

    # ── audio ────────────────────────────────────────────────────────────────────

    async def feed(self, pcm_f32: AudioArray) -> None:
        """Buffer one float32 frame and send PCM16 once ≥50 ms has accumulated.

        Never raises: a send failure re-buffers the chunk and leaves reconnection to the
        receive loop (which owns the socket lifecycle).
        """
        if self._closed or self.failed:
            return
        self._send_buf += _f32_to_pcm16(pcm_f32)
        if len(self._send_buf) > _SEND_BUFFER_CAP_BYTES:
            del self._send_buf[: len(self._send_buf) - _SEND_BUFFER_CAP_BYTES]
        ws = self._ws
        if ws is None or len(self._send_buf) < _MIN_SEND_BYTES:
            return  # still batching, or mid-reconnect (buffer flushes on the next send)
        chunk = bytes(self._send_buf)
        self._send_buf.clear()
        try:
            await ws.send(chunk)
            self._last_send_t = time.monotonic()
        except Exception:
            logger.warning("AssemblyAI audio send failed — buffering until reconnect.")
            self._send_buf[:0] = chunk  # put the audio back; recv loop handles the drop

    # ── receive / turn events ────────────────────────────────────────────────────

    async def _recv_loop(self) -> None:
        while not self._closed:
            ws = self._ws
            if ws is None:
                return
            try:
                raw = await ws.recv()
            except asyncio.CancelledError:
                raise
            except Exception:
                if self._closed:
                    return
                if not await self._try_reconnect():
                    return
                continue
            try:
                self._handle_message(raw)
            except Exception:
                logger.exception("AssemblyAI message handling failed — message dropped.")

    def _handle_message(self, raw: bytes | str) -> None:
        if isinstance(raw, (bytes, bytearray)):
            return  # v3 server messages are JSON text
        try:
            msg = json.loads(raw)
        except ValueError:
            logger.warning("AssemblyAI sent non-JSON text — ignored.")
            return
        if not isinstance(msg, dict):
            return
        mtype = msg.get("type")
        if mtype == "Begin":
            logger.info("AssemblyAI session began (id=%s).", msg.get("id"))
            return
        if mtype == "Termination":
            logger.info(
                "AssemblyAI session terminated (audio=%ss).", msg.get("audio_duration_seconds")
            )
            return
        if mtype != "Turn":
            return

        transcript = str(msg.get("transcript") or "")
        end_of_turn = bool(msg.get("end_of_turn"))
        formatted = bool(msg.get("turn_is_formatted"))
        order = int(msg.get("turn_order") or 0)
        # Signal any candidate-silence idle watchdog that speech has started, regardless of
        # whether this is a partial or a final — the probe must be suppressed even on early
        # partials that won't commit for another few seconds.
        self.speech_activity.set()
        if not end_of_turn:
            return  # partials are unused (the session only acts on committed turns)
        if order <= self._last_emitted_order:
            return  # late twin of an already-emitted turn (e.g. formatted after grace fired)

        if formatted:
            # The preferred final. Supersedes a pending unformatted twin of the same turn.
            if self._pending is not None:
                if self._pending.turn_order != order:
                    self._flush_pending()  # different (older) turn — emit it, don't lose it
                else:
                    self._cancel_grace()
            self._emit(order, transcript, formatted=True)
            return

        # Unformatted final: with format_turns=true the formatted twin follows immediately on
        # the universal-streaming tiers — hold it for a short grace window, emit whichever
        # arrives. (On universal-3-5-pro the final is already formatted; this path is a
        # defensive fallback only.)
        self._flush_pending()  # an older pending final must never be silently dropped
        grace = asyncio.create_task(self._grace(order), name=f"aai-format-grace-{order}")
        self._pending = _PendingFinal(turn_order=order, transcript=transcript, grace_task=grace)

    async def _grace(self, order: int) -> None:
        await asyncio.sleep(self._format_grace_s)
        pending = self._pending
        if pending is not None and pending.turn_order == order:
            self._pending = None
            self._emit(order, pending.transcript, formatted=False)

    def _flush_pending(self) -> None:
        """Emit a held unformatted final immediately (its formatted twin never showed)."""
        pending = self._pending
        if pending is None:
            return
        self._cancel_grace()
        self._emit(pending.turn_order, pending.transcript, formatted=False)

    def _cancel_grace(self) -> None:
        if self._pending is not None:
            self._pending.grace_task.cancel()
            self._pending = None

    def _emit(self, order: int, transcript: str, *, formatted: bool) -> None:
        self._last_emitted_order = order
        self.events.put_nowait(
            TurnEvent(transcript=transcript, end_of_turn=True, formatted=formatted)
        )

    # ── reconnect / failure ──────────────────────────────────────────────────────

    async def _try_reconnect(self) -> bool:
        """One reconnect (with backoff) per streamer lifetime; False = permanent failure."""
        if self._reconnected_once:
            self._mark_failed("connection dropped again after the single reconnect")
            return False
        self._reconnected_once = True
        logger.warning("AssemblyAI stream dropped — reconnecting once …")
        await asyncio.sleep(self._reconnect_backoff_s)
        if self._closed:
            return False
        try:
            await self._open()
        except Exception:
            self._mark_failed("reconnect failed")
            return False
        logger.info("AssemblyAI stream reconnected.")
        return True

    def _mark_failed(self, why: str) -> None:
        if self.failed:
            return
        self.failed = True
        logger.error(
            "AssemblyAI streamer FATAL (%s) — session will fall back to local whisper.", why
        )
        self.events.put_nowait(
            TurnEvent(transcript="", end_of_turn=False, formatted=False, fatal=True)
        )
        # Best-effort immediate Terminate+close (billing trap) — teardown will close() again;
        # close() is idempotent so the double call is harmless.
        if not self._closed and self._close_task is None:
            self._close_task = asyncio.create_task(self.close(), name="aai-close-on-fatal")

    # ── connection plumbing ──────────────────────────────────────────────────────

    async def _open(self) -> None:
        self._ws = await self._connect(self._config.ws_url())
        # A reconnect is a NEW server session: turn_order restarts, held finals are void.
        self._last_emitted_order = -1
        self._cancel_grace()

    async def _default_connect(self, url: str) -> _WsLike:
        import websockets  # noqa: PLC0415 — deferred so tests with a fake never import it

        conn: _WsLike = await websockets.connect(
            url,
            # RAW key — the v3 endpoint rejects a "Bearer " prefix.
            additional_headers={"Authorization": self._config.api_key},
            open_timeout=_OPEN_TIMEOUT_S,
        )
        return conn

    async def _keepalive_loop(self) -> None:
        """Hold the idle socket open between turns (mic gated → no audio flows)."""
        while not self._closed:
            await asyncio.sleep(_KEEPALIVE_INTERVAL_S)
            ws = self._ws
            if ws is None or self.failed:
                continue
            if time.monotonic() - self._last_send_t < _KEEPALIVE_INTERVAL_S:
                continue  # audio flowed recently — no keepalive needed
            try:
                await ws.send(json.dumps({"type": "KeepAlive"}))
            except Exception:
                logger.debug("AssemblyAI KeepAlive failed — recv loop owns the drop.")
