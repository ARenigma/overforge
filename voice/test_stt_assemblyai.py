"""Offline unit tests for the P1-A AssemblyAI streaming STT path.

No network, no real WebSocket: a FakeWs injected through the streamer's ``connect`` seam, and
a FakeStreamer injected into ``VoiceSession``. Covers the wire contract (PCM16 conversion,
50 ms batching, Terminate-on-close incl. error paths), the Turn-event policy (formatted final
preferred, grace fallback, partials ignored), reconnect-once-then-fatal, and the session glue
(EOT event commits a real turn, stale events dropped on re-arm, fatal → local-whisper
fallback, teardown always closes the streamer).
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import numpy as np

_VOICE_DIR = Path(__file__).parent
if str(_VOICE_DIR) not in sys.path:
    sys.path.insert(0, str(_VOICE_DIR))

from contracts import AnswerResult, AudioArray, TurnEvent, Utterance  # noqa: E402
from session import VoiceSession  # noqa: E402
from stt_assemblyai import (  # noqa: E402
    AssemblyAIConfig,
    AssemblyAIStreamer,
    _f32_to_pcm16,
)
from test_session import (  # noqa: E402
    CaptureSink,
    FakeBrain,
    FakeEndpointer,
    FakeSTT,
    FakeTelemetrySink,
    _frame,
)

# ─────────────────────────── fakes ───────────────────────────


class FakeWs:
    """Duck-typed WS: records sends; recv() yields queued strings or raises queued exceptions."""

    def __init__(self) -> None:
        self.sent: list[bytes | str] = []
        self.incoming: asyncio.Queue[str | Exception] = asyncio.Queue()
        self.closed = False
        self.fail_sends = False

    async def send(self, data: bytes | str) -> None:
        if self.fail_sends:
            raise ConnectionError("send failed")
        self.sent.append(data)

    async def recv(self) -> bytes | str:
        item = await self.incoming.get()
        if isinstance(item, Exception):
            raise item
        return item

    async def close(self) -> None:
        self.closed = True


def _streamer(
    *sockets: FakeWs, config: AssemblyAIConfig | None = None
) -> tuple[AssemblyAIStreamer, list[str]]:
    """A streamer whose connect() hands out the given fake sockets in order."""
    remaining = list(sockets)
    urls: list[str] = []

    async def connect(url: str) -> FakeWs:
        urls.append(url)
        if not remaining:
            raise ConnectionError("no more sockets")
        return remaining.pop(0)

    cfg = config if config is not None else AssemblyAIConfig(api_key="test-key")
    return (
        AssemblyAIStreamer(cfg, connect=connect, format_grace_s=0.05, reconnect_backoff_s=0.01),
        urls,
    )


def _turn_msg(
    order: int, transcript: str, *, end_of_turn: bool, formatted: bool
) -> str:
    return json.dumps(
        {
            "type": "Turn",
            "turn_order": order,
            "transcript": transcript,
            "end_of_turn": end_of_turn,
            "turn_is_formatted": formatted,
        }
    )


def _json_sends(ws: FakeWs) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for s in ws.sent:
        if isinstance(s, str):
            parsed = json.loads(s)
            assert isinstance(parsed, dict)
            out.append(parsed)
    return out


def _audio_sends(ws: FakeWs) -> list[bytes]:
    return [s for s in ws.sent if isinstance(s, bytes)]


class FakeStreamer:
    """SttStreamerLike fake for VoiceSession tests — events are pushed by the test."""

    def __init__(self) -> None:
        self.events: asyncio.Queue[TurnEvent] = asyncio.Queue()
        self.failed = False
        self.fed: list[np.ndarray] = []
        self.start_calls = 0
        self.close_calls = 0

    async def start(self) -> None:
        self.start_calls += 1

    async def feed(self, pcm_f32: np.ndarray) -> None:
        self.fed.append(np.asarray(pcm_f32))

    async def close(self) -> None:
        self.close_calls += 1


def _stream_session(
    brain: FakeBrain,
    *,
    endpointer: FakeEndpointer | None = None,
    stt: FakeSTT | None = None,
    sink: CaptureSink | None = None,
    telemetry: FakeTelemetrySink | None = None,
) -> tuple[VoiceSession, FakeStreamer]:
    streamer = FakeStreamer()
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=endpointer if endpointer is not None else FakeEndpointer(fire_after=10**9),
        stt=stt if stt is not None else FakeSTT("LOCAL WHISPER — must not run"),
        brain=brain,
        sink=sink,
        telemetry=telemetry,
        streamer=streamer,
    )
    return session, streamer


# ─────────────────────────── config / query params ───────────────────────────


def test_query_params_use_verified_v3_names() -> None:
    cfg = AssemblyAIConfig(
        api_key="k",
        keyterms=("Overforge", "hash map"),
        end_of_turn_confidence=0.4,
        min_turn_silence_ms=800,
        max_turn_silence_ms=3000,
    )
    params = cfg.query_params()
    assert params["speech_model"] == "universal-3-5-pro"  # plain universal-3-pro is rejected
    assert params["sample_rate"] == "16000"
    assert params["encoding"] == "pcm_s16le"
    assert params["format_turns"] == "true"
    assert params["end_of_turn_confidence_threshold"] == "0.4"
    assert params["min_turn_silence"] == "800"
    assert params["max_turn_silence"] == "3000"
    assert json.loads(params["keyterms_prompt"]) == ["Overforge", "hash map"]
    assert "language_codes" not in params  # omitted for English (default)
    assert cfg.ws_url().startswith("wss://streaming.assemblyai.com/v3/ws?")


def test_config_from_env() -> None:
    env = {
        "ASSEMBLYAI_API_KEY": "secret",
        "STT_KEYTERMS": " big-O , linked list ,",
        "STT_MIN_TURN_SILENCE_MS": "1000",
        "STT_MAX_TURN_SILENCE_MS": "4000",
        "STT_EOT_CONFIDENCE": "0.6",
    }
    cfg = AssemblyAIConfig.from_env(env, language="es")
    assert cfg.api_key == "secret"
    assert cfg.keyterms == ("big-O", "linked list")  # trimmed, empties dropped
    assert cfg.min_turn_silence_ms == 1000
    assert cfg.max_turn_silence_ms == 4000
    assert cfg.end_of_turn_confidence == 0.6
    assert json.loads(cfg.query_params()["language_codes"]) == ["es"]


# ─────────────────────────── audio conversion + batching ───────────────────────────


def test_f32_to_pcm16_conversion_and_clipping() -> None:
    pcm = np.array([0.0, 0.5, -0.5, 2.0, -2.0], dtype=np.float32)
    out = np.frombuffer(_f32_to_pcm16(pcm), dtype="<i2")
    assert out[0] == 0
    assert out[1] == int(0.5 * 32767)
    assert out[2] == -int(0.5 * 32767)
    assert out[3] == 32767  # clipped, not wrapped
    assert out[4] == -32767


async def test_feed_batches_to_50ms_sends() -> None:
    ws = FakeWs()
    streamer, _ = _streamer(ws)
    await streamer.start()
    frame = np.full(512, 0.25, dtype=np.float32)  # 512 samples → 1024 bytes PCM16 (32 ms)
    await streamer.feed(frame)
    assert _audio_sends(ws) == []  # below the 1600-byte (50 ms) minimum — buffered
    await streamer.feed(frame)
    sends = _audio_sends(ws)
    assert len(sends) == 1 and len(sends[0]) == 2048  # both frames flushed in ONE send
    expected = np.concatenate([frame, frame])
    assert np.array_equal(
        np.frombuffer(sends[0], dtype="<i2"),
        (np.clip(expected, -1, 1) * 32767).astype("<i2"),
    )
    await streamer.close()


async def test_feed_buffers_through_send_failure() -> None:
    ws = FakeWs()
    streamer, _ = _streamer(ws)
    await streamer.start()
    ws.fail_sends = True
    frame = np.full(512, 0.1, dtype=np.float32)
    await streamer.feed(frame)
    await streamer.feed(frame)  # send fails → audio re-buffered, no raise
    ws.fail_sends = False
    await streamer.feed(frame)  # next send flushes everything buffered
    sends = _audio_sends(ws)
    assert len(sends) == 1 and len(sends[0]) == 3 * 1024
    await streamer.close()


# ─────────────────────────── Terminate on close (billing trap) ───────────────────────────


async def test_close_always_sends_terminate_then_closes() -> None:
    ws = FakeWs()
    streamer, _ = _streamer(ws)
    await streamer.start()
    await streamer.close()
    assert {"type": "Terminate"} in _json_sends(ws)
    assert ws.closed
    # Idempotent: a second close must not send a second Terminate.
    await streamer.close()
    assert sum(1 for m in _json_sends(ws) if m == {"type": "Terminate"}) == 1


async def test_close_is_exception_safe_when_terminate_send_fails() -> None:
    ws = FakeWs()
    streamer, _ = _streamer(ws)
    await streamer.start()
    ws.fail_sends = True
    await streamer.close()  # Terminate send raises internally — close() must not raise
    assert ws.closed  # the socket is still closed


async def test_fatal_failure_still_closes_the_socket() -> None:
    ws1, ws2 = FakeWs(), FakeWs()
    streamer, urls = _streamer(ws1, ws2)
    await streamer.start()
    ws1.incoming.put_nowait(ConnectionError("drop 1"))
    await asyncio.sleep(0.05)
    assert len(urls) == 2 and streamer.failed is False  # reconnected once
    ws2.incoming.put_nowait(ConnectionError("drop 2"))
    await asyncio.sleep(0.05)
    assert streamer.failed is True  # only ONE reconnect per lifetime
    ev = await asyncio.wait_for(streamer.events.get(), 1)
    assert ev.fatal
    await asyncio.sleep(0.05)  # let the on-fatal close task run
    assert {"type": "Terminate"} in _json_sends(ws2)  # billing trap: closed even on fatal
    assert ws2.closed


# ─────────────────────────── Turn-event policy ───────────────────────────


async def test_formatted_final_preferred_over_unformatted() -> None:
    ws = FakeWs()
    streamer, _ = _streamer(ws)
    await streamer.start()
    ws.incoming.put_nowait(json.dumps({"type": "Begin", "id": "s1"}))
    ws.incoming.put_nowait(_turn_msg(0, "hello wor", end_of_turn=False, formatted=False))
    ws.incoming.put_nowait(_turn_msg(0, "hello world", end_of_turn=True, formatted=False))
    ws.incoming.put_nowait(_turn_msg(0, "Hello, world.", end_of_turn=True, formatted=True))
    ev = await asyncio.wait_for(streamer.events.get(), 1)
    assert ev.transcript == "Hello, world." and ev.formatted and ev.end_of_turn
    await asyncio.sleep(0.1)  # well past the grace window
    assert streamer.events.empty()  # the unformatted twin was superseded, never double-emitted
    await streamer.close()


async def test_unformatted_final_emitted_after_grace_when_no_formatted_twin() -> None:
    ws = FakeWs()
    streamer, _ = _streamer(ws)
    await streamer.start()
    ws.incoming.put_nowait(_turn_msg(0, "raw final", end_of_turn=True, formatted=False))
    ev = await asyncio.wait_for(streamer.events.get(), 1)
    assert ev.transcript == "raw final" and not ev.formatted and ev.end_of_turn
    await streamer.close()


async def test_partials_are_not_emitted() -> None:
    ws = FakeWs()
    streamer, _ = _streamer(ws)
    await streamer.start()
    ws.incoming.put_nowait(_turn_msg(0, "partial one", end_of_turn=False, formatted=False))
    ws.incoming.put_nowait(_turn_msg(0, "partial two", end_of_turn=False, formatted=False))
    await asyncio.sleep(0.1)
    assert streamer.events.empty()
    await streamer.close()


# ─────────────────────────── VoiceSession integration ───────────────────────────


async def test_stream_frames_forward_to_streamer_not_endpointer() -> None:
    ep = FakeEndpointer(fire_after=3)
    session, streamer = _stream_session(FakeBrain(), endpointer=ep)
    for _ in range(5):
        assert await session.feed_frame(_frame()) is None
    assert streamer.start_calls == 1  # started lazily on first frame
    assert len(streamer.fed) == 5  # every frame forwarded
    assert ep._n == 0  # the local endpointer never saw a frame (no local EOT possible)


async def test_stream_eot_event_commits_turn_through_pipeline() -> None:
    brain = FakeBrain()
    sink = CaptureSink()
    tel = FakeTelemetrySink()
    session, streamer = _stream_session(brain, sink=sink, telemetry=tel)
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    q.put_nowait(_frame())
    q.put_nowait(_frame())
    streamer.events.put_nowait(TurnEvent("I would use a hash map.", True, True))
    turn = None
    for _ in range(6):
        turn = await asyncio.wait_for(session.pump(q), 1)
        if turn is not None:
            break
    assert turn is not None
    assert turn.transcript == "I would use a hash map."
    assert brain.calls and brain.calls[0][2] == "I would use a hash map."
    assert session.state == "speaking"
    await asyncio.sleep(0)  # flush fire-and-forget cue + telemetry tasks
    assert sink.order[:2] == ["thinking", "speak"]  # same cue contract as the local path
    assert len(tel.records) == 1
    rec = tel.records[0]
    assert rec.commit == "assemblyai_eot"
    assert rec.stt_ms < 100.0  # transcript rides the EOT event — no post-EOT STT wait
    await session.aclose()


async def test_stream_empty_transcript_is_false_fire_and_rearms() -> None:
    brain = FakeBrain()
    session, streamer = _stream_session(brain)
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    streamer.events.put_nowait(TurnEvent("   ", True, True))
    result = await asyncio.wait_for(session.pump(q), 1)
    assert result is None
    assert brain.calls == []
    assert session.state == "listening"
    assert session.take_rearm() is True  # browser mic must be re-armed after the false-fire
    await session.aclose()


async def test_stream_hallucination_is_dropped() -> None:
    brain = FakeBrain()
    tel = FakeTelemetrySink()
    session, streamer = _stream_session(brain, telemetry=tel)
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    streamer.events.put_nowait(TurnEvent("Thank you.", True, True))
    result = await asyncio.wait_for(session.pump(q), 1)
    assert result is None and brain.calls == []
    await asyncio.sleep(0)
    assert tel.records and tel.records[0].phase == "hallucination"
    await session.aclose()


async def test_stale_event_from_pre_rearm_waiter_is_dropped() -> None:
    # turn_gen invalidation: an event-waiter created BEFORE a re-arm must drop the event it
    # eventually receives — that audio belongs to the previous listening window.
    brain = FakeBrain()
    session, streamer = _stream_session(brain)
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    pump_task = asyncio.create_task(session.pump(q))
    await asyncio.sleep(0)  # waiters are now pending at the current turn_gen
    session._recover()  # simulate a re-arm — turn_gen moves on
    streamer.events.put_nowait(TurnEvent("stale answer", True, True))
    result = await asyncio.wait_for(pump_task, 1)
    assert result is None
    assert brain.calls == []  # the stale answer was never submitted
    await session.aclose()


async def test_rearm_drains_queued_stale_events() -> None:
    brain = FakeBrain()
    session, streamer = _stream_session(brain)
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    streamer.events.put_nowait(TurnEvent("first answer", True, True))
    turn = await asyncio.wait_for(session.pump(q), 1)
    assert turn is not None and session.state == "speaking"
    streamer.events.put_nowait(TurnEvent("stale leftover", True, True))
    session.arm_next_turn()  # re-arm drains events queued during PROCESSING/SPEAKING
    streamer.events.put_nowait(TurnEvent("fresh answer", True, True))
    turn2 = await asyncio.wait_for(session.pump(q), 1)
    assert turn2 is not None and turn2.transcript == "fresh answer"
    assert [c[2] for c in brain.calls] == ["first answer", "fresh answer"]
    await session.aclose()


async def test_fatal_event_falls_back_to_local_whisper_path() -> None:
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("local answer")
    brain = FakeBrain()
    session, streamer = _stream_session(brain, endpointer=ep, stt=stt)
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    streamer.events.put_nowait(TurnEvent("", False, False, fatal=True))
    result = await asyncio.wait_for(session.pump(q), 1)
    assert result is None
    assert session.state == "listening"
    turn = None
    for _ in range(12):
        q.put_nowait(_frame())
        turn = await asyncio.wait_for(session.pump(q), 1)
        if turn is not None:
            break
    assert turn is not None  # the LOCAL endpointer+whisper produced the turn
    assert brain.calls and brain.calls[0][2] == "local answer"
    assert stt.received  # local whisper actually transcribed
    await session.aclose()


async def test_failed_flag_falls_back_even_without_poison_pill() -> None:
    # The pill can be drained with the queue on a re-arm; the failed flag alone must suffice.
    ep = FakeEndpointer(fire_after=3)
    stt = FakeSTT("local answer")
    brain = FakeBrain()
    session, streamer = _stream_session(brain, endpointer=ep, stt=stt)
    streamer.failed = True
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    turn = None
    for _ in range(8):
        q.put_nowait(_frame())
        turn = await asyncio.wait_for(session.pump(q), 1)
        if turn is not None:
            break
    assert turn is not None and brain.calls[0][2] == "local answer"
    await session.aclose()


async def test_aclose_always_closes_the_streamer() -> None:
    session, streamer = _stream_session(FakeBrain())
    await session.aclose()
    assert streamer.close_calls >= 1  # Terminate+close guaranteed on teardown
    assert session.state == "closed"


async def test_sync_close_schedules_streamer_close() -> None:
    # Legacy sync close() (no await) must still get the socket closed via the safety-net task.
    session, streamer = _stream_session(FakeBrain())
    session.close()
    await asyncio.sleep(0)
    assert streamer.close_calls >= 1


async def test_pump_without_streamer_matches_local_feed_frame_loop() -> None:
    # Default whisper mode: pump must behave exactly like the old get()+feed_frame loop.
    ep = FakeEndpointer(fire_after=5)
    stt = FakeSTT("plain local turn")
    brain = FakeBrain()
    session = VoiceSession(
        interview_id="iv1", session_token="tok", endpointer=ep, stt=stt, brain=brain
    )
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    for _ in range(5):
        q.put_nowait(_frame())
    turn = None
    for _ in range(5):
        turn = await asyncio.wait_for(session.pump(q), 1)
        if turn is not None:
            break
    assert turn is not None
    assert brain.calls[0][2] == "plain local turn"


async def test_terminal_streamed_turn_marks_session_terminal() -> None:
    brain = FakeBrain(results=[AnswerResult(Utterance("Done.", "text"), "done", {})])
    session, streamer = _stream_session(brain)
    q: asyncio.Queue[AudioArray] = asyncio.Queue()
    streamer.events.put_nowait(TurnEvent("final answer", True, True))
    turn = await asyncio.wait_for(session.pump(q), 1)
    assert turn is not None and turn.is_terminal
    assert session.state == "terminal"
    await session.aclose()
    assert streamer.close_calls >= 1
