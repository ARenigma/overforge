"""Shared contracts for the Overforge P2-B voice turn loop.

Dependency-light dataclasses, exceptions, and Protocols so the TTS layer (P2-B.3)
and the WebSocket transport (P2-B.4) can depend on stable types without importing
``VoiceSession`` internals.

NOTE: deliberately NOT named ``types.py`` — the voice package is imported as flat
top-level modules (see ``test_endpointing.py``), so a local ``types`` module would
shadow the stdlib ``types`` that torch/httpx import.
"""

from __future__ import annotations

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

    async def speak(self, turn: TurnResult) -> None: ...
    async def on_thinking(self) -> None: ...


class NoopTtsSink:
    """Default headless sink — logs the utterance and plays nothing.

    Lets the B.2/B.3 glue run end-to-end with no audio stack (and in tests).
    """

    async def speak(self, turn: TurnResult) -> None:
        if turn.utterance.text:
            logger.info("[tts:noop] interviewer> %s", turn.utterance.text)

    async def on_thinking(self) -> None:
        logger.debug("[tts:noop] thinking…")
