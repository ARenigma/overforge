"""Shared contracts for the Overforge P2-B voice turn loop.

Dependency-light dataclasses, exceptions, and Protocols so the TTS layer (P2-B.3)
and the WebSocket transport (P2-B.4) can depend on stable types without importing
``VoiceSession`` internals.

NOTE: deliberately NOT named ``types.py`` — the voice package is imported as flat
top-level modules (see ``test_endpointing.py``), so a local ``types`` module would
shadow the stdlib ``types`` that torch/httpx import.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal, Protocol

import numpy as np
import numpy.typing as npt

from endpointing import EotEvent

logger = logging.getLogger(__name__)

#: A committed turn (or a single 32 ms frame) of mono PCM, float32, 16 kHz.
AudioArray = npt.NDArray[np.float32]

#: What the interviewer's next utterance expects back from the candidate.
Expects = Literal["voice", "text", "code"]


@dataclass(frozen=True)
class Utterance:
    """The interviewer's next line and what it expects back."""

    text: str
    expects: Expects


@dataclass(frozen=True)
class AnswerResult:
    """Parsed ``POST /api/interviews/:id/answer`` response."""

    utterance: Utterance
    phase: str
    state: dict[str, object]


@dataclass(frozen=True)
class TurnResult:
    """The outcome of one committed candidate turn, returned by ``VoiceSession.feed_frame``."""

    utterance: Utterance
    phase: str
    transcript: str
    request_id: str
    is_terminal: bool


class TerminalError(Exception):
    """The interview is over (HTTP 409 — not in progress / time limit reached).

    The session must close; the candidate cannot answer further.
    """


class BrainTransientError(Exception):
    """A recoverable transport / 5xx failure talking to the interview brain.

    The session stays re-armable — the candidate can retry the turn.
    """


class EndpointerLike(Protocol):
    """The slice of ``SilenceGatedEndpointer`` that ``VoiceSession`` depends on."""

    def feed_frame(self, frame: AudioArray) -> EotEvent | None: ...
    def reset(self) -> None: ...
    @property
    def trailing_silence_s(self) -> float: ...


class SttLike(Protocol):
    """The slice of ``WhisperSTT`` that ``VoiceSession`` depends on (sync, blocking)."""

    def transcribe(self, audio: AudioArray, language: str = ...) -> str: ...


@dataclass(frozen=True)
class TurnEvent:
    """One turn notification from a streaming STT provider (AssemblyAI v3, P1-A).

    Attributes:
        transcript:  The turn's transcript text (full turn, not a delta).
        end_of_turn: True when the provider's built-in turn detection committed end-of-turn.
        formatted:   True when ``transcript`` is the punctuated/formatted final
                     (``turn_is_formatted`` on the wire).
        fatal:       Poison pill — the streamer died permanently (connect + one retry both
                     failed). The session must fall back to the local whisper path. All other
                     fields are meaningless when set.
    """

    transcript: str
    end_of_turn: bool
    formatted: bool
    fatal: bool = False


class SttStreamerLike(Protocol):
    """The slice of ``AssemblyAIStreamer`` that ``VoiceSession`` depends on.

    Contract: one WebSocket per session lifetime. ``feed`` never blocks on the network for
    long (small buffered sends); committed turns arrive on ``events`` (the provider's
    built-in turn detection replaces the local endpointer). ``failed`` flips True — and a
    ``fatal`` :class:`TurnEvent` is enqueued — when the connection is permanently lost, so
    the session can fall back to the local whisper path. ``close`` MUST always be called on
    session teardown (an unterminated AssemblyAI v3 session auto-closes only after 3 h and
    bills the full duration); it is idempotent and exception-safe.

    ``speech_activity`` is an :class:`asyncio.Event` set on ANY Turn message (partial or
    final) by the streamer and cleared by the session on each re-arm.  The idle-probe
    watchdog waits on this event to know whether the candidate has started speaking.
    """

    events: asyncio.Queue[TurnEvent]
    speech_activity: asyncio.Event
    failed: bool

    async def start(self) -> None: ...
    async def feed(self, pcm_f32: AudioArray) -> None: ...
    async def close(self) -> None: ...


@dataclass(frozen=True)
class ShadowSnapshot:
    """One shadow engine's per-turn observation, consumed at the primary's end-of-turn.

    - ``transcript``            the shadow's text for this turn window (for cross-engine WER).
    - ``stt_ms``                window-start → last final token (rough finalization latency).
    - ``endpoint_ms``           window-start → the shadow's FIRST semantic endpoint decision
                                (its own EOT), or None if it never fired one. Compare against when
                                the PRIMARY actually cut the turn to A/B turn-detection.
    - ``endpoint_count``        how many endpoints the shadow fired in the window (0 = never ended;
                                >=2 = it would have SPLIT the primary's single turn).
    - ``speaker_count``         distinct speaker labels observed in this turn's window (advisory
                                diarization only — NEVER a biometric voiceprint). None when the
                                provider returned no speaker labels (diarization off or labels absent).
    - ``non_primary_speaker_ms`` total ms in this turn attributed to non-primary speakers,
                                where "primary" = the label with the most accumulated speech across
                                the whole session (a positional label, not an identity). 0.0 when
                                there was only one speaker; None when no speaker labels were returned.
    """

    transcript: str
    stt_ms: float | None
    endpoint_ms: float | None
    endpoint_count: int
    speaker_count: int | None = None
    non_primary_speaker_ms: float | None = None


class ShadowSttLike(Protocol):
    """The slice of ``SonioxShadow`` that ``VoiceSession`` depends on.

    A pure OBSERVER: it transcribes the same mic audio in parallel with the primary engine
    for A/B comparison but NEVER drives turn detection and NEVER affects the live turn. All
    its methods are best-effort and swallow their own errors, so the session calls them
    unguarded. ``feed`` is fed the same LISTENING frames as the primary; ``reset`` opens a
    fresh per-turn window (on each re-arm); ``take_snapshot`` consumes that window's
    :class:`ShadowSnapshot` at commit; ``close`` is idempotent + exception-safe.
    """

    engine: str

    async def start(self) -> None: ...
    async def feed(self, pcm_f32: AudioArray) -> None: ...
    async def flush_turn(self) -> None: ...
    def reset(self) -> None: ...
    def take_snapshot(self) -> ShadowSnapshot: ...
    async def close(self) -> None: ...


class BrainClient(Protocol):
    """Submits a transcribed answer to the interview brain and returns the next utterance.

    ``RestBrainClient`` (brain_client.py) is the one-shot HTTP implementation. This Protocol
    is the seam for a hypothetical future streaming client — no streaming impl exists in B.2.
    """

    async def submit_answer(
        self, interview_id: str, token: str, answer: str, request_id: str
    ) -> AnswerResult: ...


class TtsSink(Protocol):
    """Voices the interviewer's reply + an end-of-turn "thinking" backchannel. Impl by B.3/B.4.

    The real sink emits control cues to the browser (over the B.4 WebSocket); the browser plays the
    audio by reusing the server-authoritative ``/speak`` route (reply) and ``/filler`` route
    (backchannel). B.2/B.3 ship :class:`NoopTtsSink`.

    Dual contract — the two methods have OPPOSITE blocking semantics:
      - ``speak(turn)``: voices the reply. Must resolve ONLY once the utterance has finished being
        voiced — the caller arms the next turn (which resets the endpointer) right after, and the
        endpointer must never be armed while the interviewer is still speaking.
      - ``on_thinking()``: a fire-and-forget cue emitted the instant the candidate stops (pre-STT)
        so a short filler can mask the STT+LLM gap. Must return as soon as the cue is DISPATCHED
        (NOT when filler audio finishes) — it runs concurrently with STT and must NOT block it.
    """

    async def speak(self, turn: TurnResult) -> float | None: ...
    async def on_thinking(self) -> None: ...


class NoopTtsSink:
    """Default headless sink — logs the utterance and plays nothing.

    Lets the B.2/B.3 glue run end-to-end with no audio stack (and in tests).
    """

    async def speak(self, turn: TurnResult) -> float | None:
        if turn.utterance.text:
            logger.info("[tts:noop] interviewer> %s", turn.utterance.text)
        return None

    async def on_thinking(self) -> None:
        logger.debug("[tts:noop] thinking…")
