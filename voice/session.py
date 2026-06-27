"""VoiceSession — the P2-B.2 turn orchestrator.

Bridges the validated endpointer + STT (P2-B.1) to the interview brain over the existing
one-shot ``POST /api/interviews/:id/answer``. Transport-agnostic and TTS-agnostic: P2-B.4
will feed it decoded 512-sample frames; P2-B.3 supplies the :class:`TtsSink`.

Per-turn lifecycle::

    LISTENING   frames accumulate AND feed the endpointer
      │  (EotEvent)
      ▼
    PROCESSING  snapshot full-turn audio → STT (threadpool) → submit to brain
      │
      ├─ empty transcript (false fire) → re-arm, back to LISTENING (no brain call)
      ├─ phase == 'done' / HTTP 409 ───→ voice closing line → TERMINAL (caller: close())
      └─ otherwise ────────────────────→ voice utterance → SPEAKING (caller: arm_next_turn())

The endpointer's private ring buffer is only the trailing-8 s Smart-Turn context window, so
``VoiceSession`` keeps its OWN authoritative per-turn accumulator — never feed the ring to STT.
"""

from __future__ import annotations

import asyncio
import enum
import logging
import uuid

import numpy as np

from contracts import (
    AudioArray,
    BrainClient,
    BrainTransientError,
    EndpointerLike,
    NoopTtsSink,
    SttLike,
    TerminalError,
    TtsSink,
    TurnResult,
    Utterance,
)

logger = logging.getLogger(__name__)

_SR = 16_000
_VAD_FRAME = 512

# Safety valve: the endpointer's hold gate and backstop both fire on SILENCE, so a candidate who
# never pauses long enough would grow the per-turn accumulator without bound. Force-commit the turn
# once it reaches this length — memory is capped and the answer is still transcribed + submitted.
# Generous: most single answers run well under a minute.
_MAX_TURN_S = 120.0
_MAX_TURN_FRAMES = int(_MAX_TURN_S * _SR / _VAD_FRAME)

# Backend FSM phases that mean the interview is over. The backend normalizes every terminal path to
# 'done'; 'scoring' is accepted defensively in case a transitional state ever leaks through.
_TERMINAL_PHASES: frozenset[str] = frozenset({"done", "scoring"})


class _State(enum.Enum):
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
    TERMINAL = "terminal"
    CLOSED = "closed"


def _new_request_id() -> str:
    return uuid.uuid4().hex


class VoiceSession:
    """Orchestrates one candidate's spoken interview turns against the REST brain.

    All collaborators are injected so the glue is fully testable offline. ``endpointer`` and
    ``stt`` are long-lived/warm and owned by the caller — ``VoiceSession`` never constructs them
    and only resets the endpointer (never the STT model) when arming the next turn.

    Args:
        interview_id:   The interview row id (path segment for ``/answer``).
        session_token:  The rotated ``BeginResult.sessionToken`` (the invite ``?t=`` token is dead
                        after ``/begin``). ``VoiceSession`` does NOT call ``/begin``.
        endpointer:     A warm :class:`SilenceGatedEndpointer` (or compatible).
        stt:            A warm :class:`WhisperSTT` (or compatible) — its ``transcribe`` is blocking.
        brain:          A :class:`BrainClient` (``RestBrainClient`` in production).
        sink:           A :class:`TtsSink`; defaults to :class:`NoopTtsSink` (headless).
        language:       BCP-47 code passed to STT and (later) the brain.
    """

    def __init__(
        self,
        *,
        interview_id: str,
        session_token: str,
        endpointer: EndpointerLike,
        stt: SttLike,
        brain: BrainClient,
        sink: TtsSink | None = None,
        language: str = "en",
    ) -> None:
        self._interview_id = interview_id
        self._token = session_token
        self._endpointer = endpointer
        self._stt = stt
        self._brain = brain
        self._sink: TtsSink = sink if sink is not None else NoopTtsSink()
        self._language = language

        self._accum: list[AudioArray] = []
        self._state = _State.LISTENING
        self._request_id = _new_request_id()
        # In-flight fire-and-forget cue tasks (on_thinking) — referenced so they aren't GC'd
        # mid-flight, and cancelled on close().
        self._bg_tasks: set[asyncio.Task[None]] = set()

    @property
    def state(self) -> str:
        """Lifecycle state: listening / processing / speaking / terminal / closed."""
        return self._state.value

    @property
    def request_id(self) -> str:
        """The idempotency key for the in-flight (or next) turn."""
        return self._request_id

    async def feed_frame(self, frame: AudioArray) -> TurnResult | None:
        """Feed one 32 ms frame (512 samples, float32, 16 kHz). Returns a turn or ``None``.

        Returns ``None`` while still listening (no end-of-turn yet) and for a false-fire EOT whose
        transcript came back empty (the session silently re-arms). Returns a :class:`TurnResult`
        once a real answer has been submitted and its utterance voiced via the sink. Frames received
        while processing / speaking / after a terminal turn are ignored (``None``).

        Raises:
            BrainTransientError: the brain call failed transiently; the session has already
                                 re-armed (same ``requestId`` preserved for idempotent replay).
            Exception:           any unexpected fault (STT crash, malformed data); the session has
                                 re-armed before re-raising, so it is never stranded in PROCESSING.
        """
        if self._state is not _State.LISTENING:
            return None  # ignore frames while processing / speaking / done

        frame = np.asarray(frame, dtype=np.float32)
        # Append to our OWN full-turn buffer BEFORE the endpointer (whose ring only keeps 8 s).
        # frame.copy() because the B.4 WebSocket transport may recycle/overwrite the frame buffer.
        self._accum.append(frame.copy())

        event = self._endpointer.feed_frame(frame)
        forced = event is None and len(self._accum) >= _MAX_TURN_FRAMES
        if event is None and not forced:
            return None

        # End of turn (or forced cap) — leave LISTENING synchronously (before any await) so frames
        # arriving during STT + submit are ignored and cannot bleed into this turn (single asyncio
        # loop → race-free). Everything past this point MUST land in a non-PROCESSING state; the
        # trailing handlers are the backstop guaranteeing a fault can never strand us in PROCESSING.
        self._state = _State.PROCESSING
        reason = event.kind if event is not None else "maxlen"
        logger.debug(
            "Commit (%s) at %.1fs — %d frames",
            reason,
            len(self._accum) * _VAD_FRAME / _SR,
            len(self._accum),
        )

        # Fire the "thinking" backchannel the instant the candidate stops — non-blocking, so a short
        # filler can mask the STT+brain gap. Launched before STT, never awaited inline. NOTE: it
        # fires before the transcript is known, so a false-fire commit (cough → empty transcript)
        # plays a brief harmless filler — accepted, to mask latency from t=stop.
        self._safe_thinking()

        try:
            return await self._process_turn(reason)
        except BrainTransientError:
            # Recoverable: keep the SAME requestId so a retry can hit the server's idempotent replay
            # (the original answer may have been processed even though the response was lost).
            logger.exception("Transient brain failure on turn %s — re-arming.", self._request_id)
            self._recover(new_request_id=False)
            raise
        except Exception:
            # Unknown fault (STT crash, malformed data, etc.): fail OPEN — re-arm so the session is
            # never stranded in PROCESSING, then re-raise so the caller can surface/log it.
            logger.exception("Unexpected failure processing turn — re-arming.")
            self._recover()
            raise

    async def _process_turn(self, reason: str) -> TurnResult | None:
        """Snapshot the turn audio, transcribe, submit to the brain, voice the reply.

        Returns ``None`` for a false-fire commit (empty transcript) after silently re-arming.
        Raises :class:`BrainTransientError` (handled by ``feed_frame``) or any unexpected error.
        """
        committed: AudioArray = (
            np.concatenate(self._accum).astype(np.float32, copy=False)
            if self._accum
            else np.zeros(0, dtype=np.float32)
        )

        # STT off the event loop — transcribe() is synchronous (~0.12x RT) and would starve frame
        # intake (and, in B.4, every other concurrent session) if run inline.
        transcript = (
            await asyncio.to_thread(self._stt.transcribe, committed, self._language)
        ).strip()

        if not transcript:
            # False fire (cough / clipped silence): never submit an empty answer; re-arm + listen.
            logger.info("Empty transcript on commit (%s) — false fire; re-arming.", reason)
            self._recover()
            return None

        request_id = self._request_id
        try:
            result = await self._brain.submit_answer(
                self._interview_id, self._token, transcript, request_id
            )
        except TerminalError as err:
            # 409 / 403: interview over (or token dead). Voice the conclusion; no reset.
            self._state = _State.TERMINAL
            turn = TurnResult(
                utterance=Utterance(
                    text=str(err) or "Your interview has concluded.", expects="text"
                ),
                phase="done",
                transcript=transcript,
                request_id=request_id,
                is_terminal=True,
            )
            await self._safe_speak(turn)
            return turn

        is_terminal = result.phase in _TERMINAL_PHASES
        turn = TurnResult(
            utterance=result.utterance,
            phase=result.phase,
            transcript=transcript,
            request_id=request_id,
            is_terminal=is_terminal,
        )
        # Voice it (including a terminal closing line) BEFORE the caller arms the next turn, so the
        # endpointer reset (in arm_next_turn) can never fire while the interviewer still speaks.
        await self._safe_speak(turn)
        self._state = _State.TERMINAL if is_terminal else _State.SPEAKING
        return turn

    async def _safe_speak(self, turn: TurnResult) -> None:
        """Voice an utterance. A TTS failure is non-fatal (the room degrades to text) and must
        never derail the session state — so we swallow + log it rather than let it propagate."""
        try:
            await self._sink.speak(turn)
        except Exception:
            logger.exception("TTS sink failed for turn %s — continuing.", turn.request_id)

    def _safe_thinking(self) -> None:
        """Fire the EOT "thinking" backchannel cue WITHOUT blocking the STT pipeline.

        Launched as a tracked background task (never awaited inline) so a slow or failing sink can
        never delay STT. Exceptions are swallowed + logged — a backchannel failure is non-fatal.
        """

        async def _run() -> None:
            try:
                await self._sink.on_thinking()
            except Exception:
                logger.exception("TTS thinking-cue failed — continuing.")

        task = asyncio.create_task(_run(), name=f"thinking-cue-{self._request_id}")
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)

    def arm_next_turn(self) -> None:
        """Arm for the next candidate turn. Call AFTER TTS has finished voicing the utterance.

        Only a voiced turn (``SPEAKING``) is eligible; a no-op otherwise (terminal/closed, or an
        erroneous call mid-processing) so it can never clobber an in-flight turn. Clears the buffer,
        mints a fresh ``requestId``, resets the endpointer, and returns to ``LISTENING``.
        """
        if self._state is not _State.SPEAKING:
            return
        self._recover()

    def close(self) -> None:
        """Terminal teardown — ``feed_frame`` becomes a no-op. Cancels any in-flight backchannel
        cue; does NOT reset the endpointer."""
        self._state = _State.CLOSED
        for task in list(self._bg_tasks):
            task.cancel()

    def _recover(self, *, new_request_id: bool = True) -> None:
        """Clear the buffer, reset the endpointer, return to LISTENING.

        ``new_request_id=False`` preserves the current id so a transient retry can still hit the
        server's idempotent replay (don't double-submit an answer that may have been processed).
        """
        self._accum.clear()
        if new_request_id:
            self._request_id = _new_request_id()
        self._endpointer.reset()
        self._state = _State.LISTENING
