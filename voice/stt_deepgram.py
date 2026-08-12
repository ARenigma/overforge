"""Deepgram nova-3 real-time streaming SHADOW observer for A/B/C STT comparison.

Runs in PARALLEL with the primary engine on the SAME mic audio, producing an independent
transcript per turn for offline cross-engine comparison.  It is a pure OBSERVER:

  - it NEVER drives turn detection,
  - it NEVER touches the live turn (log-only), and
  - it swallows ALL of its own errors.

Wire format — verified empirically against the Deepgram streaming API (2026-08):

MODEL CHOICE: nova-3 on ``/v1/listen`` (chosen over Flux v2 — see rejection note below).

  - URL     ``wss://api.deepgram.com/v1/listen`` + query params.
  - Auth    ``Authorization: Token <raw api key>`` header — NO ``Bearer`` prefix.
  - Params  ``encoding=linear16``, ``sample_rate=16000``, ``channels=1``,
            ``model=nova-3``, ``interim_results=true``, ``endpointing=300``
            (``endpointing`` ms of trailing silence → Deepgram fires its own EOT).
            Optional: ``diarize=true`` → word-level speaker labels in Results.
  - Audio   Binary WS frames of PCM16 mono, any chunk size.
  - Server JSON:
      ``{"type":"Results", "channel":{"alternatives":[{"transcript":str,
         "words":[{"word":str,"start":float,"end":float,"speaker":int,...}]}]},
         "is_final":bool, "speech_final":bool, "start":float, "duration":float}``
      ``{"type":"Metadata", ...}``   — emitted after CloseStream.
  - ``is_final=True``       segment finalized → accumulate for transcript.
  - ``speech_final=True``   Deepgram's own EOT decision → endpoint event (analogous
                            to Soniox's ``<end>`` token). Timestamp for A/B comparison.
  - CloseStream ``{"type":"CloseStream"}`` → ends the session.
  - **No mid-stream finalize** available on v1 → ``finalize_lag_ms = None`` always.
  - ``utterance_end_ms`` requires ``interim_results=true`` AND a tier that supports it;
    testing found it caused HTTP 400 with nova-3 + nova-2, so we use ``endpointing``
    instead (verified working).

DEEPGRAM FLUX v2 REJECTION NOTE (empirically verified):
  - Flux models (``flux-general-en``, ``flux-meeting-en``, etc.) require the
    ``/v2/listen`` endpoint.  They were tested and REJECTED for this shadow use-case
    because:
    (a) the ``Finalize`` control message closes the entire WS session, making
        per-turn flush impossible for a multi-turn interview shadow;
    (b) ``channels``, ``interim_results`` and other standard params are not accepted
        on v2 (return HTTP 400 "Unknown query parameters");
    (c) the v2 message schema (``TurnInfo{event:Update/Commit}`` with
        ``end_of_turn_confidence``) was verified live but no ``Commit`` event was
        observed with non-speech audio, making offline fixture creation unreliable.
  - FUTURE: if Deepgram Flux v2 adds per-turn finalize without closing the session,
    wire a ``DeepgramFluxShadow`` as a second engine.

Diarization (advisory, default ON):
  ``diarize=true`` param → ``speaker`` field (int) on each word in Results.
  We track per-label cumulative speech ms across the session to identify the primary
  speaker positionally (NOT by identity/voiceprint). Speaker labels are integers
  (0, 1, 2…) — positional, not named, not enrolled. Disable via
  ``STT_SHADOW_DIARIZE=0``. Mirrors the diarization policy in stt_soniox.py.
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
from urllib.parse import urlencode

import numpy as np

from contracts import AudioArray, ShadowSnapshot

logger = logging.getLogger(__name__)

_DEFAULT_WS_URL = "wss://api.deepgram.com/v1/listen"
_SR = 16_000

# Bounded send queue — same design as SonioxShadow (drop-oldest on full).
_SEND_QUEUE_MAX = 1024
_OPEN_TIMEOUT_S = 10.0
_CLOSE_TIMEOUT_S = 3.0

#: Sentinel to signal CloseStream to the sender loop.
_EOS = object()


def _f32_to_pcm16(pcm_f32: AudioArray) -> bytes:
    """Convert float32 [-1, 1] mono PCM to little-endian int16 bytes (``pcm_s16le``)."""
    clipped = np.clip(np.asarray(pcm_f32, dtype=np.float32), -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


@dataclass(frozen=True)
class DeepgramConfig:
    """Connection + endpointing config for one Deepgram nova-3 shadow session."""

    api_key: str
    model: str = "nova-3"
    sample_rate: int = _SR
    #: Trailing silence (ms) that triggers Deepgram's own EOT (``endpointing`` param).
    #: Set to 0 to disable Deepgram's internal endpointing (we only accumulate finals).
    endpointing_ms: int = 300
    #: Speaker diarization (default ON). See module docstring for privacy policy.
    #: Disable via ``STT_SHADOW_DIARIZE=0``.
    enable_diarization: bool = True
    url: str = _DEFAULT_WS_URL

    @classmethod
    def from_env(
        cls, env: Mapping[str, str] | None = None, *, language: str = "en"
    ) -> DeepgramConfig:
        """Build from the environment.

        - ``DEEPGRAM_API_KEY``        raw API key (required for the deepgram shadow).
        - ``DEEPGRAM_MODEL``          model override (default ``nova-3``).
        - ``DEEPGRAM_ENDPOINTING_MS`` endpointing silence threshold in ms (default 300).
        - ``STT_SHADOW_DIARIZE``      set to ``0`` to disable speaker diarization
          (default on — positional second-voice detection without voiceprint storage).
        """
        e: Mapping[str, str] = env if env is not None else os.environ
        return cls(
            api_key=e.get("DEEPGRAM_API_KEY", ""),
            model=e.get("DEEPGRAM_MODEL", "nova-3"),
            endpointing_ms=int(e.get("DEEPGRAM_ENDPOINTING_MS", "300")),
            enable_diarization=e.get("STT_SHADOW_DIARIZE", "1") != "0",
        )

    def ws_url(self) -> str:
        """Fully-formed WS URL with all verified query params."""
        params: dict[str, str] = {
            "encoding": "linear16",
            "sample_rate": str(self.sample_rate),
            "channels": "1",
            "model": self.model,
            "interim_results": "true",  # required for speech_final events
        }
        if self.endpointing_ms > 0:
            params["endpointing"] = str(self.endpointing_ms)
        if self.enable_diarization:
            params["diarize"] = "true"
        return f"{self.url}?{urlencode(params)}"


class _WsLike(Protocol):
    async def send(self, data: bytes | str) -> None: ...
    async def recv(self) -> bytes | str: ...
    async def close(self) -> None: ...


ConnectFn = Callable[[str], Awaitable[_WsLike]]


class DeepgramShadow:
    """Deepgram nova-3 streaming shadow session — a pure A/B/C observer.

    API mirrors SonioxShadow exactly (same ShadowSttLike protocol):
      - ``await start()``    connect + spawn recv/sender loops (best-effort).
      - ``await feed(f32)``  float32→PCM16 → enqueue (non-blocking, drop-oldest).
      - ``flush_turn()``     no-op — Deepgram v1 has no mid-stream finalize; snapshot
                             captures whatever finals arrived before primary commit.
      - ``reset()``          open a fresh per-turn window.
      - ``take_snapshot()``  consume this window's ShadowSnapshot.
      - ``await close()``    send CloseStream + close (idempotent, exception-safe).
      - ``failed``           True once permanently disabled.

    ``finalize_lag_ms`` is always None (no mid-stream finalize on Deepgram v1).
    ``endpoint_ms`` / ``endpoint_count`` are driven by ``speech_final=True`` Results,
    which are Deepgram's own EOT decisions (its ``endpointing`` param fires these).
    """

    engine = "deepgram"

    def __init__(
        self,
        config: DeepgramConfig,
        *,
        connect: ConnectFn | None = None,
    ) -> None:
        self._config = config
        self._connect: ConnectFn = connect if connect is not None else self._default_connect

        self.failed = False
        self._ws: _WsLike | None = None
        self._started = False
        self._closed = False
        self._recv_task: asyncio.Task[None] | None = None
        self._sender_task: asyncio.Task[None] | None = None
        self._send_q: asyncio.Queue[object] = asyncio.Queue(maxsize=_SEND_QUEUE_MAX)

        # Per-turn window state.
        self._finals: list[str] = []
        self._window_start: float | None = None
        self._last_final_t: float | None = None
        # Deepgram's own EOT events (speech_final=True on a Results message).
        self._endpoints: list[float] = []
        # Diarization — same positional-label policy as stt_soniox.py.
        # session_speaker_ms: cumulative ms per speaker int across ALL turns (identifies primary).
        # _turn_speaker_ms: per-label ms in the current window only; cleared on reset().
        self._session_speaker_ms: dict[int, float] = {}
        self._turn_speaker_ms: dict[int, float] = {}

    # ── lifecycle ────────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Connect, send the config frame, and spawn the recv + sender loops (best-effort)."""
        if self._started or self._closed:
            return
        self._started = True
        if not self._config.api_key:
            logger.error("Deepgram shadow: DEEPGRAM_API_KEY unset — shadow disabled.")
            self.failed = True
            return
        try:
            self._ws = await self._connect(self._config.ws_url())
        except Exception:
            logger.exception("Deepgram shadow failed to connect — shadow disabled.")
            self.failed = True
            self._ws = None
            return
        self._recv_task = asyncio.create_task(self._recv_loop(), name="dg-shadow-recv")
        self._sender_task = asyncio.create_task(self._sender_loop(), name="dg-shadow-send")

    async def feed(self, pcm_f32: AudioArray) -> None:
        """Enqueue one frame's PCM. Non-blocking; drops oldest when the queue is full."""
        if self.failed or self._closed or self._ws is None:
            return
        if self._window_start is None:
            self._window_start = time.perf_counter()
        chunk = _f32_to_pcm16(pcm_f32)
        try:
            self._send_q.put_nowait(chunk)
        except asyncio.QueueFull:
            try:
                self._send_q.get_nowait()
                self._send_q.put_nowait(chunk)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass

    async def flush_turn(self) -> None:
        """No-op: Deepgram v1 has no mid-stream finalize. finalize_lag_ms is always None.

        Deepgram's ``CloseStream`` terminates the entire session (not per-turn), and
        there is no equivalent of Soniox's ``{"type":"finalize"}`` that flushes pending
        tokens mid-stream while keeping the session open. The snapshot captures whatever
        finals Deepgram emitted before the primary committed (these arrive promptly for
        each ``endpointing`` silence window, so the tail is already final by commit time).
        """
        # intentional no-op — see module docstring for rationale

    def reset(self) -> None:
        """Begin a new per-turn listening window."""
        self._finals.clear()
        self._window_start = None
        self._last_final_t = None
        self._endpoints.clear()
        self._turn_speaker_ms.clear()

    def take_snapshot(self) -> ShadowSnapshot:
        """Consume the current window's shadow observation.

        ``finalize_lag_ms`` is always None (Deepgram v1 has no mid-stream finalize).
        ``endpoint_ms`` / ``endpoint_count`` are driven by ``speech_final=True`` Results.
        """
        text = " ".join(self._finals).strip()
        latency_ms: float | None = None
        if self._window_start is not None and self._last_final_t is not None:
            latency_ms = max(0.0, (self._last_final_t - self._window_start) * 1000.0)
        endpoint_ms: float | None = None
        if self._window_start is not None and self._endpoints:
            endpoint_ms = max(0.0, (self._endpoints[0] - self._window_start) * 1000.0)
        endpoint_count = len(self._endpoints)
        self._finals.clear()
        self._last_final_t = None
        self._endpoints.clear()

        # Diarization.
        speaker_count: int | None = None
        non_primary_speaker_ms: float | None = None
        if self._turn_speaker_ms:
            speaker_count = len(self._turn_speaker_ms)
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
            finalize_lag_ms=None,  # not available on Deepgram v1 (no mid-stream finalize)
            speaker_count=speaker_count,
            non_primary_speaker_ms=non_primary_speaker_ms,
        )

    async def close(self) -> None:
        """Send CloseStream + close the socket. Idempotent."""
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
            except Exception:  # noqa: BLE001
                sender.cancel()
        if self._recv_task is not None:
            self._recv_task.cancel()
        ws = self._ws
        self._ws = None
        if ws is not None:
            try:
                await asyncio.wait_for(ws.close(), timeout=_CLOSE_TIMEOUT_S)
            except Exception:  # noqa: BLE001
                pass

    # ── internal loops ────────────────────────────────────────────────────────────

    async def _sender_loop(self) -> None:
        """Drain the send queue; emit CloseStream on EOS."""
        try:
            while True:
                item = await self._send_q.get()
                if item is _EOS:
                    if self._ws is not None:
                        await self._ws.send(json.dumps({"type": "CloseStream"}))
                    return
                if self._ws is not None:
                    await self._ws.send(item)  # type: ignore[arg-type]
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Deepgram shadow sender stopped (connection lost) — shadow disabled.")
            self.failed = True

    async def _recv_loop(self) -> None:
        """Accumulate is_final transcripts; timestamp speech_final endpoint events."""
        ws = self._ws
        if ws is None:
            return
        try:
            while True:
                raw = await ws.recv()
                if isinstance(raw, (bytes, bytearray)):
                    continue  # Deepgram server messages are JSON text
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                if not isinstance(msg, dict):
                    continue
                mtype = msg.get("type")
                if mtype != "Results":
                    # Metadata / SpeechStarted / other — not transcript data.
                    if msg.get("created"):  # Metadata = session closed normally
                        return
                    continue

                is_final = bool(msg.get("is_final"))
                speech_final = bool(msg.get("speech_final"))

                if speech_final:
                    # Deepgram's own EOT decision — record for endpoint A/B analysis.
                    self._endpoints.append(time.perf_counter())

                if not is_final:
                    continue  # partials (is_final=False) are unused — skip

                # Extract transcript text.
                channel = msg.get("channel") or {}
                alternatives = channel.get("alternatives") or [{}]
                alt = alternatives[0] if alternatives else {}
                transcript = str(alt.get("transcript") or "").strip()
                if transcript:
                    self._finals.append(transcript)
                    self._last_final_t = time.perf_counter()

                # Diarization: word-level speaker labels (advisory, positional).
                # Each word: {"word":str, "start":float, "end":float, "speaker":int, ...}
                if self._config.enable_diarization:
                    words = alt.get("words") or []
                    for w in words:
                        speaker = w.get("speaker")
                        if not isinstance(speaker, int):
                            continue
                        start = w.get("start")
                        end = w.get("end")
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
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("Deepgram shadow receiver stopped (connection lost) — shadow disabled.")
            self.failed = True

    async def _default_connect(self, url: str) -> _WsLike:
        import websockets  # noqa: PLC0415

        conn: _WsLike = await websockets.connect(
            url,
            # Raw key — Deepgram rejects a "Bearer " prefix.
            additional_headers={"Authorization": f"Token {self._config.api_key}"},
            open_timeout=_OPEN_TIMEOUT_S,
            max_size=None,
        )
        return conn
