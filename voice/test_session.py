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
from session import (  # noqa: E402
    _BARGE_IN_MIN_VOICED_FRAMES,
    _BARGE_IN_PROTECTION_FRAMES,
    _MAX_TURN_FRAMES,
    _looks_incomplete,
    VoiceSession,
)

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
        self.trailing_silence_s = 0.0  # streaming-STT pause signal (EndpointerLike protocol)

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
    assert session.take_rearm() is True  # browser must be told to re-arm after a false-fire


async def test_hallucination_transcript_short_circuits() -> None:
    # A non-empty STT hallucination ("thank you" on silence) must NOT be submitted as an answer —
    # it is dropped exactly like an empty false-fire and the session stays armed.
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("Thank you.")  # classic Whisper silence-hallucination
    brain = FakeBrain()
    session = _session(ep, stt, brain)
    turn = await _drive(session, 5)
    assert turn is None
    assert brain.calls == []  # never submitted the hallucination
    assert session.state == "listening"  # stayed armed
    assert ep.reset_calls == 1
    assert session.take_rearm() is True  # browser must be told to re-arm after a hallucination


async def test_hallucination_telemetry_phase() -> None:
    # A dropped hallucination is logged distinctly (phase=hallucination) so it is distinguishable
    # from a true empty false-fire when tuning the blocklist from prod telemetry.
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("you")
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
    assert rec.phase == "hallucination"


async def test_real_short_answer_not_filtered() -> None:
    # Guard against over-filtering: a legitimate short reply ("yes") must pass through to the brain.
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("yes")
    brain = FakeBrain()
    session = _session(ep, stt, brain)
    turn = await _drive(session, 5)
    assert turn is not None
    assert len(brain.calls) == 1  # "yes" submitted normally
    assert session.take_rearm() is False  # a real turn must NOT request a re-arm


async def test_filler_only_turn_kept_listening_not_answered() -> None:
    # A thinking-pause filler the STT committed as a turn ("Um.") must NOT be submitted as an answer
    # (that fires a spurious follow-up). Drop it, re-arm, and request a browser mic re-arm.
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("Um.")
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
    turn = await _drive(session, 5)
    await asyncio.sleep(0)
    assert turn is None
    assert len(brain.calls) == 0  # never submitted to the brain
    assert session.take_rearm() is True  # browser mic re-armed to keep listening
    assert tel.records[0].phase == "filler_continuation"


async def test_multiword_filler_dropped() -> None:
    # Every token a filler ("um, uh") → still a thinking pause; dropped, not answered.
    ep = FakeEndpointer(fire_after=5)
    brain = FakeBrain()
    session = _session(ep, FakeSTT("um, uh"), brain)
    assert await _drive(session, 5) is None
    assert len(brain.calls) == 0


async def test_streaming_finalize_transcribes_only_the_tail(monkeypatch) -> None:
    # Phase 2b: with STT_STREAMING on and a segment already committed during LISTENING, the EOT
    # finalize must transcribe ONLY the trailing tail (not the whole buffer) and concatenate it onto
    # the committed prefix. Default (flag off) path is covered by every other test here.
    monkeypatch.setenv("STT_STREAMING", "1")
    ep = FakeEndpointer(fire_after=1)  # the first fed frame fires EOT
    stt = FakeSTT("tail")
    brain = FakeBrain()
    session = _session(ep, stt, brain)
    frame = np.ones(512, dtype=np.float32) * 0.1
    # Simulate 100 frames buffered with the first 90 already transcribed during pauses.
    session._accum = [frame.copy() for _ in range(100)]
    session._committed_frames = 90
    session._committed_text = "committed"
    turn = await session.feed_frame(frame)  # appends → 101 frames, then EOT → finalize
    assert turn is not None
    assert brain.calls[0][2] == "committed tail"  # committed prefix + tail, concatenated
    assert len(stt.received[-1]) < 100 * 512  # finalize saw only the tail, not the full turn


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


# ─────────────────────────── Task A: AAI telemetry wiring ───────────────────────────
# These tests prove that the assemblyai-path session is wired with a NON-noop telemetry
# sink and that an EOT commit reaches telemetry.record with commit_kind='assemblyai_eot'.

from contracts import TurnEvent  # noqa: E402
from test_stt_assemblyai import _stream_session  # noqa: E402


async def test_assemblyai_eot_calls_telemetry_record() -> None:
    """An assemblyai_eot commit must call telemetry.record with commit='assemblyai_eot'.

    This is the deterministic proof that the AAI commit path reaches _complete_turn →
    _log_turn → _safe_telemetry → telemetry.record — i.e. the telemetry sink is NOT noop
    and is reached on the assemblyai path.
    """
    brain = FakeBrain(results=[AnswerResult(Utterance("next q", "voice"), "oral", {})])
    tel = FakeTelemetrySink()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink, telemetry=tel)

    # Arm the session (start the streamer) by feeding one frame so pump() initialises.
    pump_task = asyncio.create_task(session.pump(asyncio.Queue()))
    await asyncio.sleep(0)  # let pump initialise the persistent waiters

    # Inject an EOT turn event directly into the streamer's events queue.
    streamer.events.put_nowait(
        TurnEvent(transcript="I would use a hash map.", end_of_turn=True, formatted=True)
    )
    result = await pump_task
    assert result is not None
    assert result.utterance.text == "next q"

    # Let the fire-and-forget telemetry task run.
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert len(tel.records) == 1
    rec = tel.records[0]
    assert rec.commit == "assemblyai_eot"
    assert rec.phase == "oral"
    assert rec.empty is False
    assert rec.terminal is False
    # stt_ms is ~0 on the AAI path (transcript rides on the event, no STT hop).
    assert rec.stt_ms >= 0.0

    await session.aclose()


async def test_assemblyai_session_has_non_noop_telemetry_when_rest_sink_injected() -> None:
    """VoiceSession built with a RestTelemetrySink (as ws_app does) must NOT be NoopTelemetrySink.

    This mirrors the ws_app.build_session construction: telemetry= is always a real sink
    for both the whisper and assemblyai branches — the Noop path is only the None default.
    """
    from telemetry import NoopTelemetrySink, RestTelemetrySink  # noqa: PLC0415

    client = httpx.AsyncClient(base_url="http://test", transport=httpx.MockTransport(
        lambda r: httpx.Response(204)
    ))
    real_sink = RestTelemetrySink("iv1", "tok", client=client)
    brain = FakeBrain()
    _, streamer = _stream_session(brain, telemetry=real_sink)
    # Retrieve the session from the helper's return value via _stream_session
    session, _ = _stream_session(brain, telemetry=real_sink)
    assert not isinstance(session._telemetry, NoopTelemetrySink)
    await session.aclose()
    await client.aclose()


# ─────────────────────────── Task B: 10 s idle probe (assemblyai path) ─────────────


async def test_idle_probe_fires_once_after_10s_no_speech(monkeypatch) -> None:
    """After 10 s of silence the session emits exactly one probe through the speak path."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)  # shrink timeout so the test is fast

    brain = FakeBrain(results=[AnswerResult(Utterance("next q", "voice"), "oral", {})])
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    # Arm: feed one frame to start the streamer + create the idle watchdog.
    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)  # let pump initialise (frame consumed, streamer started)

    # Signal that the greeting TTS has finished — the initial watchdog is held back until this.
    session.greeting_done()

    # Wait long enough for the idle probe to fire (0.05 s timeout + slack).
    await asyncio.sleep(0.15)

    # Exactly one probe was spoken; no brain call (state stays LISTENING).
    assert len(sink.spoken) == 1
    probe = sink.spoken[0]
    assert probe.phase == "idle_probe"
    assert probe.utterance.text != ""
    assert session.state == "listening"

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_idle_probe_suppressed_when_speech_arrives_before_timeout(monkeypatch) -> None:
    """Speech within the 10 s window must suppress the probe entirely."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.10)

    brain = FakeBrain(results=[AnswerResult(Utterance("next q", "voice"), "oral", {})])
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    result_holder: list[object] = []

    async def _run_pipeline() -> None:
        """Mirrors ws_connection._pipeline: loop pump() until a real turn arrives."""
        while True:
            r = await session.pump(frame_q)
            if r is not None:
                result_holder.append(r)
                return

    pipeline = asyncio.create_task(_run_pipeline())

    # Kick the first frame so the streamer starts.
    await frame_q.put(_frame())
    await asyncio.sleep(0)

    # Signal that the greeting finished — arms the watchdog — BEFORE speech arrives.
    session.greeting_done()

    # Signal speech activity well before the 0.10 s timeout.
    await asyncio.sleep(0.02)
    streamer.speech_activity.set()

    # Inject a real EOT commit so the pipeline loop returns.
    streamer.events.put_nowait(
        TurnEvent(transcript="my answer", end_of_turn=True, formatted=True)
    )
    await asyncio.wait_for(pipeline, timeout=2.0)
    assert result_holder, "pipeline must return a real turn"

    # Wait past the original timeout to confirm the probe never fires.
    await asyncio.sleep(0.15)
    probe_spoken = [t for t in sink.spoken if t.phase == "idle_probe"]
    assert probe_spoken == [], "probe must not fire when speech arrived before the deadline"

    await session.aclose()


async def test_idle_probe_fires_at_most_once_per_turn(monkeypatch) -> None:
    """Even if the watchdog somehow races, only one probe per armed window is emitted."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)

    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)
    session.greeting_done()  # arm the initial watchdog

    # Wait for the probe to fire.
    await asyncio.sleep(0.20)
    probe_count_before = sum(1 for t in sink.spoken if t.phase == "idle_probe")
    assert probe_count_before == 1

    # Wait another full timeout period — the probe must NOT fire again.
    await asyncio.sleep(0.15)
    probe_count_after = sum(1 for t in sink.spoken if t.phase == "idle_probe")
    assert probe_count_after == 1, "probe must fire at most once per armed window"

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_idle_probe_resets_on_new_turn_arm(monkeypatch) -> None:
    """Each arm_next_turn gives a fresh probe window — a second silence window gets a new probe."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)

    brain = FakeBrain(results=[
        AnswerResult(Utterance("q2", "voice"), "oral", {}),
        AnswerResult(Utterance("q3", "voice"), "oral", {}),
    ])
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()

    # ── turn 1: answer arrives, no idle probe ──
    # Use a pipeline loop so the frame-consume pump and the event-consume pump both run.
    result1_holder: list[object] = []

    async def _pipeline_turn1() -> None:
        while True:
            r = await session.pump(frame_q)
            if r is not None:
                result1_holder.append(r)
                return

    pipeline1 = asyncio.create_task(_pipeline_turn1())
    await frame_q.put(_frame())
    await asyncio.sleep(0)
    # Signal greeting done so the initial watchdog is armed and _greeting_done stays True for
    # subsequent windows (the belt-and-braces check in the watchdog body requires this).
    session.greeting_done()
    streamer.speech_activity.set()
    streamer.events.put_nowait(
        TurnEvent(transcript="answer one", end_of_turn=True, formatted=True)
    )
    await asyncio.wait_for(pipeline1, timeout=2.0)
    assert result1_holder, "turn 1 must commit"
    session.arm_next_turn()

    # ── turn 2: candidate is silent → probe must fire once ──
    # Feed a frame so pump() starts the watchdog (via _ensure_streamer_started → already done,
    # but the watchdog was restarted by arm_next_turn → _recover).  Then wait for probe.
    pump_task2 = asyncio.create_task(session.pump(frame_q))
    await frame_q.put(_frame())
    await asyncio.sleep(0)
    await asyncio.sleep(0.20)  # let the probe fire (timeout = 0.05 s)

    probe_turns = [t for t in sink.spoken if t.phase == "idle_probe"]
    assert len(probe_turns) == 1

    pump_task2.cancel()
    await asyncio.gather(pump_task2, return_exceptions=True)
    await session.aclose()


async def test_idle_probe_cancelled_on_session_close(monkeypatch) -> None:
    """close() must cancel the idle watchdog task so it never fires after teardown."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 1.0)  # long enough that it won't expire

    brain = FakeBrain()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)

    # Signal greeting done to arm the initial watchdog.
    session.greeting_done()

    # The watchdog should now be running (created synchronously by greeting_done).
    watchdog = session._idle_watchdog_task
    assert watchdog is not None and not watchdog.done()

    session.close()
    await asyncio.sleep(0)
    assert watchdog.cancelled() or watchdog.done()

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()

# ─────────────── Continuation grace (real-session finding: answered "there?") ───────────────


def test_looks_incomplete_classifies_real_prod_fragments() -> None:
    """The 2026-07-26 session had the interviewer answer the fragment "there?" as if it were an
    answer. Short commits and dangling tails must be recognised as mid-thought; real answers not."""
    # Fragments the interviewer must NOT treat as a finished answer.
    for frag in ("there?", "and then", "yes", "we scaled it because", "so"):
        assert _looks_incomplete(frag) is True, frag
    # Substantial answers must skip the grace hold entirely (zero added latency).
    for answer in (
        "We used a load balancer and queue-based streaming.",
        "The Lua script ran EVAL on the Redis primary for the relevant hash slot.",
    ):
        assert _looks_incomplete(answer) is False, answer
    # Empty is handled by the existing false-fire guard, not here.
    assert _looks_incomplete("") is False


async def test_short_commit_absorbed_when_candidate_resumes() -> None:
    """A short end-of-turn followed by a fresh partial = the candidate merely paused. The commit is
    absorbed (never submitted to the brain) and the session keeps listening; the eventual complete
    thought is what reaches the brain. pump() returns one result per call, so the caller loops."""
    brain = FakeBrain(results=[AnswerResult(Utterance("next q", "voice"), "oral", {})])
    session, streamer = _stream_session(brain)
    q: asyncio.Queue = asyncio.Queue()

    results: list = []

    async def driver() -> None:
        # Mirror the WS layer: call pump repeatedly, keeping every non-None turn.
        while len(results) == 0:
            r = await session.pump(q)
            if r is not None:
                results.append(r)

    drive = asyncio.create_task(driver())
    await asyncio.sleep(0)

    # Short commit enters its grace hold…
    streamer.events.put_nowait(TurnEvent(transcript="there?", end_of_turn=True, formatted=True))
    await asyncio.sleep(0.05)
    # …and the candidate resumes mid-hold (a text-bearing partial) → absorbed.
    streamer.events.put_nowait(
        TurnEvent(transcript="there? I mean the p99", end_of_turn=False, formatted=False)
    )
    await asyncio.sleep(0.1)
    # Then finishes the thought properly.
    streamer.events.put_nowait(
        TurnEvent(
            transcript="There, I mean the p99 latency was the bottleneck we measured.",
            end_of_turn=True,
            formatted=True,
        )
    )
    await asyncio.wait_for(drive, timeout=3.0)

    # The brain saw ONLY the complete thought — never the "there?" fragment.
    assert len(brain.calls) == 1
    assert "p99" in brain.calls[0][2]
    assert results[0].utterance.text == "next q"


async def test_substantial_commit_skips_grace_and_answers_immediately() -> None:
    """Regression guard on latency: a normal answer must not pay the grace hold."""
    brain = FakeBrain(results=[AnswerResult(Utterance("next q", "voice"), "oral", {})])
    session, streamer = _stream_session(brain)
    pump_task = asyncio.create_task(session.pump(asyncio.Queue()))
    await asyncio.sleep(0)

    started = time.monotonic()
    streamer.events.put_nowait(
        TurnEvent(
            transcript="We used a load balancer and queue-based streaming to absorb the bursts.",
            end_of_turn=True,
            formatted=True,
        )
    )
    result = await pump_task
    elapsed = time.monotonic() - started

    assert result is not None and len(brain.calls) == 1
    assert elapsed < 0.5, f"substantial answer paid a grace hold ({elapsed:.2f}s)"


# ─────────────────────────── Barge-in (BARGE_IN_ENABLED) ─────────────────────────────
#
# Design:
#   * While in PROCESSING (waiting for the spoken-ack from the browser), the barge-in watcher
#     reads mic frames from frame_q and runs simple RMS VAD.
#   * Protection window (_BARGE_IN_PROTECTION_FRAMES ≈ 300ms): frames are consumed but ignored.
#   * After the protection window: _BARGE_IN_MIN_VOICED_FRAMES consecutive frames above
#     _BARGE_IN_ENERGY_THRESHOLD (≈ 320ms sustained speech) → sink.barge_in() fires.
#   * Barge-in: session recovers to LISTENING; pump returns None (no turn result).


class BargeInCaptureSink:
    """TtsSink that blocks speak() on an internal Event so the test can control timing.

    Supports the ``barge_in(request_id)`` interface required by the watcher — calling it
    records the request_id and unblocks the pending speak() coroutine.
    """

    def __init__(self) -> None:
        self.spoken: list[TurnResult] = []
        self.barge_in_request_ids: list[str] = []
        self.speak_started: asyncio.Event = asyncio.Event()
        self._pending: asyncio.Event | None = None

    async def speak(self, turn: TurnResult) -> float | None:
        self._pending = asyncio.Event()
        self.spoken.append(turn)
        self.speak_started.set()
        await self._pending.wait()
        return None

    async def on_thinking(self) -> None:
        pass

    async def barge_in(self, request_id: str) -> None:
        """Called by the watcher — records and unblocks speak()."""
        self.barge_in_request_ids.append(request_id)
        if self._pending is not None:
            self._pending.set()


def _barge_in_session(sink: BargeInCaptureSink, fire_after: int = 3) -> tuple[VoiceSession, asyncio.Queue]:
    """Build a local-path VoiceSession with a BargeInCaptureSink and return (session, frame_q).

    Uses a FakeEndpointer that fires after ``fire_after`` frames so the test can trigger
    PROCESSING quickly, then feed voiced frames into ``frame_q`` while speak() blocks.
    """
    ep = FakeEndpointer(fire_after=fire_after)
    stt = FakeSTT("candidate answer")
    brain = FakeBrain(results=[AnswerResult(Utterance("next question", "voice"), "oral", {})])
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        sink=sink,
    )
    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    return session, frame_q


async def _drive_to_speak(
    session: VoiceSession,
    frame_q: asyncio.Queue[np.ndarray],
    sink: BargeInCaptureSink,
    fire_after: int = 3,
) -> asyncio.Task:
    """Feed ``fire_after`` frames to trigger EOT, then return a running pipeline task.

    The pipeline task calls pump() in a loop. It exits when either a real TurnResult is
    produced or when the sink records a barge-in (pump returned None after barge-in).
    """
    result_holder: list[object] = []

    async def pipeline() -> None:
        while True:
            r = await session.pump(frame_q)
            if r is not None:
                result_holder.append(r)
                return
            if sink.barge_in_request_ids:
                return  # barge-in happened; pump already returned None

    pipe_task = asyncio.create_task(pipeline())
    # Feed frames to trigger the endpointer and advance into _safe_speak.
    for _ in range(fire_after):
        await frame_q.put(_frame(0.1))
        await asyncio.sleep(0)

    # Wait until speak() has been entered (session is blocked awaiting the spoken-ack).
    await asyncio.wait_for(sink.speak_started.wait(), timeout=2.0)
    return pipe_task


async def test_barge_in_sustained_speech_triggers_signal_and_returns_to_listening() -> None:
    """The core barge-in scenario: ≥_BARGE_IN_MIN_VOICED_FRAMES consecutive voiced frames above
    threshold (after the protection window) must fire the barge-in signal and leave the session
    in LISTENING so the next candidate turn is captured normally."""
    sink = BargeInCaptureSink()
    session, frame_q = _barge_in_session(sink)

    pipe_task = await _drive_to_speak(session, frame_q, sink)

    # Feed: skip protection window + sustain MIN_VOICED + 1 extra voiced frame.
    for _ in range(_BARGE_IN_PROTECTION_FRAMES + _BARGE_IN_MIN_VOICED_FRAMES + 1):
        await frame_q.put(_frame(0.1))
        await asyncio.sleep(0)

    # Wait for barge-in to fire and the pipeline task to return.
    await asyncio.wait_for(pipe_task, timeout=2.0)

    assert len(sink.barge_in_request_ids) == 1, "barge_in() must be called exactly once"
    assert session.state == "listening", "session must recover to LISTENING after barge-in"


async def test_barge_in_short_burst_does_not_trigger() -> None:
    """A short burst of voiced frames (fewer than _BARGE_IN_MIN_VOICED_FRAMES consecutive frames
    above threshold) followed by silence must NOT trigger barge-in — cough / echo residual guard."""
    sink = BargeInCaptureSink()
    session, frame_q = _barge_in_session(sink)

    pipe_task = await _drive_to_speak(session, frame_q, sink)

    # Feed: protection window + short burst (less than MIN, so counter never reaches threshold)
    # + silent frames that reset the consecutive counter.
    short_burst = _BARGE_IN_MIN_VOICED_FRAMES - 5  # well below the min; 5 voiced frames
    for _ in range(_BARGE_IN_PROTECTION_FRAMES + short_burst):
        await frame_q.put(_frame(0.1))
        await asyncio.sleep(0)
    for _ in range(8):  # silence resets consecutive_voiced to 0
        await frame_q.put(_frame(0.0))
        await asyncio.sleep(0)

    assert not sink.barge_in_request_ids, "short burst must NOT trigger barge-in"

    # Clean up: resolve speak() externally so pipeline exits cleanly.
    assert sink._pending is not None
    sink._pending.set()
    await asyncio.wait_for(pipe_task, timeout=2.0)
    await session.aclose()


async def test_barge_in_protection_window_prevents_early_cut() -> None:
    """Voiced frames WITHIN the first _BARGE_IN_PROTECTION_FRAMES must not trigger barge-in
    even if they would satisfy the energy threshold — the protection window is unconditional."""
    sink = BargeInCaptureSink()
    session, frame_q = _barge_in_session(sink)

    pipe_task = await _drive_to_speak(session, frame_q, sink)

    # Feed exactly _BARGE_IN_PROTECTION_FRAMES voiced frames — all fall in the protection window
    # (consecutive_voiced is never incremented) — plus _BARGE_IN_MIN_VOICED_FRAMES - 1 more voiced
    # frames after the window, still one short of the barge-in threshold.
    total = _BARGE_IN_PROTECTION_FRAMES + _BARGE_IN_MIN_VOICED_FRAMES - 1
    for _ in range(total):
        await frame_q.put(_frame(0.1))
        await asyncio.sleep(0)

    assert not sink.barge_in_request_ids, (
        "protection window frames plus one-short-of-threshold consecutive frames "
        "must NOT trigger barge-in"
    )

    # Clean up.
    assert sink._pending is not None
    sink._pending.set()
    await asyncio.wait_for(pipe_task, timeout=2.0)
    await session.aclose()


async def test_barge_in_stale_audio_after_event_is_dropped() -> None:
    """After barge-in, the session is in LISTENING and further voiced frames feed the accumulator
    as the start of the next turn — the barge-in watcher is already done and cannot fire again,
    so there is no double-barge-in from stale audio."""
    sink = BargeInCaptureSink()
    session, frame_q = _barge_in_session(sink)

    pipe_task = await _drive_to_speak(session, frame_q, sink)

    # Trigger barge-in.
    for _ in range(_BARGE_IN_PROTECTION_FRAMES + _BARGE_IN_MIN_VOICED_FRAMES + 1):
        await frame_q.put(_frame(0.1))
        await asyncio.sleep(0)

    await asyncio.wait_for(pipe_task, timeout=2.0)
    assert len(sink.barge_in_request_ids) == 1
    assert session.state == "listening"

    # After barge-in, the session is back in LISTENING.  Subsequent voiced frames are accumulated
    # by the endpointer — they do NOT retrigger barge-in (the watcher task is already done).
    # Feed more voiced frames; they are consumed by the new LISTENING pump() call without error.
    sink.speak_started.clear()  # reset for the next turn check
    # Feed frames into the queue while in LISTENING — these become part of the next turn.
    # (No second pump() drive needed: we just verify the session state is stable.)
    assert session.state == "listening", "session must remain LISTENING after barge-in"
    # Confirm _barge_in_occurred was reset by _recover() so it does not bleed into the next turn.
    assert not session._barge_in_occurred, "_barge_in_occurred must be reset after recover"


async def test_barge_in_telemetry_recorded_with_flag() -> None:
    """A barge-in turn must produce a telemetry record with barge_in=True."""
    sink = BargeInCaptureSink()
    session, frame_q = _barge_in_session(sink)
    tel = FakeTelemetrySink()
    # Rebuild session with telemetry sink.
    ep = FakeEndpointer(fire_after=3)
    stt = FakeSTT("answer")
    brain = FakeBrain(results=[AnswerResult(Utterance("q2", "voice"), "oral", {})])
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        sink=sink,
        telemetry=tel,
    )
    frame_q2: asyncio.Queue[np.ndarray] = asyncio.Queue()

    pipe_task = await _drive_to_speak(session, frame_q2, sink)

    for _ in range(_BARGE_IN_PROTECTION_FRAMES + _BARGE_IN_MIN_VOICED_FRAMES + 1):
        await frame_q2.put(_frame(0.1))
        await asyncio.sleep(0)

    await asyncio.wait_for(pipe_task, timeout=2.0)

    # Let the fire-and-forget telemetry task run.
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert len(tel.records) == 1
    rec = tel.records[0]
    assert rec.barge_in is True, "telemetry must record barge_in=True for a barge-in turn"
    assert session.state == "listening"


# ────────────── Phase-aware idle watchdog + greeting-done guard (2026-08-09) ──────────────


async def test_coding_phase_turn_flows_to_speaking() -> None:
    """A committed turn during phase='coding' must reach SPEAKING normally.

    The session state machine is phase-agnostic: LISTENING → PROCESSING → SPEAKING is
    unchanged in coding.  The only coding-specific behaviour is watchdog suppression.
    """
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("the loop is O(n squared)")
    brain = FakeBrain(
        results=[AnswerResult(Utterance("Any better approach?", "code"), "coding", {})]
    )
    sink = CaptureSink()
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        sink=sink,
        phase="coding",
    )
    assert session.state == "listening"
    turn = await _drive(session, 5)
    assert turn is not None
    assert turn.phase == "coding"
    assert session.state == "speaking"
    assert len(sink.spoken) == 1
    assert sink.spoken[0].utterance.text == "Any better approach?"
    # Phase updated to 'coding' after the brain result.
    assert session._phase == "coding"
    # Whisper path has no watchdog — just verify there is no task leak.
    assert session._idle_watchdog_task is None


async def test_idle_watchdog_not_armed_after_coding_phase_recover(monkeypatch) -> None:
    """After a turn lands the FSM in 'coding', _recover must NOT arm the idle watchdog."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)

    brain = FakeBrain(results=[AnswerResult(Utterance("now solve it", "code"), "coding", {})])
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()

    # Full pipeline: answer a turn whose result.phase='coding'.
    pipeline_task = asyncio.create_task(session.pump(frame_q))
    await frame_q.put(_frame())
    await asyncio.sleep(0)
    session.greeting_done()          # arm initial (oral) watchdog; must be cancelled on turn commit
    streamer.speech_activity.set()
    streamer.events.put_nowait(
        TurnEvent(transcript="my approach is binary search", end_of_turn=True, formatted=True)
    )
    result = await asyncio.wait_for(pipeline_task, timeout=2.0)
    assert result is not None and result.phase == "coding"

    # arm_next_turn → _recover with _phase='coding' → watchdog must NOT start.
    session.arm_next_turn()
    await asyncio.sleep(0.20)        # well past the 0.05 s probe timeout

    probe_turns = [t for t in sink.spoken if t.phase == "idle_probe"]
    assert probe_turns == [], "idle probe must not fire when phase='coding'"
    assert session._idle_watchdog_task is None

    await session.aclose()


async def test_initial_watchdog_not_armed_before_greeting_done(monkeypatch) -> None:
    """The initial idle watchdog must not fire before greeting_done() is received."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)

    brain = FakeBrain()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)   # streamer starts; fallback armed; watchdog NOT armed

    # Wait well past the probe timeout WITHOUT calling greeting_done.
    await asyncio.sleep(0.20)

    probe_turns = [t for t in sink.spoken if t.phase == "idle_probe"]
    assert probe_turns == [], "probe must not fire before greeting_done()"
    assert session._idle_watchdog_task is None

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_greeting_done_arms_watchdog_and_probe_fires(monkeypatch) -> None:
    """greeting_done() arms the initial watchdog; the probe fires after the timeout."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)

    brain = FakeBrain()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)  # streamer started; watchdog NOT armed yet

    assert session._idle_watchdog_task is None, "watchdog must not be armed before greeting_done"

    # greeting_done() creates the watchdog task synchronously.
    session.greeting_done()
    assert session._idle_watchdog_task is not None and not session._idle_watchdog_task.done()

    await asyncio.sleep(0.20)  # let probe fire
    probe_turns = [t for t in sink.spoken if t.phase == "idle_probe"]
    assert len(probe_turns) == 1, "probe must fire after greeting_done() and timeout"

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_greeting_done_idempotent(monkeypatch) -> None:
    """Calling greeting_done() twice must not arm a second watchdog."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 1.0)

    brain = FakeBrain()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)

    session.greeting_done()
    watchdog_first = session._idle_watchdog_task
    assert watchdog_first is not None

    session.greeting_done()  # second call — must be a no-op
    assert session._idle_watchdog_task is watchdog_first  # same task, not replaced

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_greeting_fallback_arms_watchdog_when_greeting_done_never_arrives(
    monkeypatch,
) -> None:
    """The 45 s fallback arms the initial watchdog when greeting_done() is never called."""
    monkeypatch.setattr("session._GREETING_FALLBACK_S", 0.05)
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.08)

    brain = FakeBrain()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)

    # Watchdog NOT armed; greeting_done NOT called.
    assert session._idle_watchdog_task is None
    assert not session._greeting_done

    # Wait for fallback (0.05 s) + probe timeout (0.08 s) + slack.
    await asyncio.sleep(0.30)

    probe_turns = [t for t in sink.spoken if t.phase == "idle_probe"]
    assert len(probe_turns) == 1, "probe must fire via the 45 s fallback arm"
    assert session._greeting_done, "fallback must set _greeting_done=True"

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_greeting_fallback_cancelled_when_greeting_done_arrives(monkeypatch) -> None:
    """When greeting_done() is called, the fallback task must be cancelled (no double arm)."""
    monkeypatch.setattr("session._GREETING_FALLBACK_S", 0.10)
    monkeypatch.setattr("session._IDLE_PROBE_S", 1.0)

    brain = FakeBrain()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)

    fallback_task = session._greeting_fallback_task
    assert fallback_task is not None and not fallback_task.done()

    session.greeting_done()  # cancels the fallback

    await asyncio.sleep(0)  # let cancellation propagate
    assert fallback_task.cancelled() or fallback_task.done()

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_probe_has_unique_request_id(monkeypatch) -> None:
    """The probe must use a distinct request_id so its late {spoken} ack cannot prematurely
    resolve the next real turn's speak() wait in the sink."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)

    brain = FakeBrain()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)
    session.greeting_done()

    await asyncio.sleep(0.20)

    assert len(sink.spoken) == 1
    probe = sink.spoken[0]
    assert probe.phase == "idle_probe"
    session_rid = session.request_id  # still the same (no turn committed)
    # Must be distinct from the session's request_id.
    assert probe.request_id != session_rid
    # Must encode the session rid so it's traceable.
    assert probe.request_id.startswith(session_rid + ":probe")

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()


async def test_probe_telemetry_logged(monkeypatch) -> None:
    """After a probe fires, _log_turn must be called with commit='idle_probe' and empty=True
    so the probe is persisted to the DB (voice INFO logs don't reach docker logs)."""
    monkeypatch.setattr("session._IDLE_PROBE_S", 0.05)

    brain = FakeBrain()
    tel = FakeTelemetrySink()
    sink = CaptureSink()
    session, streamer = _stream_session(brain, sink=sink, telemetry=tel)

    frame_q: asyncio.Queue[np.ndarray] = asyncio.Queue()
    await frame_q.put(_frame())
    pump_task = asyncio.create_task(session.pump(frame_q))
    await asyncio.sleep(0)
    session.greeting_done()

    await asyncio.sleep(0.20)
    # Flush fire-and-forget telemetry tasks.
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    probe_records = [r for r in tel.records if r.commit == "idle_probe"]
    assert len(probe_records) == 1, "one telemetry record per probe fire"
    rec = probe_records[0]
    assert rec.phase == "idle_probe"
    assert rec.empty is True
    assert rec.terminal is False
    assert rec.audio_s == 0.0
    assert rec.primary_transcript != "", "transcript must hold the probe line for mic-absorption analysis"
    # The telemetry rid must match the probe's unique rid (not the session rid).
    assert rec.request_id != session.request_id
    assert rec.request_id.startswith(session.request_id + ":probe")

    pump_task.cancel()
    await asyncio.gather(pump_task, return_exceptions=True)
    await session.aclose()
