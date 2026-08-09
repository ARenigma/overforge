"""Hermetic unit/integration tests for the voice WebSocket layer (P2-B.4a).

No models, no network, no real WebSocket: a FakeWS scripts inbound ASGI messages + records sent
cues; the existing test_session fakes (FakeEndpointer/FakeSTT/FakeBrain) back the VoiceSession via
the injectable build_session factory; httpx.MockTransport stands in for the backend /state. Proves
the handshake auth, the binary frame decode, and the decoupled reader/pipeline + spoken-ack →
arm_next_turn ordering — the riskiest concurrency in the service — without loading torch/onnx.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest

_VOICE_DIR = Path(__file__).parent
if str(_VOICE_DIR) not in sys.path:
    sys.path.insert(0, str(_VOICE_DIR))

from contracts import AnswerResult, Utterance  # noqa: E402
from session import VoiceSession  # noqa: E402
from test_session import FakeBrain, FakeEndpointer, FakeSTT  # noqa: E402
from ws_auth import AuthRejected, verify_connect  # noqa: E402
from ws_connection import ConnectionDeps, WsConnection  # noqa: E402
from ws_protocol import (  # noqa: E402
    CLOSE_BAD_PROTOCOL,
    CLOSE_NOT_IN_PROGRESS,
    CLOSE_UNAUTHORIZED,
    FRAME_BYTES,
    decode_frame,
)
from ws_sink import WsTtsSink  # noqa: E402

# ─────────────────────────── fakes / helpers ───────────────────────────


def _hello(token: str = "tok") -> dict:
    return {"type": "websocket.receive", "text": json.dumps({"type": "hello", "token": token})}


def _frame() -> dict:
    return {"type": "websocket.receive", "bytes": b"\x10\x00" * 512}  # 1024 bytes = 512 Int16


class FakeWS:
    """Scripts inbound ASGI messages; records sent cues + the close code.

    With ``auto_ack`` it simulates the browser: once the script is exhausted it polls the sent cues
    and replies {spoken, requestId} to any un-acked turn_ready (so playback "finishes"), then
    disconnects (or sooner, on a {closing}).
    """

    def __init__(self, script: list[dict], *, auto_ack: bool = False, idle_s: float = 0.4) -> None:
        self._script = list(script)
        self._auto_ack = auto_ack
        self._idle_s = idle_s
        self.sent: list[dict] = []
        self.closed_code: int | None = None
        self._acked: set[str] = set()

    async def accept(self) -> None:
        pass

    async def receive(self) -> dict:
        if self._script:
            return self._script.pop(0)
        if not self._auto_ack:
            return {"type": "websocket.disconnect", "code": 1000}
        for _ in range(max(1, int(self._idle_s / 0.01))):
            for m in self.sent:
                if m.get("type") == "closing":
                    return {"type": "websocket.disconnect", "code": 1000}
                rid = m.get("requestId")
                if (
                    m.get("type") == "turn_ready"
                    and isinstance(rid, str)
                    and rid not in self._acked
                ):
                    self._acked.add(rid)
                    return {
                        "type": "websocket.receive",
                        "text": json.dumps({"type": "spoken", "requestId": rid}),
                    }
            await asyncio.sleep(0.01)
        return {"type": "websocket.disconnect", "code": 1000}

    async def send_json(self, data: object) -> None:
        assert isinstance(data, dict)
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        # Mimic a real socket: the FIRST close wins; a later close() (e.g. run()'s finally cleanup
        # after the reader already closed with a specific code) is a no-op.
        if self.closed_code is None:
            self.closed_code = code


def _state_client(*, status: str = "in_progress", phase: str = "oral", code: int = 200):
    def handler(_req: httpx.Request) -> httpx.Response:
        if code != 200:
            return httpx.Response(code, json={"error": "nope"})
        return httpx.Response(200, json={"status": status, "phase": phase, "transcript": []})

    return httpx.AsyncClient(base_url="http://backend", transport=httpx.MockTransport(handler))


def _deps(client: httpx.AsyncClient, build):
    return ConnectionDeps(http_client=client, build_session=build)


def _make_build(*, fire_after: int, transcript: str, results, captured: dict):
    def build(
        interview_id: str, token: str, language: str, phase: str, sink: WsTtsSink
    ) -> VoiceSession:
        ep = FakeEndpointer(fire_after=fire_after)
        captured["ep"] = ep
        return VoiceSession(
            interview_id=interview_id,
            session_token=token,
            endpointer=ep,
            stt=FakeSTT(transcript),
            brain=FakeBrain(results=results),
            sink=sink,
            language=language,
            phase=phase,
        )

    return build


# ─────────────────────────── decode_frame ───────────────────────────


def test_decode_frame_valid_and_bad_length() -> None:
    arr = decode_frame(b"\x00\x40" * 512)  # 0x4000 = 16384 → 0.5
    assert arr.shape == (512,)
    assert arr.dtype.name == "float32"
    assert abs(float(arr[0]) - 0.5) < 1e-4
    with pytest.raises(ValueError):
        decode_frame(b"\x00" * (FRAME_BYTES - 2))


# ─────────────────────────── verify_connect (handshake auth) ───────────────────────────


async def test_verify_connect_accepts_in_progress() -> None:
    ready = await verify_connect("iv1", "tok", client=_state_client(phase="oral"))
    assert ready.phase == "oral"
    assert ready.expects == "voice"  # oral → voice


async def test_verify_connect_rejects_bad_token() -> None:
    with pytest.raises(AuthRejected) as ei:
        await verify_connect("iv1", "tok", client=_state_client(code=403))
    assert ei.value.code == CLOSE_UNAUTHORIZED


async def test_verify_connect_rejects_not_in_progress() -> None:
    with pytest.raises(AuthRejected) as ei:
        await verify_connect("iv1", "tok", client=_state_client(status="scored", phase="done"))
    assert ei.value.code == CLOSE_NOT_IN_PROGRESS


# ─────────────────────────── WsTtsSink ───────────────────────────


async def test_sink_speak_awaits_until_acked() -> None:
    sent: list[dict] = []

    async def send(payload: dict[str, object]) -> None:
        sent.append(payload)

    sink = WsTtsSink(send, ack_timeout_s=2.0)
    turn = _turn("rid-1", terminal=False)
    task = asyncio.create_task(sink.speak(turn))
    await asyncio.sleep(0.02)
    assert not task.done()  # blocked awaiting the spoken ack
    assert sent[0]["type"] == "turn_ready" and sent[0]["requestId"] == "rid-1"
    sink.ack("rid-1")
    await asyncio.wait_for(task, timeout=1.0)  # resolves once acked


async def test_sink_speak_times_out_without_ack() -> None:
    async def send(_payload: dict[str, object]) -> None:
        pass

    sink = WsTtsSink(send, ack_timeout_s=0.05)
    await asyncio.wait_for(sink.speak(_turn("rid-x", terminal=False)), timeout=1.0)  # no hang


def _turn(rid: str, *, terminal: bool):
    from contracts import TurnResult

    return TurnResult(
        utterance=Utterance("hi", "voice"),
        phase="done" if terminal else "oral",
        transcript="ans",
        request_id=rid,
        is_terminal=terminal,
    )


# ─────────────────────────── WsConnection handshake rejects ───────────────────────────


async def test_handshake_binary_first_rejected() -> None:
    ws = FakeWS([{"type": "websocket.receive", "bytes": b"\x00" * 1024}])
    await WsConnection(ws, "iv1", _deps(_state_client(), _unused_build)).run()
    assert ws.closed_code == CLOSE_BAD_PROTOCOL


async def test_handshake_missing_token_rejected() -> None:
    ws = FakeWS([{"type": "websocket.receive", "text": json.dumps({"type": "hello"})}])
    await WsConnection(ws, "iv1", _deps(_state_client(), _unused_build)).run()
    assert ws.closed_code == CLOSE_BAD_PROTOCOL


async def test_handshake_bad_token_rejected() -> None:
    ws = FakeWS([_hello()])
    await WsConnection(ws, "iv1", _deps(_state_client(code=403), _unused_build)).run()
    assert ws.closed_code == CLOSE_UNAUTHORIZED


def _unused_build(
    interview_id: str, token: str, language: str, phase: str, sink: WsTtsSink
) -> VoiceSession:
    raise AssertionError("build_session must not be called on a rejected handshake")


# ─────────────────────────── WsConnection full turn loop ───────────────────────────


async def test_ready_sent_after_handshake() -> None:
    captured: dict = {}
    build = _make_build(fire_after=99, transcript="x", results=[], captured=captured)
    ws = FakeWS([_hello()])  # no frames → no turn; just handshake → ready → idle disconnect
    await WsConnection(ws, "iv1", _deps(_state_client(phase="oral"), build)).run()
    ready = next(m for m in ws.sent if m["type"] == "ready")
    assert ready["phase"] == "oral" and ready["expects"] == "voice"


async def test_full_turn_emits_turn_ready_and_arms_on_ack() -> None:
    captured: dict = {}
    build = _make_build(
        fire_after=5,
        transcript="my spoken answer",
        results=[AnswerResult(Utterance("next question", "voice"), "oral", {})],
        captured=captured,
    )
    ws = FakeWS([_hello(), *([_frame()] * 5)], auto_ack=True)
    await WsConnection(ws, "iv1", _deps(_state_client(), build)).run()

    tr = next(m for m in ws.sent if m["type"] == "turn_ready")
    assert tr["transcript"] == "my spoken answer"
    assert tr["utterance"]["text"] == "next question"
    assert tr["isTerminal"] is False
    # the spoken ack arrived → the pipeline armed the next turn (endpointer was reset)
    assert captured["ep"].reset_calls >= 1


async def test_terminal_turn_sends_closing_and_does_not_arm() -> None:
    captured: dict = {}
    build = _make_build(
        fire_after=5,
        transcript="final answer",
        results=[AnswerResult(Utterance("Your interview is complete.", "text"), "done", {})],
        captured=captured,
    )
    ws = FakeWS([_hello(), *([_frame()] * 5)], auto_ack=True)
    await WsConnection(ws, "iv1", _deps(_state_client(), build)).run()

    tr = next(m for m in ws.sent if m["type"] == "turn_ready")
    assert tr["isTerminal"] is True
    assert any(m["type"] == "closing" and m["reason"] == "terminal" for m in ws.sent)
    assert captured["ep"].reset_calls == 0  # terminal: never armed


async def test_bad_frame_length_closes_connection() -> None:
    captured: dict = {}
    build = _make_build(fire_after=99, transcript="x", results=[], captured=captured)
    ws = FakeWS([_hello(), {"type": "websocket.receive", "bytes": b"\x00" * 1000}])
    await WsConnection(ws, "iv1", _deps(_state_client(), build)).run()
    assert ws.closed_code == CLOSE_BAD_PROTOCOL


# ─────────────── mic_off advisory + greeting_done pass-through (2026-08-09) ───────────────


async def test_mic_off_advisory_does_not_affect_pipeline() -> None:
    """mic_off is advisory — the reader ignores it and the pipeline completes a full turn."""
    captured: dict = {}
    build = _make_build(
        fire_after=5,
        transcript="still listening",
        results=[AnswerResult(Utterance("good", "voice"), "oral", {})],
        captured=captured,
    )
    ws = FakeWS(
        [
            _hello(),
            # Advisory mic_off before the audio frames — must not disrupt the pipeline.
            {"type": "websocket.receive", "text": json.dumps({"type": "mic_off"})},
            *([_frame()] * 5),
        ],
        auto_ack=True,
    )
    await WsConnection(ws, "iv1", _deps(_state_client(), build)).run()
    # A turn_ready was emitted — mic_off did not kill the pipeline.
    assert any(m["type"] == "turn_ready" for m in ws.sent)
    # No {closing} with reason='mic_off' — the message is purely advisory.
    assert not any(
        m.get("type") == "closing" and m.get("reason") == "mic_off" for m in ws.sent
    )


async def test_greeting_done_forwarded_to_session() -> None:
    """A {type:'greeting_done'} control message must call session.greeting_done().

    This is verified indirectly: the message is received without error and the pipeline
    continues to complete a normal turn (i.e. greeting_done() caused no state corruption).
    """
    captured: dict = {}
    build = _make_build(
        fire_after=5,
        transcript="heard it",
        results=[AnswerResult(Utterance("great", "voice"), "oral", {})],
        captured=captured,
    )
    ws = FakeWS(
        [
            _hello(),
            {"type": "websocket.receive", "text": json.dumps({"type": "greeting_done"})},
            *([_frame()] * 5),
        ],
        auto_ack=True,
    )
    await WsConnection(ws, "iv1", _deps(_state_client(), build)).run()
    assert any(m["type"] == "turn_ready" for m in ws.sent)
