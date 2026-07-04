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
import os
import re
import time
import uuid

import numpy as np

from contracts import (
    AudioArray,
    BrainClient,
    BrainTransientError,
    EndpointerLike,
    NoopTtsSink,
    ShadowSttLike,
    SttLike,
    SttStreamerLike,
    TerminalError,
    TtsSink,
    TurnEvent,
    TurnResult,
    Utterance,
)
from telemetry import NoopTelemetrySink, TelemetrySink, TurnTelemetry

logger = logging.getLogger(__name__)

_SR = 16_000
_VAD_FRAME = 512

# Safety valve: the endpointer's hold gate and backstop both fire on SILENCE, so a candidate who
# never pauses long enough would grow the per-turn accumulator without bound. Force-commit the turn
# once it reaches this length — memory is capped and the answer is still transcribed + submitted.
# Generous: most single answers run well under a minute.
_MAX_TURN_S = 120.0

# Idle probe (assemblyai path only). If no speech from the candidate within this window after
# the mic is armed, the interviewer probes once with a warm canned nudge, then keeps listening.
_IDLE_PROBE_S = 10.0
_IDLE_PROBE_LINES = (
    "Take your time — would you like me to rephrase the question?",
    "No rush — want me to restate it or give you a moment?",
    "Whenever you're ready — shall I repeat the question?",
)
_MAX_TURN_FRAMES = int(_MAX_TURN_S * _SR / _VAD_FRAME)

# Streaming STT (Phase 2b, flag-gated via STT_STREAMING=1): during LISTENING, transcribe a completed
# speech segment in the BACKGROUND when trailing silence reaches a phrase-pause AND enough new audio
# has accumulated, so the EOT finalize transcribes only the short tail (near-instant) instead of the
# whole answer. Pause-aligned so seams fall on word boundaries (the transcript feeds scoring).
_STREAM_PAUSE_S = 0.4
_STREAM_MIN_SEG_FRAMES = int(2.5 * _SR / _VAD_FRAME)

# Known STT silence-hallucinations. faster-whisper invents filler like "thank you" / "you" / "bye"
# on near-silent or noise-only audio; the bare ``if not transcript`` check only catches the empty
# string, so these would otherwise render as a candidate turn (the "I said nothing but 'thank you'
# appeared" bug). Deliberately conservative — only phrases that are essentially never a real
# interview answer, so a legitimate short reply ("yes", "no", "ok") is never eaten. Matched against
# the WHOLE normalized transcript, so "thank you for the chance" is NOT filtered.
_WHISPER_HALLUCINATIONS = frozenset(
    {
        "thank you",
        "thank you very much",
        "thanks for watching",
        "thank you for watching",
        "you",
        "bye",
    }
)


def _is_hallucination(text: str) -> bool:
    """True if ``text`` is a known STT silence-hallucination (or bare punctuation like ".")."""
    normalized = text.lower().strip().strip(".,!?;:…").strip()
    if not normalized:
        return True  # pure punctuation / dots
    return normalized in _WHISPER_HALLUCINATIONS


# Disfluency/filler interjections a candidate emits while THINKING, not answering. A turn whose
# EVERY token is one of these is a thinking pause the STT committed as a turn (e.g. AAI punctuating
# a lone "Um." as a complete sentence) — we keep listening instead of treating it as a thin answer
# and firing a follow-up. Interjections ONLY (never "ok"/"so"/"like") so a real short reply
# ("no", "yes", "three") is never eaten. Engine-agnostic backstop for the AAI turn-prompt fix.
_FILLER_WORDS = frozenset(
    {"um", "umm", "uh", "uhh", "uhm", "hmm", "hm", "hmmm", "mhm", "mm", "er", "err", "eh", "ah"}
)


def _is_filler_only(text: str) -> bool:
    """True if every token in ``text`` is a filler interjection (a thinking pause, not an answer)."""  # noqa: E501
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return len(tokens) > 0 and all(tok in _FILLER_WORDS for tok in tokens)

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
        streamer:       Optional :class:`SttStreamerLike` (AssemblyAI v3, ``STT_PROVIDER=
                        assemblyai``). When set, frames are forwarded to the remote stream
                        and its built-in turn detection replaces the local endpointer + STT;
                        on permanent streamer failure the session falls back to the injected
                        ``endpointer``/``stt``. ``None`` (default) = the local whisper path,
                        byte-for-byte unchanged.
        shadow:         Optional :class:`ShadowSttLike` (Soniox, ``STT_SHADOW=soniox``). A pure
                        OBSERVER: it transcribes the SAME LISTENING audio in parallel for A/B
                        comparison, snapshotting its per-turn transcript into telemetry. It
                        never drives turns and never affects the live interview — all its calls
                        are best-effort. ``None`` (default) = no shadow.
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
        telemetry: TelemetrySink | None = None,
        streamer: SttStreamerLike | None = None,
        shadow: ShadowSttLike | None = None,
    ) -> None:
        self._interview_id = interview_id
        self._token = session_token
        self._endpointer = endpointer
        self._stt = stt
        self._brain = brain
        self._sink: TtsSink = sink if sink is not None else NoopTtsSink()
        self._language = language
        self._telemetry: TelemetrySink = telemetry if telemetry is not None else NoopTelemetrySink()

        self._accum: list[AudioArray] = []
        self._state = _State.LISTENING
        self._request_id = _new_request_id()
        # In-flight fire-and-forget cue tasks (on_thinking + telemetry) — referenced so they
        # aren't GC'd mid-flight, and cancelled on close().
        self._bg_tasks: set[asyncio.Task[None]] = set()
        # Set on a false-fire commit so the WS layer re-sends {ready} to re-arm the browser mic: the
        # pre-STT {thinking} cue disarmed it but a false-fire sends no turn_ready. See take_rearm().
        self._rearm_pending = False
        # Streaming STT (flag-gated). _committed_text = transcript of _accum[:_committed_frames],
        # incrementally in the background at pauses; the EOT finalize transcribes only the tail. The
        # turn_gen counter invalidates a late background result after a recover/re-arm.
        self._stream_stt = os.environ.get("STT_STREAMING", "") == "1"
        self._committed_text = ""
        self._committed_frames = 0
        self._turn_gen = 0
        self._stt_task: asyncio.Task[None] | None = None
        # Remote streaming STT (P1-A, STT_PROVIDER=assemblyai). While healthy, frames bypass
        # the endpointer/local STT entirely; committed turns arrive as TurnEvents consumed by
        # pump(). _fell_back flips (once) on permanent streamer failure — the session then
        # runs the local whisper path for the rest of its life. The two _pump_* tasks are the
        # persistent frame/event waiters (never cancelled mid-wait, so no queue items leak).
        self._streamer = streamer
        self._streamer_started = False
        self._fell_back = False
        self._stream_frames = 0  # frames forwarded since the last re-arm (telemetry audio_s)
        self._pump_frame_task: asyncio.Task[AudioArray] | None = None
        self._pump_event_task: asyncio.Task[TurnEvent] | None = None
        self._pump_event_gen = 0  # _turn_gen at event-waiter creation — stale-event guard
        self._streamer_close_task: asyncio.Task[None] | None = None  # close() safety net ref
        # Idle probe (assemblyai path only). _idle_watchdog_task is the per-turn 10 s timer;
        # _probe_fired is the once-per-turn guard (only one nudge per armed window);
        # _probe_index rotates through _IDLE_PROBE_LINES across turns.
        self._idle_watchdog_task: asyncio.Task[None] | None = None
        self._probe_fired = False
        self._probe_index = 0
        # Shadow STT (A/B, STT_SHADOW=soniox). A pure observer: the same LISTENING frames are
        # tee'd to it, its per-turn transcript is snapshotted into telemetry at commit, and it
        # is reset on each re-arm. Started lazily on the first frame; closed at teardown. All
        # calls are best-effort (the shadow swallows its own errors) so it can never break a turn.
        self._shadow = shadow
        self._shadow_started = False
        self._shadow_close_task: asyncio.Task[None] | None = None

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

        # Shadow STT (A/B observer): tee every LISTENING frame to the shadow engine so it
        # transcribes the SAME audio as the primary. Started lazily; best-effort (the shadow
        # swallows its own errors and never back-pressures this hot path) — never affects the turn.
        if self._shadow is not None:
            self._ensure_shadow_started()  # schedules start() off the hot path — never blocks
            await self._shadow.feed(np.asarray(frame, dtype=np.float32))

        streamer = self._streamer
        if streamer is not None and self._stream_mode():
            # Remote streaming STT: forward the frame; the provider's built-in turn detection
            # replaces the endpointer, so no local accumulation / VAD / segment logic runs.
            # Committed turns arrive as TurnEvents (see pump / _on_stream_event).
            await self._ensure_streamer_started()
            if self._stream_mode():  # start may have failed → fell back to the local path
                self._stream_frames += 1
                await streamer.feed(np.asarray(frame, dtype=np.float32))
                return None

        frame = np.asarray(frame, dtype=np.float32)
        # Append to our OWN full-turn buffer BEFORE the endpointer (whose ring only keeps 8 s).
        # frame.copy() because the B.4 WebSocket transport may recycle/overwrite the frame buffer.
        self._accum.append(frame.copy())

        event = self._endpointer.feed_frame(frame)
        # Streaming STT: at a pause, transcribe the completed segment in the background so the
        # EOT finalize handles only the short tail. Never blocks intake; one segment at a time.
        if self._stream_stt and event is None:
            self._maybe_commit_segment()
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

    async def pump(self, frame_q: asyncio.Queue[AudioArray]) -> TurnResult | None:
        """One pipeline step: consume the next input (mic frame or streamed turn event).

        The WS pipeline's single entry point. In the default whisper mode this is EXACTLY the
        previous inline loop body — ``await frame_q.get()`` then :meth:`feed_frame` — so the
        local path is behaviorally unchanged. In streaming mode (STT_PROVIDER=assemblyai) it
        waits on BOTH the frame queue (frames forward to the remote stream) and the streamer's
        TurnEvent queue (an end-of-turn event commits a turn through the same pipeline), since
        the provider's EOT decision arrives independently of mic-frame timing.

        Returns / raises exactly like :meth:`feed_frame` (``TurnResult`` for a committed turn,
        ``None`` otherwise; brain errors propagate after the session has re-armed itself).
        """
        if self._streamer is None or self._fell_back:
            frame = await self._next_frame(frame_q)
            return await self.feed_frame(frame)

        if self._streamer.failed:
            # The fatal poison-pill event may have been drained with the queue on a re-arm;
            # the flag is the authoritative signal either way.
            self._fallback_to_local()
            frame = await self._next_frame(frame_q)
            return await self.feed_frame(frame)

        await self._ensure_streamer_started()
        if not self._stream_mode():  # start failed → this session is local from here on
            frame = await self._next_frame(frame_q)
            return await self.feed_frame(frame)

        # Persistent waiters: never cancelled between pump calls, so a dequeued item can never
        # be lost to a cancellation race (asyncio.wait leaves the losers pending).
        if self._pump_frame_task is None:
            self._pump_frame_task = asyncio.create_task(frame_q.get(), name="pump-frame")
        if self._pump_event_task is None:
            self._pump_event_task = asyncio.create_task(
                self._streamer.events.get(), name="pump-event"
            )
            self._pump_event_gen = self._turn_gen
        done, _pending = await asyncio.wait(
            {self._pump_frame_task, self._pump_event_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        result: TurnResult | None = None
        if self._pump_frame_task in done:
            frame_task, self._pump_frame_task = self._pump_frame_task, None
            await self.feed_frame(frame_task.result())
        if self._pump_event_task in done:
            event_task, self._pump_event_task = self._pump_event_task, None
            event = event_task.result()
            if self._pump_event_gen != self._turn_gen and not event.fatal:
                # The waiter predates a re-arm (turn_gen moved on) — the event belongs to the
                # previous listening window. Drop it; never commit stale audio as a turn.
                logger.debug("Dropping stale streamed turn event (gen %d != %d).",
                             self._pump_event_gen, self._turn_gen)
            else:
                result = await self._on_stream_event(event)
        return result

    async def _next_frame(self, frame_q: asyncio.Queue[AudioArray]) -> AudioArray:
        """Next mic frame — consuming a leftover persistent waiter first (fallback path)."""
        if self._pump_frame_task is not None:
            frame_task, self._pump_frame_task = self._pump_frame_task, None
            return await frame_task
        return await frame_q.get()

    async def _on_stream_event(self, event: TurnEvent) -> TurnResult | None:
        """Commit one streamed end-of-turn event through the existing turn pipeline.

        Mirrors the post-EOT half of :meth:`feed_frame`: leave LISTENING synchronously, fire
        the thinking cue, then run the shared sanity → brain → TTS tail (``_complete_turn``).
        ``stt_ms`` is the event→transcript-ready time, ≈0 by construction — the transcript
        rides on the end-of-turn event itself.
        """
        if event.fatal:
            self._fallback_to_local()
            return None
        if self._state is not _State.LISTENING or not event.end_of_turn:
            return None  # stale (belt-and-braces; re-arm drains the queue) or a partial
        # A real turn is committing — cancel the idle probe watchdog so it doesn't fire
        # concurrently with turn processing or re-arm.
        self._cancel_idle_watchdog()
        self._state = _State.PROCESSING
        t0 = time.perf_counter()
        audio_s = self._stream_frames * _VAD_FRAME / _SR
        logger.debug(
            "Commit (assemblyai_eot) at %.1fs — formatted=%s", audio_s, event.formatted
        )
        self._safe_thinking()
        # One loop yield so the thinking cue DISPATCHES before the brain reply can be spoken.
        # The local path gets this ordering for free from its asyncio.to_thread STT hop; here
        # there is no STT hop at all, so the cue task would otherwise start after speak().
        await asyncio.sleep(0)
        transcript = event.transcript.strip()
        stt_ms = (time.perf_counter() - t0) * 1000.0
        try:
            return await self._complete_turn("assemblyai_eot", transcript, audio_s, stt_ms)
        except BrainTransientError:
            logger.exception("Transient brain failure on turn %s — re-arming.", self._request_id)
            self._recover(new_request_id=False)
            raise
        except Exception:
            logger.exception("Unexpected failure processing streamed turn — re-arming.")
            self._recover()
            raise

    def _stream_mode(self) -> bool:
        """True while the remote streamer is the active STT/turn-detection path."""
        return self._streamer is not None and not self._streamer.failed and not self._fell_back

    async def _ensure_streamer_started(self) -> None:
        """Start the streamer once; a failed start flips the session to the local path."""
        if self._streamer is None or self._streamer_started:
            return
        self._streamer_started = True
        try:
            await self._streamer.start()
        except Exception:
            logger.exception("Streaming STT failed to start — using the local whisper path.")
            self._fallback_to_local()
            return
        # Streamer started successfully — arm the idle watchdog for the initial listening window.
        # (_recover arms it for all subsequent windows; this covers the very first turn which
        # never goes through _recover before the first frame arrives.)
        if self._stream_mode() and self._idle_watchdog_task is None:
            self._streamer.speech_activity.clear()
            self._start_idle_watchdog()

    def _ensure_shadow_started(self) -> None:
        """Schedule the shadow's start ONCE as a background task — NEVER block the hot frame path
        on the shadow's network connect. A slow/unreachable Soniox must not delay the primary's
        audio intake, so start() is fire-and-forget: frames fed before the socket is up are simply
        dropped by the shadow (it no-ops until connected), trimming only the first turn's shadow
        transcript slightly. A failed start disables the shadow silently (it's just an observer)."""
        if self._shadow is None or self._shadow_started:
            return
        self._shadow_started = True
        shadow = self._shadow

        async def _run() -> None:
            try:
                await shadow.start()
            except Exception:
                logger.exception("Shadow STT failed to start — continuing without a shadow.")

        task = asyncio.create_task(_run(), name="shadow-start")
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)

    def _flush_shadow(self) -> None:
        """Fire the shadow's mid-stream finalize (fire-and-forget) at end-of-turn so its tail tokens
        become final before we snapshot (~brain+speak later). Best-effort; never blocks the turn."""
        if self._shadow is None:
            return
        shadow = self._shadow

        async def _run() -> None:
            try:
                await shadow.flush_turn()
            except Exception:
                logger.exception("Shadow flush failed — snapshot may miss this turn's tail.")

        task = asyncio.create_task(_run(), name="shadow-flush")
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)

    def _snapshot_shadow(self) -> tuple[str | None, str | None, float | None]:
        """Consume the shadow's current-window ``(engine, transcript, latency_ms)`` for telemetry.

        Best-effort: any shadow error yields ``(None, None, None)`` so a shadow fault can never
        break a turn. Called once per committed turn from :meth:`_log_turn`.
        """
        if self._shadow is None:
            return None, None, None
        try:
            text, latency_ms = self._shadow.take_snapshot()
            return self._shadow.engine, text, latency_ms
        except Exception:
            logger.exception("Shadow STT snapshot failed — omitting shadow transcript this turn.")
            return None, None, None

    def _fallback_to_local(self) -> None:
        """Flip (once) to the local endpointer + whisper path after a fatal streamer failure.

        The streamer socket itself is torn down by the streamer (on fatal) and again —
        idempotently — at session teardown, so the fallback never leaves it open.
        """
        if self._fell_back:
            return
        self._fell_back = True
        logger.error(
            "Streaming STT permanently failed — falling back to local whisper + endpointer "
            "for interview %s.",
            self._interview_id,
        )
        if self._pump_event_task is not None:
            self._pump_event_task.cancel()
            self._pump_event_task = None
        if self._state is _State.LISTENING:
            # Reset the (never-fed) endpointer + buffers so the local path starts clean.
            self._recover(new_request_id=False)

    def _drain_stream_events(self) -> None:
        """Discard queued turn events from the previous listening window (stale on re-arm).

        The fatal poison pill is re-queued, never swallowed — ``streamer.failed`` also guards
        it, but the pill must stay visible to a pending waiter.
        """
        if self._streamer is None:
            return
        q = self._streamer.events
        while True:
            try:
                event = q.get_nowait()
            except asyncio.QueueEmpty:
                return
            if event.fatal:
                q.put_nowait(event)
                return

    def _maybe_commit_segment(self) -> None:
        """Streaming STT: kick off a background transcription of the newest completed speech segment
        at a pause. One at a time; a successful result appends to _committed_text and advances
        _committed_frames. Best-effort — any failure just leaves that audio for the EOT tail."""
        if self._stt_task is not None and not self._stt_task.done():
            return  # a segment transcription is already in flight
        if self._endpointer.trailing_silence_s < _STREAM_PAUSE_S:
            return  # mid-speech, not at a pause boundary
        end = len(self._accum)
        if end - self._committed_frames < _STREAM_MIN_SEG_FRAMES:
            return  # not enough new speech since the last commit
        segment = np.concatenate(self._accum[self._committed_frames : end]).astype(
            np.float32, copy=False
        )
        gen = self._turn_gen

        async def _run() -> None:
            try:
                text = (
                    await asyncio.to_thread(self._stt.transcribe, segment, self._language)
                ).strip()
            except Exception:
                logger.exception("Streaming STT segment failed — leaving audio for the tail.")
                return
            # Commit only if the turn hasn't recovered/re-armed since launch (stale result guard).
            if self._turn_gen == gen and text:
                self._committed_text = f"{self._committed_text} {text}".strip()
                self._committed_frames = end

        task = asyncio.create_task(_run(), name=f"stream-stt-{self._request_id}")
        self._stt_task = task
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)

    async def _process_turn(self, reason: str) -> TurnResult | None:
        """Snapshot the turn audio, transcribe, submit to the brain, voice the reply.

        Returns ``None`` for a false-fire commit (empty transcript) after silently re-arming.
        Raises :class:`BrainTransientError` (handled by ``feed_frame``) or any unexpected error.

        Emits one structured ``voice.turn`` telemetry line per turn — the commit kind, the per-stage
        STT/oracle/TTS latency, and the turn audio length. This is the production signal for tuning
        endpointing (smartturn vs backstop ratio, audio length at commit, false-fire rate) and for
        seeing where the post-EOT gap actually goes. No audio or transcript text is captured.
        """
        t0 = time.perf_counter()
        committed: AudioArray = (
            np.concatenate(self._accum).astype(np.float32, copy=False)
            if self._accum
            else np.zeros(0, dtype=np.float32)
        )
        audio_s = len(committed) / _SR

        # STT off the event loop — transcribe() is blocking; offloaded so it can't starve intake.
        if self._stream_stt and self._committed_frames > 0:
            # Streaming finalize: await any in-flight segment, then transcribe ONLY the tail
            # (everything up to _committed_frames was already transcribed at the pauses).
            if self._stt_task is not None:
                try:
                    await self._stt_task
                except Exception:  # noqa: BLE001 — a failed segment just means a longer tail
                    pass
            tail_frames = self._accum[self._committed_frames :]
            tail = (
                np.concatenate(tail_frames).astype(np.float32, copy=False)
                if tail_frames
                else np.zeros(0, dtype=np.float32)
            )
            tail_text = (
                (await asyncio.to_thread(self._stt.transcribe, tail, self._language)).strip()
                if len(tail)
                else ""
            )
            transcript = f"{self._committed_text} {tail_text}".strip()
        else:
            transcript = (
                await asyncio.to_thread(self._stt.transcribe, committed, self._language)
            ).strip()
        stt_ms = (time.perf_counter() - t0) * 1000.0
        return await self._complete_turn(reason, transcript, audio_s, stt_ms)

    async def _complete_turn(
        self, reason: str, transcript: str, audio_s: float, stt_ms: float
    ) -> TurnResult | None:
        """Sanity-check a transcript, submit it to the brain, voice the reply, log telemetry.

        Shared tail of both commit paths — local (endpointer EOT → whisper) and streamed
        (AssemblyAI end-of-turn event, where the transcript is already known and stt_ms ≈ 0).
        Same contract as :meth:`_process_turn`: ``None`` for a dropped (empty/hallucinated)
        transcript after silently re-arming; raises brain errors for ``feed_frame``/``pump``
        to handle.
        """
        rid = self._request_id

        # Ask the shadow (if any) to finalize its tail NOW so the per-turn snapshot taken in
        # _log_turn (after brain + speak) captures this turn's full transcript, not a lagged one.
        self._flush_shadow()

        if not transcript:
            # False fire (cough / clipped silence): never submit an empty answer; re-arm + listen.
            self._log_turn(
                rid, reason, audio_s, stt_ms, None, None, "false-fire", transcript="", empty=True
            )
            self._recover()
            self._rearm_pending = True  # browser was disarmed by {thinking}; tell it to re-arm
            return None

        if _is_hallucination(transcript):
            # STT hallucinated filler ("thank you", "you", …) on silence/noise — never submit it as
            # the candidate's answer. Logged distinctly (phase=hallucination) so the blocklist can
            # be tuned from prod telemetry. Re-arm + keep listening, like an empty false-fire.
            logger.debug("Dropping STT hallucination: %r (%.1fs audio)", transcript, audio_s)
            self._log_turn(
                rid, reason, audio_s, stt_ms, None, None, "hallucination",
                transcript=transcript, empty=True,
            )
            self._recover()
            self._rearm_pending = True  # browser was disarmed by {thinking}; tell it to re-arm
            return None

        if _is_filler_only(transcript):
            # The candidate is thinking out loud ("um", "uh", "hmm"), not answering — the STT
            # committed a filler as a turn (e.g. AAI punctuating "Um." as a sentence). Never submit
            # it as an answer (that fires a spurious follow-up). Keep listening: re-arm + re-arm the
            # browser mic, exactly like a false-fire. Logged phase=filler_continuation for tuning.
            logger.debug("Filler-only turn %r (%.1fs) — keep listening.", transcript, audio_s)
            self._log_turn(
                rid, reason, audio_s, stt_ms, None, None, "filler_continuation",
                transcript=transcript, empty=True,
            )
            self._recover()
            self._rearm_pending = True  # browser was disarmed by {thinking}; tell it to re-arm
            return None

        request_id = self._request_id
        t_stt = time.perf_counter()
        try:
            result = await self._brain.submit_answer(
                self._interview_id, self._token, transcript, request_id
            )
        except TerminalError as err:
            # 409 / 403: interview over (or token dead). Voice the conclusion; no reset.
            oracle_ms = (time.perf_counter() - t_stt) * 1000.0
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
            t_oracle = time.perf_counter()
            await self._safe_speak(turn)
            tts_ms = (time.perf_counter() - t_oracle) * 1000.0
            self._log_turn(
                rid, reason, audio_s, stt_ms, oracle_ms, tts_ms, "done",
                transcript=transcript, terminal=True,
            )
            return turn
        oracle_ms = (time.perf_counter() - t_stt) * 1000.0

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
        t_oracle = time.perf_counter()
        await self._safe_speak(turn)
        tts_ms = (time.perf_counter() - t_oracle) * 1000.0
        self._state = _State.TERMINAL if is_terminal else _State.SPEAKING
        self._log_turn(
            rid, reason, audio_s, stt_ms, oracle_ms, tts_ms, result.phase,
            transcript=transcript, terminal=is_terminal,
        )
        return turn

    def _log_turn(
        self,
        rid: str,
        commit: str,
        audio_s: float,
        stt_ms: float,
        oracle_ms: float | None,
        tts_ms: float | None,
        phase: str,
        *,
        transcript: str = "",
        empty: bool = False,
        terminal: bool = False,
    ) -> None:
        """Emit one structured per-turn telemetry line at INFO.

        Format is ``voice.turn`` + ``key=value`` fields so prod logs stay greppable/parseable:
        ``commit`` is the EOT kind (smartturn / backstop / maxlen / assemblyai_eot); the ``*_ms``
        are the post-EOT stage latencies, and ``gap_ms`` is their sum — the commit→interviewer-audio
        gap that the thinking filler masks.
        """
        gap_ms = stt_ms + (oracle_ms or 0.0) + (tts_ms or 0.0)
        logger.info(
            "voice.turn rid=%s commit=%s audio_s=%.1f stt_ms=%.0f oracle_ms=%s tts_ms=%s "
            "gap_ms=%.0f phase=%s%s%s",
            rid,
            commit,
            audio_s,
            stt_ms,
            f"{oracle_ms:.0f}" if oracle_ms is not None else "na",
            f"{tts_ms:.0f}" if tts_ms is not None else "na",
            gap_ms,
            phase,
            " empty=1" if empty else "",
            " terminal=1" if terminal else "",
        )
        # Consume the shadow's per-turn transcript (A/B). Once per turn, aligned to this commit.
        shadow_engine, shadow_transcript, shadow_stt_ms = self._snapshot_shadow()
        t = TurnTelemetry(
            request_id=rid,
            commit=commit,
            audio_s=audio_s,
            stt_ms=stt_ms,
            oracle_ms=oracle_ms,
            tts_ms=tts_ms,
            gap_ms=gap_ms,
            phase=phase,
            empty=empty,
            terminal=terminal,
            primary_transcript=transcript,
            shadow_engine=shadow_engine,
            shadow_transcript=shadow_transcript,
            shadow_stt_ms=shadow_stt_ms,
        )
        self._safe_telemetry(t)

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

    def _safe_telemetry(self, t: TurnTelemetry) -> None:
        """Persist turn telemetry via a fire-and-forget background task.

        Mirrors :meth:`_safe_thinking`: tracked in ``self._bg_tasks`` so it is never GC'd
        mid-flight and is cancelled by :meth:`close`.  All exceptions are swallowed — a
        telemetry failure must never block or break a turn.
        """

        async def _run() -> None:
            try:
                await self._telemetry.record(t)
            except Exception:
                logger.exception("Telemetry record failed for turn %s — continuing.", t.request_id)

        task = asyncio.create_task(_run(), name=f"telemetry-{t.request_id}")
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

    def take_rearm(self) -> bool:
        """True (once) if the last turn was a false-fire that needs the BROWSER mic re-armed.

        The pre-STT {thinking} cue optimistically disarms the browser mic; a false-fire commit then
        returns None with no turn_ready, so without this the browser stays disarmed ("stuck
        speaking"). The WS pipeline consumes this and re-sends {ready} to re-arm. Self-clearing.
        """
        pending = self._rearm_pending
        self._rearm_pending = False
        return pending

    def close(self) -> None:
        """Terminal teardown — ``feed_frame`` becomes a no-op. Cancels any in-flight backchannel
        cue; does NOT reset the endpointer.

        If a remote streamer exists its Terminate+close is SCHEDULED here as a safety net (the
        AssemblyAI billing trap: an unterminated session bills up to 3 h) — but the guaranteed
        path is :meth:`aclose`, which awaits it. Prefer ``aclose`` from async teardown.
        """
        self._state = _State.CLOSED
        self._cancel_idle_watchdog()
        for task in list(self._bg_tasks):
            task.cancel()
        for pump_task in (self._pump_frame_task, self._pump_event_task):
            if pump_task is not None:
                pump_task.cancel()
        self._pump_frame_task = None
        self._pump_event_task = None
        if self._streamer is not None and self._streamer_close_task is None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                logger.error(
                    "VoiceSession.close() outside a running loop — the streamer socket cannot "
                    "be closed here; call aclose() instead (AssemblyAI bills unclosed sessions)."
                )
            else:
                # Scheduled once (guarded by _streamer_close_task) and deliberately NOT tracked
                # in _bg_tasks: a repeated close() must never cancel the in-flight Terminate —
                # that is the whole point of the safety net.
                self._streamer_close_task = loop.create_task(
                    self._streamer.close(), name="session-streamer-close"
                )
        if self._shadow is not None and self._shadow_close_task is None:
            # Best-effort shadow teardown (flush + EOS + close). aclose() awaits it; a bare
            # close() outside a running loop just skips it (the shadow is disposable).
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
            else:
                self._shadow_close_task = loop.create_task(
                    self._shadow.close(), name="session-shadow-close"
                )

    async def aclose(self) -> None:
        """Async terminal teardown: :meth:`close` + AWAIT the streamer's Terminate+close.

        This is the guaranteed-teardown path the WS layer uses — it must run on every session
        end (normal, error, or disconnect) so a streaming-STT socket is never left open.
        """
        self.close()  # schedules the streamer + shadow close (if any) exactly once
        task = self._streamer_close_task
        if task is not None:
            try:
                await task
            except Exception:
                logger.exception("Streamer close failed during session teardown — continuing.")
        shadow_task = self._shadow_close_task
        if shadow_task is not None:
            try:
                await shadow_task
            except Exception:
                logger.exception("Shadow close failed during session teardown — continuing.")

    def _recover(self, *, new_request_id: bool = True) -> None:
        """Clear the buffer, reset the endpointer, return to LISTENING.

        ``new_request_id=False`` preserves the current id so a transient retry can still hit the
        server's idempotent replay (don't double-submit an answer that may have been processed).
        """
        self._accum.clear()
        self._committed_text = ""
        self._committed_frames = 0
        self._turn_gen += 1  # invalidate any in-flight streaming-STT segment from the prior turn
        self._stream_frames = 0
        self._drain_stream_events()  # streamed events from the prior listening window are stale
        if self._shadow is not None:
            self._shadow.reset()  # align the shadow's window to this fresh listening window
        if new_request_id:
            self._request_id = _new_request_id()
        self._endpointer.reset()
        self._state = _State.LISTENING
        # Idle probe: start a fresh 10 s watchdog for this listening window (assemblyai only).
        # Reset the once-per-turn guard and clear any leftover speech signal from the prior turn
        # so the new window starts clean.
        self._probe_fired = False
        self._cancel_idle_watchdog()
        if self._stream_mode():
            self._streamer.speech_activity.clear()  # type: ignore[union-attr]
            self._start_idle_watchdog()

    def _cancel_idle_watchdog(self) -> None:
        """Cancel any running idle watchdog without removing it from _bg_tasks (it self-removes)."""
        task = self._idle_watchdog_task
        if task is not None and not task.done():
            task.cancel()
        self._idle_watchdog_task = None

    def _start_idle_watchdog(self) -> None:
        """Launch the 10 s idle-probe watchdog for the current listening window."""
        gen = self._turn_gen

        async def _watchdog() -> None:
            streamer = self._streamer
            assert streamer is not None  # only called in stream_mode
            try:
                # Wait for speech_activity OR the 10 s timeout, whichever comes first.
                await asyncio.wait_for(
                    asyncio.shield(streamer.speech_activity.wait()),
                    timeout=_IDLE_PROBE_S,
                )
                # Candidate started speaking — no probe needed.
                return
            except TimeoutError:
                pass
            # 10 s elapsed with no speech signal.  Only probe if we are still in the same
            # listening window (turn_gen unchanged), still LISTENING, and haven't fired yet.
            if self._turn_gen != gen or self._state is not _State.LISTENING or self._probe_fired:
                return
            self._probe_fired = True
            line = _IDLE_PROBE_LINES[self._probe_index % len(_IDLE_PROBE_LINES)]
            self._probe_index += 1
            probe_turn = TurnResult(
                utterance=Utterance(text=line, expects="voice"),
                phase="idle_probe",
                transcript="",
                request_id=self._request_id,
                is_terminal=False,
            )
            logger.info(
                "voice.idle_probe rid=%s — no speech in %.0fs, probing once.",
                self._request_id,
                _IDLE_PROBE_S,
            )
            await self._safe_speak(probe_turn)

        task = asyncio.create_task(_watchdog(), name=f"idle-probe-{self._request_id}")
        self._idle_watchdog_task = task
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)
        task.add_done_callback(lambda _: setattr(self, "_idle_watchdog_task", None))
