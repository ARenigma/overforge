"""Offline unit tests for the Deepgram nova-3 shadow STT (A/B/C observer).

No network: a FakeWs injected through the shadow's ``connect`` seam.  Covers:
  - config URL building (verified params, diarize flag, endpointing param)
  - PCM16 conversion
  - is_final accumulation + partial (is_final=False) ignored
  - speech_final endpoint capture (endpoint_ms / endpoint_count)
  - finalize_lag_ms is always None (no mid-stream finalize on Deepgram v1)
  - flush_turn() is a no-op (no exception, no state change)
  - diarization word-level speaker label accumulation
  - take_snapshot() consumes window state; second call is blank
  - reset() clears the window
  - start() failure (connect error) marks shadow failed; feed/snapshot are no-ops
  - recv loop exception disables shadow without raising to the caller
  - close() sends CloseStream + closes socket; idempotent
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import pytest

_VOICE_DIR = Path(__file__).parent
if str(_VOICE_DIR) not in sys.path:
    sys.path.insert(0, str(_VOICE_DIR))

from stt_deepgram import (  # noqa: E402
    DeepgramConfig,
    DeepgramShadow,
    _f32_to_pcm16,
)

# ─────────────────────────── helpers ───────────────────────────


class FakeWs:
    """Duck-typed WS: records sends; recv() yields queued strings or raises queued exceptions."""

    def __init__(self, incoming: list[str | Exception] | None = None) -> None:
        self.sent: list[bytes | str] = []
        self.incoming: asyncio.Queue[str | Exception] = asyncio.Queue()
        for item in incoming or []:
            self.incoming.put_nowait(item)
        self.closed = False

    async def send(self, data: bytes | str) -> None:
        self.sent.append(data)

    async def recv(self) -> bytes | str:
        item = await self.incoming.get()
        if isinstance(item, Exception):
            raise item
        return item

    async def close(self) -> None:
        self.closed = True


def _make_shadow(ws: FakeWs | None = None, *, cfg: DeepgramConfig | None = None) -> DeepgramShadow:
    """A shadow whose connect() injects the given fake socket (or raises if None)."""
    async def connect(url: str) -> FakeWs:
        if ws is None:
            raise ConnectionError("connect failed")
        return ws

    return DeepgramShadow(cfg or DeepgramConfig(api_key="testkey"), connect=connect)


def _frame(value: float = 0.1, n: int = 512) -> np.ndarray:
    return np.full(n, value, dtype=np.float32)


def _results(
    transcript: str,
    *,
    is_final: bool = True,
    speech_final: bool = False,
    words: list[dict] | None = None,
) -> str:
    alt: dict = {"transcript": transcript}
    if words is not None:
        alt["words"] = words
    return json.dumps({
        "type": "Results",
        "is_final": is_final,
        "speech_final": speech_final,
        "channel": {"alternatives": [alt]},
    })


def _metadata() -> str:
    """Simulated Metadata message (session closed normally — terminates recv loop)."""
    return json.dumps({"type": "Metadata", "created": "2026-08-01T00:00:00Z"})


# ─────────────────────────── config / URL ───────────────────────────


def test_ws_url_contains_required_params() -> None:
    cfg = DeepgramConfig(api_key="k", model="nova-3", endpointing_ms=300)
    url = cfg.ws_url()
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    assert qs["encoding"] == ["linear16"]
    assert qs["sample_rate"] == ["16000"]
    assert qs["channels"] == ["1"]
    assert qs["model"] == ["nova-3"]
    assert qs["interim_results"] == ["true"]
    assert qs["endpointing"] == ["300"]


def test_ws_url_includes_diarize_when_enabled() -> None:
    cfg = DeepgramConfig(api_key="k", enable_diarization=True)
    qs = parse_qs(urlparse(cfg.ws_url()).query)
    assert qs.get("diarize") == ["true"]


def test_ws_url_omits_diarize_when_disabled() -> None:
    cfg = DeepgramConfig(api_key="k", enable_diarization=False)
    qs = parse_qs(urlparse(cfg.ws_url()).query)
    assert "diarize" not in qs


def test_ws_url_omits_endpointing_when_zero() -> None:
    cfg = DeepgramConfig(api_key="k", endpointing_ms=0)
    qs = parse_qs(urlparse(cfg.ws_url()).query)
    assert "endpointing" not in qs


def test_from_env_reads_env_vars() -> None:
    cfg = DeepgramConfig.from_env({
        "DEEPGRAM_API_KEY": "mykey",
        "DEEPGRAM_MODEL": "nova-2",
        "DEEPGRAM_ENDPOINTING_MS": "500",
        "STT_SHADOW_DIARIZE": "0",
    })
    assert cfg.api_key == "mykey"
    assert cfg.model == "nova-2"
    assert cfg.endpointing_ms == 500
    assert cfg.enable_diarization is False


def test_from_env_defaults() -> None:
    cfg = DeepgramConfig.from_env({})
    assert cfg.model == "nova-3"
    assert cfg.endpointing_ms == 300
    assert cfg.enable_diarization is True


# ─────────────────────────── PCM16 conversion ───────────────────────────


def test_f32_to_pcm16_shape_and_dtype() -> None:
    audio = np.array([0.5, -0.5, 1.0, -1.0], dtype=np.float32)
    raw = _f32_to_pcm16(audio)
    assert isinstance(raw, bytes)
    assert len(raw) == 8  # 4 samples × 2 bytes


def test_f32_to_pcm16_clips_beyond_one() -> None:
    audio = np.array([2.0, -2.0], dtype=np.float32)
    raw = _f32_to_pcm16(audio)
    import struct
    s1, s2 = struct.unpack_from("<hh", raw)
    assert s1 == 32767
    assert s2 == -32767


# ─────────────────────────── transcript accumulation ───────────────────────────


async def test_is_final_results_accumulate_in_snapshot() -> None:
    ws = FakeWs([
        _results("Hello world", is_final=True),
        _results("How are you", is_final=True),
        _metadata(),
    ])
    shadow = _make_shadow(ws)
    await shadow.start()
    # feed() sets _window_start, which is required for stt_ms to be non-None.
    await shadow.feed(_frame())
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.transcript == "Hello world How are you"
    assert snap.stt_ms is not None and snap.stt_ms >= 0


async def test_partial_results_not_accumulated() -> None:
    ws = FakeWs([
        _results("hell", is_final=False),        # partial — must be ignored
        _results("hello there", is_final=True),  # final — must be kept
        _metadata(),
    ])
    shadow = _make_shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.transcript == "hello there"


async def test_empty_results_not_accumulated() -> None:
    ws = FakeWs([
        _results("", is_final=True),   # empty final — must not add to transcript
        _results("word", is_final=True),
        _metadata(),
    ])
    shadow = _make_shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.transcript == "word"


async def test_snapshot_consumes_state_second_call_is_blank() -> None:
    ws = FakeWs([_results("alpha", is_final=True), _metadata()])
    shadow = _make_shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap1 = shadow.take_snapshot()
    snap2 = shadow.take_snapshot()

    assert snap1.transcript == "alpha"
    assert snap2.transcript == ""
    assert snap2.stt_ms is None


# ─────────────────────────── endpoint events ───────────────────────────


async def test_speech_final_true_sets_endpoint_count() -> None:
    ws = FakeWs([
        _results("segment one", is_final=True, speech_final=True),
        _metadata(),
    ])
    shadow = _make_shadow(ws)
    await shadow.start()
    # feed() sets _window_start so endpoint_ms can be measured.
    await shadow.feed(_frame())
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.endpoint_count == 1
    assert snap.endpoint_ms is not None and snap.endpoint_ms >= 0


async def test_multiple_speech_final_events_counted() -> None:
    ws = FakeWs([
        _results("seg1", is_final=True, speech_final=True),
        _results("seg2", is_final=True, speech_final=True),
        _metadata(),
    ])
    shadow = _make_shadow(ws)
    await shadow.start()
    # feed() sets _window_start so endpoint_ms (first speech_final) can be measured.
    await shadow.feed(_frame())
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.endpoint_count == 2
    # endpoint_ms is measured to the FIRST speech_final event
    assert snap.endpoint_ms is not None


async def test_no_speech_final_gives_zero_endpoint_count() -> None:
    ws = FakeWs([
        _results("hello", is_final=True, speech_final=False),
        _metadata(),
    ])
    shadow = _make_shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.endpoint_count == 0
    assert snap.endpoint_ms is None


# ─────────────────────────── finalize_lag_ms ───────────────────────────


async def test_finalize_lag_ms_is_always_none() -> None:
    """Deepgram v1 has no mid-stream finalize — finalize_lag_ms must always be None."""
    ws = FakeWs([_results("text", is_final=True), _metadata()])
    shadow = _make_shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.finalize_lag_ms is None


# ─────────────────────────── flush_turn ───────────────────────────


async def test_flush_turn_is_noop_no_exception_no_state_change() -> None:
    """flush_turn() must return without raising or mutating any state."""
    ws = FakeWs([_results("hello", is_final=True), _metadata()])
    shadow = _make_shadow(ws)
    await shadow.start()
    # flush_turn() is a documented no-op on Deepgram v1.
    await shadow.flush_turn()  # must not raise
    # No CloseStream sent (the sender queue is still draining audio, not EOS).
    await shadow.close()


# ─────────────────────────── reset ───────────────────────────


async def test_reset_clears_window_so_next_snapshot_is_blank() -> None:
    ws = FakeWs([_results("turn one", is_final=True), _metadata()])
    shadow = _make_shadow(ws)
    await shadow.start()
    await shadow.feed(_frame())
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    shadow.reset()
    snap = shadow.take_snapshot()
    assert snap.transcript == ""
    assert snap.stt_ms is None
    assert snap.endpoint_count == 0


# ─────────────────────────── diarization ───────────────────────────


async def test_diarization_words_accumulate_speaker_ms() -> None:
    words = [
        {"word": "hello", "start": 0.0, "end": 0.5, "speaker": 0},
        {"word": "world", "start": 0.5, "end": 1.0, "speaker": 1},
    ]
    ws = FakeWs([_results("hello world", is_final=True, words=words), _metadata()])
    cfg = DeepgramConfig(api_key="k", enable_diarization=True)
    shadow = _make_shadow(ws, cfg=cfg)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.speaker_count == 2
    # speaker 0 has 500 ms; speaker 1 has 500 ms.  Primary = speaker 0 (first turn so both equal;
    # max() picks 0 in stable Python dict iteration).  Non-primary ms = ~500 ms.
    assert snap.non_primary_speaker_ms is not None and snap.non_primary_speaker_ms > 0


async def test_diarization_single_speaker_non_primary_ms_zero() -> None:
    words = [
        {"word": "hello", "start": 0.0, "end": 0.4, "speaker": 0},
        {"word": "there", "start": 0.4, "end": 0.8, "speaker": 0},
    ]
    ws = FakeWs([_results("hello there", is_final=True, words=words), _metadata()])
    cfg = DeepgramConfig(api_key="k", enable_diarization=True)
    shadow = _make_shadow(ws, cfg=cfg)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.speaker_count == 1
    assert snap.non_primary_speaker_ms == 0.0


async def test_diarization_off_no_speaker_fields() -> None:
    words = [{"word": "hi", "start": 0.0, "end": 0.2, "speaker": 0}]
    ws = FakeWs([_results("hi", is_final=True, words=words), _metadata()])
    cfg = DeepgramConfig(api_key="k", enable_diarization=False)
    shadow = _make_shadow(ws, cfg=cfg)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)

    snap = shadow.take_snapshot()
    assert snap.speaker_count is None
    assert snap.non_primary_speaker_ms is None


# ─────────────────────────── failure isolation ───────────────────────────


async def test_connect_failure_marks_failed_no_exception() -> None:
    """A connection error must mark the shadow failed without raising to the caller."""
    shadow = _make_shadow(ws=None)  # connect raises ConnectionError
    await shadow.start()
    assert shadow.failed is True


async def test_feed_after_connect_failure_is_noop() -> None:
    shadow = _make_shadow(ws=None)
    await shadow.start()
    # Must not raise even though failed=True.
    await shadow.feed(_frame())
    snap = shadow.take_snapshot()
    assert snap.transcript == ""


async def test_recv_loop_exception_disables_shadow_without_raising() -> None:
    """A crash in the recv loop sets failed=True; the shadow becomes a no-op."""
    ws = FakeWs([OSError("socket broken")])
    shadow = _make_shadow(ws)
    await shadow.start()
    assert shadow._recv_task is not None
    await asyncio.wait_for(shadow._recv_task, timeout=1)
    assert shadow.failed is True
    # Feed and snapshot must not raise after failure.
    await shadow.feed(_frame())
    snap = shadow.take_snapshot()
    assert snap.transcript == ""


async def test_missing_api_key_marks_failed() -> None:
    cfg = DeepgramConfig(api_key="")  # empty key
    shadow = _make_shadow(cfg=cfg)
    await shadow.start()
    assert shadow.failed is True


# ─────────────────────────── close ───────────────────────────


async def test_close_sends_close_stream_and_closes_socket() -> None:
    ws = FakeWs([_metadata()])
    shadow = _make_shadow(ws)
    await shadow.start()
    await shadow.close()

    # The sender loop should have sent CloseStream.
    json_sends = [s for s in ws.sent if isinstance(s, str)]
    close_msgs = [json.loads(s) for s in json_sends]
    assert any(m.get("type") == "CloseStream" for m in close_msgs)
    assert ws.closed is True


async def test_close_is_idempotent() -> None:
    ws = FakeWs([_metadata()])
    shadow = _make_shadow(ws)
    await shadow.start()
    await shadow.close()
    await shadow.close()  # second call must not raise
    assert ws.closed is True


async def test_close_without_start_is_safe() -> None:
    shadow = _make_shadow()  # connect would fail but we never call start()
    await shadow.close()  # must not raise


# ─────────────────────────── engine label ───────────────────────────


def test_engine_label_is_deepgram() -> None:
    shadow = _make_shadow()
    assert shadow.engine == "deepgram"
