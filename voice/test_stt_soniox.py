"""Offline unit tests for the Soniox shadow STT (A/B observer).

No network: a FakeWs injected through the shadow's ``connect`` seam. Covers the wire contract
(config frame, PCM16 conversion + coalesced sends, EOS on close), the transcript policy
(is_final tokens accumulate, partials ignored, snapshot consumes, reset clears the window),
and failure isolation (a start/connect failure disables the shadow without raising, and feed
is a no-op thereafter).
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

from contracts import AnswerResult, Utterance  # noqa: E402
from session import VoiceSession  # noqa: E402
from stt_soniox import SonioxConfig, SonioxShadow, _f32_to_pcm16  # noqa: E402
from test_session import (  # noqa: E402
    FakeBrain,
    FakeEndpointer,
    FakeSTT,
    FakeTelemetrySink,
)

# ─────────────────────────── fakes ───────────────────────────


class FakeWs:
    """Duck-typed WS: records sends; recv() yields queued strings or raises queued exceptions."""

    def __init__(self, incoming: list[str] | None = None) -> None:
        self.sent: list[bytes | str] = []
        self.incoming: asyncio.Queue[str | Exception] = asyncio.Queue()
        for item in incoming or []:
            self.incoming.put_nowait(item)
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


def _shadow(ws: FakeWs | None = None, *, config: SonioxConfig | None = None) -> SonioxShadow:
    """A shadow whose connect() hands out the given fake socket (or raises if none)."""

    async def connect(url: str) -> FakeWs:
        if ws is None:
            raise ConnectionError("connect failed")
        return ws

    return SonioxShadow(config or SonioxConfig(api_key="k"), connect=connect)


def _frame(value: float = 0.1, n: int = 512) -> np.ndarray:
    return np.full(n, value, dtype=np.float32)


def _tokens_msg(*tokens: tuple[str, bool], finished: bool = False) -> str:
    return json.dumps(
        {
            "tokens": [{"text": t, "is_final": f} for t, f in tokens],
            **({"finished": True} if finished else {}),
        }
    )


# ─────────────────────────── config ───────────────────────────


def test_config_message_includes_terms_when_present() -> None:
    cfg = SonioxConfig(api_key="k", keyterms=("mutex", "quicksort"), language_hints=("en",))
    msg = cfg.config_message()
    assert msg["model"] == "stt-rt-v5"
    assert msg["audio_format"] == "s16le"
    assert msg["sample_rate"] == 16_000
    assert msg["context"] == {"terms": ["mutex", "quicksort"]}


def test_config_message_omits_context_without_terms() -> None:
    assert "context" not in SonioxConfig(api_key="k").config_message()


def test_from_env_reads_key_and_shared_keyterms() -> None:
    cfg = SonioxConfig.from_env(
        {"SONIOX_API_KEY": "secret", "STT_KEYTERMS": "mutex, big-O , "}, language="de"
    )
    assert cfg.api_key == "secret"
    assert cfg.keyterms == ("mutex", "big-O")  # trimmed, empties dropped
    assert cfg.language_hints == ("de",)


# ─────────────────────────── send path ───────────────────────────


async def test_feed_converts_and_coalesces_pcm_then_eos_on_close() -> None:
    ws = FakeWs()
    shadow = _shadow(ws)
    await shadow.start()
    for _ in range(4):  # 4 × 512 float32 frames = 4 × 1024 PCM16 bytes = 4096 bytes total
        await shadow.feed(_frame())
    await shadow.close()  # drains the sender (flush) + emits Soniox EOS ("")

    binary = b"".join(x for x in ws.sent if isinstance(x, bytes))
    assert len(binary) == 4 * 1024  # every fed sample reached the socket, nothing dropped
    assert ws.sent[-1] == ""  # end-of-audio sentinel last
    assert ws.closed


async def test_first_frame_sends_config() -> None:
    ws = FakeWs()
    shadow = _shadow(ws)
    await shadow.start()
    assert isinstance(ws.sent[0], str)
    assert json.loads(ws.sent[0])["api_key"] == "k"
    await shadow.close()


# ─────────────────────────── transcript path ───────────────────────────


async def test_accumulates_finals_and_snapshot_consumes() -> None:
    ws = FakeWs([_tokens_msg((" binary", True), (" search", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    text, _latency = shadow.take_snapshot()
    assert text == "binary search"  # tokens joined with "" (they carry their own spaces), stripped
    # snapshot consumes: a second snapshot in the same window is empty.
    assert shadow.take_snapshot()[0] == ""
    await shadow.close()


async def test_flush_turn_sends_finalize_control_frame() -> None:
    ws = FakeWs()
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())
    await shadow.flush_turn()
    await shadow.close()  # drains the sender (finalize is enqueued before the EOS)
    assert '{"type": "finalize"}' in ws.sent  # mid-stream flush control frame was sent


async def test_control_tokens_excluded_from_snapshot() -> None:
    # The <fin> (finalize) / <end> (endpoint) sentinels are control tokens, never transcript.
    ws = FakeWs([_tokens_msg((" binary", True), ("<fin>", True), (" search", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)
    assert shadow.take_snapshot()[0] == "binary search"  # <fin> dropped
    await shadow.close()


async def test_partials_are_not_accumulated() -> None:
    ws = FakeWs([_tokens_msg((" draft", False), (" final", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)
    assert shadow.take_snapshot()[0] == "final"
    await shadow.close()


async def test_reset_clears_window() -> None:
    ws = FakeWs([_tokens_msg((" leftover", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)
    shadow.reset()
    assert shadow.take_snapshot()[0] == ""
    await shadow.close()


# ─────────────────────────── failure isolation ───────────────────────────


async def test_connect_failure_disables_shadow_without_raising() -> None:
    shadow = _shadow(None)  # connect raises
    await shadow.start()  # must NOT raise
    assert shadow.failed
    # feed after a failed start is a silent no-op (never raises).
    await shadow.feed(_frame())


async def test_start_without_api_key_disables_shadow() -> None:
    shadow = _shadow(FakeWs(), config=SonioxConfig(api_key=""))
    await shadow.start()
    assert shadow.failed


async def test_snapshot_latency_none_when_nothing_finalized() -> None:
    ws = FakeWs()
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())
    text, latency = shadow.take_snapshot()
    assert text == ""
    assert latency is None
    await shadow.close()


def test_f32_to_pcm16_roundtrip_scale() -> None:
    out = _f32_to_pcm16(np.array([0.0, 1.0, -1.0], dtype=np.float32))
    vals = np.frombuffer(out, dtype="<i2")
    assert vals[0] == 0
    assert vals[1] == 32767
    assert vals[2] == -32767


# ─────────────────── session integration (shadow as observer) ───────────────────


class FakeShadow:
    """A ShadowSttLike double: records fed frames + lifecycle, returns a canned snapshot."""

    engine = "soniox"

    def __init__(self, transcript: str = "shadow said this") -> None:
        self._transcript = transcript
        self.fed: list[np.ndarray] = []
        self.started = False
        self.reset_calls = 0
        self.flush_calls = 0
        self.closed = False

    async def start(self) -> None:
        self.started = True

    async def feed(self, pcm_f32: np.ndarray) -> None:
        self.fed.append(np.asarray(pcm_f32))

    async def flush_turn(self) -> None:
        self.flush_calls += 1

    def reset(self) -> None:
        self.reset_calls += 1

    def take_snapshot(self) -> tuple[str, float | None]:
        return self._transcript, 42.0

    async def close(self) -> None:
        self.closed = True


async def test_session_tees_frames_and_records_both_transcripts() -> None:
    ep = FakeEndpointer(fire_after=3)
    stt = FakeSTT("primary transcript")
    brain = FakeBrain([AnswerResult(utterance=Utterance("next", "voice"), phase="oral", state={})])
    tel = FakeTelemetrySink()
    shadow = FakeShadow("shadow transcript")
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        telemetry=tel,
        shadow=shadow,
    )

    turn = None
    for _ in range(3):
        turn = await session.feed_frame(_frame())
    await asyncio.sleep(0)  # let the fire-and-forget telemetry task run

    assert turn is not None
    assert shadow.started
    assert len(shadow.fed) == 3  # every LISTENING frame was tee'd to the shadow
    assert shadow.flush_calls >= 1  # finalize fired at end-of-turn so the snapshot gets the tail
    assert len(tel.records) == 1
    rec = tel.records[0]
    assert rec.primary_transcript == "primary transcript"
    assert rec.shadow_engine == "soniox"
    assert rec.shadow_transcript == "shadow transcript"
    assert rec.shadow_stt_ms == 42.0

    session.arm_next_turn()  # a voiced turn re-arms → shadow window realigns
    assert shadow.reset_calls >= 1
    await session.aclose()
    assert shadow.closed


async def test_session_shadow_snapshot_failure_never_breaks_turn() -> None:
    # A shadow that raises on snapshot must not derail the turn — telemetry still lands, without
    # shadow fields.
    class BoomShadow(FakeShadow):
        def take_snapshot(self) -> tuple[str, float | None]:
            raise RuntimeError("shadow exploded")

    ep = FakeEndpointer(fire_after=3)
    stt = FakeSTT("primary transcript")
    brain = FakeBrain([AnswerResult(utterance=Utterance("next", "voice"), phase="oral", state={})])
    tel = FakeTelemetrySink()
    session = VoiceSession(
        interview_id="iv1",
        session_token="tok",
        endpointer=ep,
        stt=stt,
        brain=brain,
        telemetry=tel,
        shadow=BoomShadow(),
    )

    turn = None
    for _ in range(3):
        turn = await session.feed_frame(_frame())
    await asyncio.sleep(0)

    assert turn is not None  # turn still completed
    assert len(tel.records) == 1
    rec = tel.records[0]
    assert rec.primary_transcript == "primary transcript"
    assert rec.shadow_engine is None  # snapshot failure → shadow fields omitted
    assert rec.shadow_transcript is None
    await session.aclose()
