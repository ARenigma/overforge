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

from contracts import AnswerResult, ShadowSnapshot, Utterance  # noqa: E402
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
    assert msg["enable_endpoint_detection"] is True  # semantic endpointing on by default (A/B)


def test_config_message_omits_context_without_terms() -> None:
    assert "context" not in SonioxConfig(api_key="k").config_message()


def test_endpoint_detection_can_be_disabled() -> None:
    cfg = SonioxConfig.from_env({"SONIOX_API_KEY": "k", "SONIOX_ENDPOINT_DETECTION": "0"})
    assert "enable_endpoint_detection" not in cfg.config_message()


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

    snap = shadow.take_snapshot()
    assert snap.transcript == "binary search"  # tokens joined with "" (own spaces), stripped
    # snapshot consumes: a second snapshot in the same window is empty.
    assert shadow.take_snapshot().transcript == ""
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
    assert shadow.take_snapshot().transcript == "binary search"  # <fin> dropped
    await shadow.close()


async def test_semantic_endpoint_captured_and_excluded_from_transcript() -> None:
    # Soniox's <end> token is its OWN turn-detection decision — captured (timing + count) for the
    # A/B against the primary's cut, but never treated as transcript.
    ws = FakeWs([_tokens_msg((" done", True), ("<end>", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())  # sets the window clock so endpoint_ms can be measured
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)
    snap = shadow.take_snapshot()
    assert snap.transcript == "done"  # <end> excluded from the transcript
    assert snap.endpoint_count == 1  # one semantic endpoint fired
    assert snap.endpoint_ms is not None  # timed relative to the window start
    await shadow.close()


async def test_partials_are_not_accumulated() -> None:
    ws = FakeWs([_tokens_msg((" draft", False), (" final", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)
    assert shadow.take_snapshot().transcript == "final"
    await shadow.close()


async def test_reset_clears_window() -> None:
    ws = FakeWs([_tokens_msg((" leftover", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)
    shadow.reset()
    assert shadow.take_snapshot().transcript == ""
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
    snap = shadow.take_snapshot()
    assert snap.transcript == ""
    assert snap.stt_ms is None
    assert snap.endpoint_ms is None  # no <end> fired
    assert snap.endpoint_count == 0
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

    def take_snapshot(self) -> ShadowSnapshot:
        return ShadowSnapshot(
            transcript=self._transcript, stt_ms=42.0, endpoint_ms=99.0, endpoint_count=1
        )

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
    assert rec.shadow_endpoint_ms == 99.0  # Soniox's own EOT timing landed in telemetry
    assert rec.shadow_endpoint_count == 1

    session.arm_next_turn()  # a voiced turn re-arms → shadow window realigns
    assert shadow.reset_calls >= 1
    await session.aclose()
    assert shadow.closed


# ─────────────────────────── diarization ───────────────────────────
# Tests for the advisory speaker-count feature on the Soniox shadow.
# No live credentials required — FakeWs injects pre-built server messages.
# Design rule: speaker labels are positional ("A"/"B"), never biometric voiceprints.


def _diarized_msg(
    *entries: tuple[str, str, float, float],
    finished: bool = False,
) -> str:
    """One is_final token per entry: (text, speaker_label, start_time_s, end_time_s)."""
    return json.dumps({
        "tokens": [
            {
                "text": text,
                "is_final": True,
                "speaker": spk,
                "start_time": start,
                "end_time": end,
            }
            for text, spk, start, end in entries
        ],
        **({"finished": True} if finished else {}),
    })


async def test_two_speakers_in_turn_yields_speaker_count_2() -> None:
    """Two distinct speaker labels in one turn → speaker_count=2, non_primary_speaker_ms set."""
    cfg = SonioxConfig(api_key="k", enable_diarization=True)
    ws = FakeWs([
        _diarized_msg(
            (" hello", "A", 0.0, 0.5),
            (" world", "B", 0.5, 1.0),
            finished=True,
        )
    ])
    shadow = _shadow(ws, config=cfg)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.speaker_count == 2
    assert snap.non_primary_speaker_ms is not None
    # Both speakers contribute 500 ms each. Primary = the first-inserted dominant label ("A").
    # Non-primary ("B") gets the remaining 500 ms.
    assert abs(snap.non_primary_speaker_ms - 500.0) < 1.0
    await shadow.close()


async def test_one_speaker_in_turn_yields_speaker_count_1_and_zero_nonprimary() -> None:
    """Single speaker label → speaker_count=1, non_primary_speaker_ms=0.0."""
    cfg = SonioxConfig(api_key="k", enable_diarization=True)
    ws = FakeWs([
        _diarized_msg(
            (" answer", "A", 0.0, 1.0),
            (" more", "A", 1.0, 2.5),
            finished=True,
        )
    ])
    shadow = _shadow(ws, config=cfg)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.speaker_count == 1
    assert snap.non_primary_speaker_ms == 0.0  # sole speaker is primary — no non-primary ms
    await shadow.close()


async def test_missing_speaker_labels_degrade_to_none() -> None:
    """Tokens without a speaker field degrade gracefully: speaker_count=None, not an error."""
    # Uses the plain _tokens_msg helper (no speaker/timing fields) even when diarization is on.
    cfg = SonioxConfig(api_key="k", enable_diarization=True)
    ws = FakeWs([_tokens_msg((" hello", True), (" world", True), finished=True)])
    shadow = _shadow(ws, config=cfg)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    # Provider returned no speaker labels → treat as "cannot determine", not "one speaker"
    assert snap.speaker_count is None
    assert snap.non_primary_speaker_ms is None
    await shadow.close()


async def test_diarization_off_yields_none_speaker_fields() -> None:
    """With enable_diarization=False, speaker fields are always None (no diarization request sent)."""
    cfg = SonioxConfig(api_key="k", enable_diarization=False)
    # Even if the server hypothetically echoed speaker labels back, we ignore them.
    ws = FakeWs([
        _diarized_msg((" hi", "A", 0.0, 0.3), (" there", "B", 0.3, 0.6), finished=True)
    ])
    shadow = _shadow(ws, config=cfg)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.speaker_count is None  # diarization disabled — no speaker tracking
    assert snap.non_primary_speaker_ms is None
    await shadow.close()


async def test_diarization_config_message_includes_flag_when_enabled() -> None:
    """enable_diarization=True → enable_speaker_diarization in the opening config frame."""
    cfg = SonioxConfig(api_key="k", enable_diarization=True)
    assert cfg.config_message()["enable_speaker_diarization"] is True


async def test_diarization_config_message_omits_flag_when_disabled() -> None:
    """enable_diarization=False → enable_speaker_diarization omitted from the config frame."""
    cfg = SonioxConfig(api_key="k", enable_diarization=False)
    assert "enable_speaker_diarization" not in cfg.config_message()


def test_from_env_reads_stt_shadow_diarize_flag() -> None:
    """STT_SHADOW_DIARIZE=0 disables diarization; default (absent or 1) enables it."""
    cfg_off = SonioxConfig.from_env({"SONIOX_API_KEY": "k", "STT_SHADOW_DIARIZE": "0"})
    assert cfg_off.enable_diarization is False

    cfg_on = SonioxConfig.from_env({"SONIOX_API_KEY": "k"})  # default ON
    assert cfg_on.enable_diarization is True


async def test_session_shadow_snapshot_failure_never_breaks_turn() -> None:
    # A shadow that raises on snapshot must not derail the turn — telemetry still lands, without
    # shadow fields.
    class BoomShadow(FakeShadow):
        def take_snapshot(self) -> ShadowSnapshot:
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


# ─────────────────────────── finalize_lag_ms ───────────────────────────


async def test_finalize_lag_none_when_no_flush_called() -> None:
    """Without flush_turn(), _flush_sent_t stays None → finalize_lag_ms is None."""
    ws = FakeWs([_tokens_msg((" answer", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    # No flush_turn() was called → _flush_sent_t never set → finalize_lag_ms must be None.
    assert snap.finalize_lag_ms is None
    assert snap.stt_ms is not None  # stt_ms is independent — still measured from window_start
    await shadow.close()


async def test_flush_turn_sets_flush_sent_t_in_sender_loop() -> None:
    """After flush_turn() + one event-loop yield, _flush_sent_t is set (sender ran)."""
    ws = FakeWs()  # no incoming msgs — recv blocks; that's fine, we just test the sender
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())  # sets _window_start + enqueues PCM

    assert shadow._flush_sent_t is None  # not yet
    await shadow.flush_turn()
    # Give the event loop one turn so the sender task can dequeue _FINALIZE and set the timestamp.
    await asyncio.sleep(0)

    assert shadow._flush_sent_t is not None  # sender ran and stamped the send time
    # The FakeWs.sent list should contain the finalize control frame.
    json_sends = [s for s in ws.sent if isinstance(s, str) and "finalize" in s]
    assert len(json_sends) >= 1
    await shadow.close()


async def test_finalize_lag_ms_computed_correctly_from_timestamps() -> None:
    """finalize_lag_ms = (last_final_t − flush_sent_t) × 1000, clamped ≥ 0."""
    ws = FakeWs([_tokens_msg((" hello", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())

    # Drive the recv loop so _last_final_t is set from the queued tokens.
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    # Manually set _flush_sent_t to a time BEFORE _last_final_t so finalize_lag_ms > 0.
    assert shadow._last_final_t is not None
    shadow._flush_sent_t = shadow._last_final_t - 0.120  # simulate 120 ms round-trip

    snap = shadow.take_snapshot()
    assert snap.finalize_lag_ms is not None
    # Should be ~120 ms (± small float error)
    assert 100.0 <= snap.finalize_lag_ms <= 200.0
    await shadow.close()


async def test_finalize_lag_clamped_to_zero_when_ordering_inverted() -> None:
    """If flush_sent_t > last_final_t (unlikely clock skew), finalize_lag_ms is clamped to 0."""
    ws = FakeWs([_tokens_msg((" hi", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    assert shadow._last_final_t is not None
    # Simulate inverted clock: flush was "sent" AFTER the final token arrived.
    shadow._flush_sent_t = shadow._last_final_t + 0.5

    snap = shadow.take_snapshot()
    assert snap.finalize_lag_ms == 0.0
    await shadow.close()


async def test_stt_ms_and_finalize_lag_ms_are_distinct_metrics() -> None:
    """stt_ms (window_start→last_final_t) is always ≥ finalize_lag_ms (flush_sent_t→last_final_t)."""
    ws = FakeWs([_tokens_msg((" word", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())  # sets _window_start early
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    assert shadow._window_start is not None
    assert shadow._last_final_t is not None
    # Flush was sent 50 ms after window_start — simulates a real interview where candidate
    # speaks for a while before end-of-turn triggers flush.
    shadow._flush_sent_t = shadow._window_start + 0.050

    snap = shadow.take_snapshot()
    # stt_ms covers the WHOLE window; finalize_lag covers only the flush round-trip.
    assert snap.stt_ms is not None
    assert snap.finalize_lag_ms is not None
    assert snap.stt_ms >= snap.finalize_lag_ms  # window_start is always earlier than flush_sent_t
    await shadow.close()


async def test_flush_sent_t_cleared_by_take_snapshot() -> None:
    """take_snapshot() clears _flush_sent_t so a second call yields finalize_lag_ms=None."""
    ws = FakeWs([_tokens_msg((" a", True), finished=True)])
    shadow = _shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    shadow._flush_sent_t = shadow._last_final_t  # any non-None value
    snap1 = shadow.take_snapshot()
    assert snap1.finalize_lag_ms is not None

    snap2 = shadow.take_snapshot()
    assert snap2.finalize_lag_ms is None  # _flush_sent_t was cleared by the first call
    await shadow.close()


def test_flush_sent_t_cleared_by_reset() -> None:
    """reset() clears _flush_sent_t so a window started after reset has no stale flush timestamp."""
    shadow = _shadow()
    shadow._flush_sent_t = 12345.678  # inject directly to simulate a previous flush
    shadow.reset()
    assert shadow._flush_sent_t is None
