"""Offline unit tests for the P2-B.2 voice turn glue (VoiceSession + RestBrainClient).

No models, no network: fakes for the endpointer, STT, brain, and TTS sink; httpx.MockTransport
for the REST client. Validates the must-avoid invariants from the design — full-turn accumulation
(incl. >8 s), STT offload doesn't block the loop, requestId discipline, empty-transcript
short-circuit, terminal handling, transient retry, and reset-after-speak ordering.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path

import numpy as np
import pytest

_VOICE_DIR = Path(__file__).parent
if str(_VOICE_DIR) not in sys.path:
    sys.path.insert(0, str(_VOICE_DIR))

import httpx  # noqa: E402

from brain_client import RestBrainClient  # noqa: E402
from contracts import (  # noqa: E402
    AnswerResult,
    BrainTransientError,
    TerminalError,
    TurnResult,
    Utterance,
)
from endpointing import EotEvent  # noqa: E402
from session import _MAX_TURN_FRAMES, VoiceSession  # noqa: E402

_FRAME = 512


def _frame(val: float = 0.1) -> np.ndarray:
    return np.full(_FRAME, val, dtype=np.float32)


# ─────────────────────────── fakes ───────────────────────────


class FakeEndpointer:
    """Fires an EotEvent after ``fire_after`` frames since the last reset()."""

    def __init__(self, fire_after: int) -> None:
        self.fire_after = fire_after
        self._n = 0
        self.reset_calls = 0
        self.reset_at: list[float] = []

    def feed_frame(self, frame: np.ndarray) -> EotEvent | None:
        self._n += 1
        if self._n >= self.fire_after:
            return EotEvent(
                cursor_s=self._n * 0.032,
                kind="smartturn",
                prob=0.9,
                silence_onset_s=max(0.0, (self._n - 25) * 0.032),
            )
        return None

    def reset(self) -> None:
        self.reset_calls += 1
        self.reset_at.append(time.perf_counter())
        self._n = 0


class FakeSTT:
    def __init__(self, transcript: str, *, delay_s: float = 0.0) -> None:
        self.transcript = transcript
        self.delay_s = delay_s
        self.received: list[np.ndarray] = []

    def transcribe(self, audio: np.ndarray, language: str = "en") -> str:
        if self.delay_s:
            time.sleep(self.delay_s)  # blocking — must be offloaded to a thread
        self.received.append(np.asarray(audio))
        return self.transcript


class FakeBrain:
    def __init__(
        self,
        results: Sequence[AnswerResult] | None = None,
        *,
        raise_terminal: bool = False,
        raise_transient_times: int = 0,
    ) -> None:
        self._results = list(results or [])
        self.raise_terminal = raise_terminal
        self.raise_transient_times = raise_transient_times
        self.calls: list[tuple[str, str, str, str]] = []

    async def submit_answer(
        self, interview_id: str, token: str, answer: str, request_id: str
    ) -> AnswerResult:
        self.calls.append((interview_id, token, answer, request_id))
        if self.raise_transient_times > 0:
            self.raise_transient_times -= 1
            raise BrainTransientError("boom")
        if self.raise_terminal:
            raise TerminalError("concluded")
        if self._results:
            return self._results.pop(0)
        return AnswerResult(utterance=Utterance("ok", "voice"), phase="oral", state={})


class CaptureSink:
    """Records both cues (speak + on_thinking) with timestamps + call order."""

    def __init__(self) -> None:
        self.spoken: list[TurnResult] = []
        self.speak_at: list[float] = []
        self.thinking_at: list[float] = []
        self.order: list[str] = []

    async def speak(self, turn: TurnResult) -> None:
        self.spoken.append(turn)
        self.speak_at.append(time.perf_counter())
        self.order.append("speak")

    async def on_thinking(self) -> None:
        self.thinking_at.append(time.perf_counter())
        self.order.append("thinking")


class SlowSink:
    """Sink whose speak() actually takes time, so we can prove the endpointer reset WAITS for TTS
    to finish (not merely that reset was called after speak was entered)."""

    def __init__(self, delay_s: float = 0.05) -> None:
        self.delay_s = delay_s
        self.finished_at: list[float] = []

    async def speak(self, turn: TurnResult) -> None:
        await asyncio.sleep(self.delay_s)
        self.finished_at.append(time.perf_counter())

    async def on_thinking(self) -> None:
        pass


class CrashSink:
    """Sink whose speak() always fails — TTS failure must be non-fatal to the session."""

    async def speak(self, turn: TurnResult) -> None:
        raise RuntimeError("audio device gone")

    async def on_thinking(self) -> None:
        pass


class ThinkingCrashSink:
    """Sink whose on_thinking() always fails — a backchannel-cue failure must be non-fatal."""

    def __init__(self) -> None:
        self.spoken: list[TurnResult] = []

    async def speak(self, turn: TurnResult) -> None:
        self.spoken.append(turn)

    async def on_thinking(self) -> None:
        raise RuntimeError("cue dispatch failed")


class CrashSTT:
    """STT that always raises — an unexpected fault must re-arm (not strand) the session."""

    def transcribe(self, audio: np.ndarray, language: str = "en") -> str:
        raise RuntimeError("model exploded")


async def _drive(session: VoiceSession, n_frames: int, val: float = 0.1) -> TurnResult | None:
    out: TurnResult | None = None
    for _ in range(n_frames):
        result = await session.feed_frame(_frame(val))
        if result is not None:
            out = result
    return out


def _session(ep: FakeEndpointer, stt: FakeSTT, brain: FakeBrain, sink: CaptureSink | None = None):
    return VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        sink=sink,
    )


# ─────────────────────────── VoiceSession ───────────────────────────


async def test_full_turn_accumulation_beyond_8s() -> None:
    # 8 s ≈ 250 frames; fire only after 300 (~9.6 s) to prove we keep MORE than the trailing ring.
    ep = FakeEndpointer(fire_after=300)
    stt = FakeSTT("I would use a hash map.")
    brain = FakeBrain()
    turn = await _drive(_session(ep, stt, brain), 300)
    assert turn is not None
    assert len(stt.received) == 1
    assert stt.received[0].shape[0] == 300 * _FRAME  # FULL turn, not just the trailing 8 s window
    assert brain.calls and brain.calls[0][2] == "I would use a hash map."


async def test_accumulator_cleared_between_turns() -> None:
    ep = FakeEndpointer(fire_after=10)
    stt = FakeSTT("first")
    brain = FakeBrain(
        results=[
            AnswerResult(Utterance("q2", "voice"), "oral", {}),
            AnswerResult(Utterance("q3", "voice"), "oral", {}),
        ]
    )
    session = _session(ep, stt, brain)
    await _drive(session, 10)
    session.arm_next_turn()
    stt.transcript = "second"
    await _drive(session, 10)
    assert len(stt.received) == 2
    assert stt.received[1].shape[0] == 10 * _FRAME  # exactly the 2nd turn — no bleed-over


async def test_request_id_discipline() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    brain = FakeBrain(
        results=[
            AnswerResult(Utterance("q2", "voice"), "oral", {}),
            AnswerResult(Utterance("q3", "voice"), "oral", {}),
        ]
    )
    session = _session(ep, stt, brain)
    rid0 = session.request_id
    await _drive(session, 5)
    assert brain.calls[0][3] == rid0
    session.arm_next_turn()
    rid1 = session.request_id
    assert rid1 != rid0  # fresh requestId on the next turn
    await _drive(session, 5)
    assert brain.calls[1][3] == rid1


async def test_empty_transcript_short_circuits() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("   ")  # whitespace only
    brain = FakeBrain()
    session = _session(ep, stt, brain)
    turn = await _drive(session, 5)
    assert turn is None
    assert brain.calls == []  # never submitted an empty answer
    assert session.state == "listening"  # stayed armed
    assert ep.reset_calls == 1


async def test_terminal_phase_done() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("final answer")
    brain = FakeBrain(
        results=[AnswerResult(Utterance("Your interview is complete.", "text"), "done", {})]
    )
    sink = CaptureSink()
    session = _session(ep, stt, brain, sink)
    turn = await _drive(session, 5)
    assert turn is not None and turn.is_terminal
    assert len(sink.spoken) == 1
    assert session.state == "terminal"
    assert await session.feed_frame(_frame()) is None  # no-op after terminal
    assert ep.reset_calls == 0  # terminal turn never resets the endpointer


async def test_409_maps_to_terminal() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("late answer")
    brain = FakeBrain(raise_terminal=True)
    sink = CaptureSink()
    session = _session(ep, stt, brain, sink)
    turn = await _drive(session, 5)
    assert turn is not None and turn.is_terminal
    assert len(sink.spoken) == 1  # conclusion was voiced
    assert ep.reset_calls == 0


async def test_transient_error_rearms_and_preserves_request_id() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("answer")
    brain = FakeBrain(raise_transient_times=1)
    session = _session(ep, stt, brain)
    rid0 = session.request_id
    with pytest.raises(BrainTransientError):
        await _drive(session, 5)
    assert session.state == "listening"  # re-armed, NOT terminal
    assert ep.reset_calls == 1
    assert session.request_id == rid0  # SAME requestId kept → idempotent replay on retry


async def test_reset_waits_for_tts_to_finish() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    sink = SlowSink(delay_s=0.05)
    session = VoiceSession(
        interview_id="iv1", session_token="tok", endpointer=ep, stt=stt, brain=brain, sink=sink
    )
    await _drive(session, 5)  # feed_frame awaits the 0.05 s speak BEFORE returning
    session.arm_next_turn()  # resets the endpointer only AFTER speak finished
    assert sink.finished_at and ep.reset_at
    assert ep.reset_at[0] >= sink.finished_at[0]  # reset truly waited for TTS to complete


async def test_close_and_arm_are_noops_after_terminal() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("final")
    brain = FakeBrain(results=[AnswerResult(Utterance("done.", "text"), "done", {})])
    session = _session(ep, stt, brain)
    await _drive(session, 5)
    assert session.state == "terminal"
    session.arm_next_turn()  # no-op on terminal — must not reset or re-listen
    assert session.state == "terminal"
    assert ep.reset_calls == 0
    session.close()
    assert session.state == "closed"
    session.arm_next_turn()  # no-op on closed
    assert session.state == "closed"


async def test_scoring_phase_is_terminal() -> None:
    # Defensive: the backend normalizes terminal to 'done', but 'scoring' must also end the session.
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("answer")
    brain = FakeBrain(results=[AnswerResult(Utterance("", "text"), "scoring", {})])
    session = _session(ep, stt, brain)
    turn = await _drive(session, 5)
    assert turn is not None and turn.is_terminal
    assert session.state == "terminal"


async def test_max_turn_cap_force_commits() -> None:
    # A non-stop speaker never triggers the silence-based endpointer; the cap must force a commit.
    ep = FakeEndpointer(fire_after=10**9)  # never fires on its own
    stt = FakeSTT("a very long monologue")
    brain = FakeBrain()
    session = _session(ep, stt, brain)
    turn = await _drive(session, _MAX_TURN_FRAMES)
    assert turn is not None  # forced commit fired
    assert len(brain.calls) == 1
    assert stt.received[0].shape[0] == _MAX_TURN_FRAMES * _FRAME


async def test_stt_crash_rearms_not_bricks() -> None:
    ep = FakeEndpointer(fire_after=5)
    brain = FakeBrain()
    session = VoiceSession(
        interview_id="iv1", session_token="tok", endpointer=ep, stt=CrashSTT(), brain=brain
    )
    with pytest.raises(RuntimeError):
        await _drive(session, 5)
    assert session.state == "listening"  # backstop re-armed it — never stranded in processing
    assert brain.calls == []  # crash happened before any submit


async def test_sink_failure_is_non_fatal() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        sink=CrashSink(),
    )
    turn = await _drive(session, 5)
    assert turn is not None  # turn still returned despite TTS failure
    assert session.state == "speaking"  # not bricked; the caller can arm the next turn


# ─────────────────────── thinking backchannel (P2-B.3) ───────────────────────


async def test_thinking_cue_fires_before_utterance_each_turn() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    brain = FakeBrain(
        results=[
            AnswerResult(Utterance("q2", "voice"), "oral", {}),
            AnswerResult(Utterance("q3", "voice"), "oral", {}),
        ]
    )
    sink = CaptureSink()
    session = VoiceSession(
        interview_id="iv1", session_token="tok", endpointer=ep, stt=stt, brain=brain, sink=sink
    )
    await _drive(session, 5)
    session.arm_next_turn()
    await _drive(session, 5)
    await asyncio.sleep(0)  # flush the fire-and-forget cue tasks
    assert len(sink.thinking_at) == 2  # one backchannel per real turn
    assert sink.order == ["thinking", "speak", "thinking", "speak"]  # cue precedes the reply


async def test_thinking_cue_does_not_block_pipeline() -> None:
    class SlowThinking:
        async def speak(self, turn: TurnResult) -> None:
            pass

        async def on_thinking(self) -> None:
            await asyncio.sleep(0.3)  # a slow cue must NOT delay the turn

    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        sink=SlowThinking(),
    )
    t0 = time.perf_counter()
    turn = await _drive(session, 5)
    elapsed = time.perf_counter() - t0
    assert turn is not None
    assert elapsed < 0.15  # the turn did NOT wait for the 0.3 s on_thinking (fire-and-forget)


async def test_thinking_cue_failure_is_non_fatal() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    sink = ThinkingCrashSink()
    session = VoiceSession(
        interview_id="iv1", session_token="tok", endpointer=ep, stt=stt, brain=brain, sink=sink
    )
    turn = await _drive(session, 5)
    await asyncio.sleep(0)  # let the failing cue task run + swallow its exception
    assert turn is not None  # a crashing backchannel never breaks the turn
    assert session.state == "speaking"
    assert len(sink.spoken) == 1


async def test_close_cancels_inflight_thinking_task() -> None:
    started = asyncio.Event()

    class HangThinking:
        async def speak(self, turn: TurnResult) -> None:
            pass

        async def on_thinking(self) -> None:
            started.set()
            await asyncio.sleep(3600)  # hang until cancelled

    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        sink=HangThinking(),
    )
    await _drive(session, 5)
    await started.wait()  # the cue task is running (hung)
    tasks = list(session._bg_tasks)
    assert tasks
    session.close()
    await asyncio.sleep(0)  # let cancellation propagate
    assert all(t.cancelled() for t in tasks)
    assert session.state == "closed"


async def test_stt_offload_does_not_block_loop() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans", delay_s=0.3)  # blocking sleep inside transcribe
    brain = FakeBrain()
    session = _session(ep, stt, brain)

    ticks = 0

    async def ticker() -> None:
        nonlocal ticks
        for _ in range(20):
            await asyncio.sleep(0.01)
            ticks += 1

    _, turn = await asyncio.gather(ticker(), _drive(session, 5))
    assert turn is not None
    # If transcribe ran inline the loop would freeze for 0.3 s and ticks would stall near 0.
    assert ticks >= 10


# ─────────────────────────── RestBrainClient ───────────────────────────


def _mock_client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(handler))


async def test_rest_brain_client_success() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "utterance": {"text": "next question", "expects": "voice"},
                "phase": "oral",
                "state": {"x": 1},
            },
        )

    client = RestBrainClient(client=_mock_client(handler))
    res = await client.submit_answer("iv1", "tok", "my answer", "rid-1")
    assert res.utterance.text == "next question"
    assert res.utterance.expects == "voice"
    assert res.phase == "oral"
    assert str(seen["url"]).endswith("/api/interviews/iv1/answer")
    assert seen["body"] == {"token": "tok", "answer": "my answer", "requestId": "rid-1"}


async def test_rest_brain_client_409_terminal() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"error": "Interview has concluded."})

    client = RestBrainClient(client=_mock_client(handler))
    with pytest.raises(TerminalError):
        await client.submit_answer("iv1", "tok", "a", "rid")


async def test_rest_brain_client_5xx_retries_same_request_id_then_transient() -> None:
    rids: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        rids.append(json.loads(request.content)["requestId"])
        return httpx.Response(503, json={"error": "down"})

    client = RestBrainClient(client=_mock_client(handler))
    with pytest.raises(BrainTransientError):
        await client.submit_answer("iv1", "tok", "a", "rid-X")
    assert rids == [
        "rid-X",
        "rid-X",
    ]  # one retry, SAME requestId (server replays, no double-submit)


async def test_rest_brain_client_transport_error_then_transient() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    client = RestBrainClient(client=_mock_client(handler))
    with pytest.raises(BrainTransientError):
        await client.submit_answer("iv1", "tok", "a", "rid")


async def test_rest_brain_client_unknown_expects_defaults_to_text() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"utterance": {"text": "hi", "expects": "bogus"}, "phase": "greet"}
        )

    client = RestBrainClient(client=_mock_client(handler))
    res = await client.submit_answer("iv1", "tok", "a", "rid")
    assert res.utterance.expects == "text"  # invalid expects coerced to a safe default
    assert res.state == {}  # missing state → {}


async def test_rest_brain_client_403_terminal() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"error": "Invalid or expired token."})

    client = RestBrainClient(client=_mock_client(handler))
    with pytest.raises(TerminalError):  # dead token → terminal, not an infinite retry loop
        await client.submit_answer("iv1", "tok", "a", "rid")


async def test_rest_brain_client_429_is_transient_without_retry_loop() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(429, headers={"Retry-After": "30"}, json={"error": "slow down"})

    client = RestBrainClient(client=_mock_client(handler))
    with pytest.raises(BrainTransientError):
        await client.submit_answer("iv1", "tok", "a", "rid")
    assert len(calls) == 1  # 429 is surfaced immediately, NOT retried into the limiter


async def test_rest_brain_client_malformed_200_is_transient() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"phase": "oral"})  # missing 'utterance' key

    client = RestBrainClient(client=_mock_client(handler))
    with pytest.raises(BrainTransientError):  # malformed body → recoverable, not a hard crash
        await client.submit_answer("iv1", "tok", "a", "rid")


async def test_malformed_brain_response_rearms_session_not_bricks() -> None:
    # End-to-end: a malformed 200 must flow through as BrainTransientError and leave the session
    # LISTENING (re-armed), never stranded in PROCESSING.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"phase": "oral"})

    brain = RestBrainClient(client=_mock_client(handler))
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("ans")
    session = VoiceSession(
        interview_id="iv1", session_token="tok", endpointer=ep, stt=stt, brain=brain
    )
    with pytest.raises(BrainTransientError):
        await _drive(session, 5)
    assert session.state == "listening"  # not bricked in processing


# ─────────────────────────── Telemetry sink ───────────────────────────

from telemetry import NoopTelemetrySink, RestTelemetrySink, TurnTelemetry  # noqa: E402


class FakeTelemetrySink:
    """Records every TurnTelemetry it receives; never raises."""

    def __init__(self) -> None:
        self.records: list[TurnTelemetry] = []

    async def record(self, t: TurnTelemetry) -> None:
        self.records.append(t)


async def test_telemetry_sink_receives_one_record_per_turn() -> None:
    """A normal (non-empty, non-terminal) turn fires exactly one telemetry record."""
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("hello world")
    brain = FakeBrain(results=[AnswerResult(Utterance("next q", "voice"), "oral", {})])
    tel = FakeTelemetrySink()
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        telemetry=tel,
    )
    await _drive(session, 5)
    # The task is fire-and-forget; yield control so it executes.
    await asyncio.sleep(0)
    assert len(tel.records) == 1
    rec = tel.records[0]
    assert rec.commit == "smartturn"
    assert rec.phase == "oral"
    assert rec.empty is False
    assert rec.terminal is False
    assert rec.stt_ms >= 0.0
    assert rec.audio_s > 0.0


async def test_telemetry_sink_receives_record_for_false_fire() -> None:
    """An empty-transcript (false-fire) commit still produces a telemetry record."""
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("   ")  # whitespace → empty after strip
    brain = FakeBrain()
    tel = FakeTelemetrySink()
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        telemetry=tel,
    )
    await _drive(session, 5)
    await asyncio.sleep(0)
    assert len(tel.records) == 1
    rec = tel.records[0]
    assert rec.empty is True
    # commit carries the EOT reason from the endpointer (e.g. "smartturn"); phase is "false-fire".
    assert rec.phase == "false-fire"
    assert rec.oracle_ms is None
    assert rec.tts_ms is None


async def test_telemetry_sink_receives_record_for_terminal_turn() -> None:
    """A terminal turn fires a telemetry record with terminal=True."""
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("final answer")
    brain = FakeBrain(results=[AnswerResult(Utterance("done.", "text"), "done", {})])
    tel = FakeTelemetrySink()
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        telemetry=tel,
    )
    await _drive(session, 5)
    await asyncio.sleep(0)
    assert len(tel.records) == 1
    assert tel.records[0].terminal is True
    assert tel.records[0].phase == "done"


async def test_existing_tests_pass_without_telemetry_kwarg() -> None:
    """VoiceSession constructed without telemetry= defaults to NoopTelemetrySink — no crash."""
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("answer")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    # No telemetry= kwarg — must work exactly as before.
    session = _session(ep, stt, brain)
    assert isinstance(session._telemetry, NoopTelemetrySink)
    turn = await _drive(session, 5)
    assert turn is not None
    assert session.state == "speaking"


async def test_telemetry_failure_does_not_break_turn() -> None:
    """A crashing telemetry sink must be swallowed — the turn completes normally."""

    class CrashTelemetry:
        async def record(self, t: TurnTelemetry) -> None:
            raise RuntimeError("telemetry service down")

    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("answer")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        telemetry=CrashTelemetry(),
    )
    turn = await _drive(session, 5)
    await asyncio.sleep(0)  # let the failing task run
    assert turn is not None
    assert session.state == "speaking"  # session not bricked


async def test_telemetry_close_cancels_inflight_task() -> None:
    """close() cancels an in-flight telemetry task (it is tracked in _bg_tasks)."""
    started = asyncio.Event()

    class HangTelemetry:
        async def record(self, t: TurnTelemetry) -> None:
            started.set()
            await asyncio.sleep(3600)

    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("answer")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        telemetry=HangTelemetry(),
    )
    await _drive(session, 5)
    await started.wait()
    tasks = list(session._bg_tasks)
    session.close()
    await asyncio.sleep(0)
    assert all(t.cancelled() for t in tasks)


# ─────────────────────────── RestTelemetrySink ───────────────────────────


async def test_rest_telemetry_sink_posts_correct_path_and_body() -> None:
    """RestTelemetrySink POSTs to the right path with the right camelCase body."""
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(204)

    client = httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(handler))
    sink = RestTelemetrySink("iv1", "tok", client=client)
    t = TurnTelemetry(
        request_id="rid-1",
        commit="smartturn",
        audio_s=2.5,
        stt_ms=120.0,
        oracle_ms=350.0,
        tts_ms=80.0,
        gap_ms=550.0,
        phase="oral",
        empty=False,
        terminal=False,
    )
    await sink.record(t)
    assert seen["path"] == "/api/interviews/iv1/voice-turn"
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["token"] == "tok"
    assert body["requestId"] == "rid-1"
    assert body["commit"] == "smartturn"
    assert body["audioS"] == pytest.approx(2.5)
    assert body["sttMs"] == pytest.approx(120.0)
    assert body["oracleMs"] == pytest.approx(350.0)
    assert body["ttsMs"] == pytest.approx(80.0)
    assert body["gapMs"] == pytest.approx(550.0)
    assert body["phase"] == "oral"
    assert body["empty"] is False
    assert body["terminal"] is False


async def test_rest_telemetry_sink_swallows_500() -> None:
    """A 500 from the backend must be swallowed — record() must not raise."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "db down"})

    client = httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(handler))
    sink = RestTelemetrySink("iv1", "tok", client=client)
    t = TurnTelemetry("r", "backstop", 1.0, 100.0, None, None, 100.0, "oral", False, False)
    # Must not raise despite the 500.
    await sink.record(t)


async def test_rest_telemetry_sink_swallows_transport_error() -> None:
    """A transport-level failure must be swallowed — record() must not raise."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    client = httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(handler))
    sink = RestTelemetrySink("iv1", "tok", client=client)
    t = TurnTelemetry("r", "maxlen", 5.0, 200.0, None, None, 200.0, "coding", False, False)
    await sink.record(t)  # must not raise


async def test_rest_telemetry_sink_null_optional_fields() -> None:
    """oracle_ms and tts_ms may be None (false-fire); they must be serialised as JSON null."""
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(204)

    client = httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(handler))
    sink = RestTelemetrySink("iv1", "tok", client=client)
    t = TurnTelemetry("r", "false-fire", 0.5, 50.0, None, None, 50.0, "oral", True, False)
    await sink.record(t)
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["oracleMs"] is None
    assert body["ttsMs"] is None
    assert body["empty"] is True
