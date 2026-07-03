"""WsConnection — drives one authenticated voice WebSocket through a VoiceSession.

The critical design is DECOUPLING the socket reader from the turn pipeline, because
``VoiceSession.feed_frame`` blocks (inside ``WsTtsSink.speak``) awaiting the browser's ``spoken``
ack — and that ack arrives as a *separate inbound message on the same socket*. If a single loop both
fed frames and waited for the ack, it would deadlock. So per connection we run two tasks:

  * reader  — reads every inbound message: binary audio → a bounded queue; {spoken} → sink.ack();
              {mute}/{mic_off} → advisory; {bye}/disconnect → stop.
  * pipeline — drains the queue through ``feed_frame`` sequentially (the endpointer is stateful).
              When feed_frame blocks awaiting the ack, the reader (a separate task) still receives
              {spoken} and resolves it. After a non-terminal turn it clears stale frames + arms the
              next turn; a terminal turn sends {closing} and stops.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol

import httpx
import numpy as np
import numpy.typing as npt

from session import VoiceSession
from ws_auth import AuthRejected, ReadyInfo, verify_connect
from ws_protocol import (
    CLOSE_BAD_PROTOCOL,
    CLOSE_HANDSHAKE_TIMEOUT,
    decode_frame,
)
from ws_sink import WsTtsSink

logger = logging.getLogger(__name__)

_HANDSHAKE_TIMEOUT_S = 5.0
_FRAME_Q_MAX = 64  # ~2 s of 32 ms frames; full → drop (backpressure, never unbounded)

#: Builds a VoiceSession for one connection: (interview_id, token, language, sink) -> VoiceSession.
#: ws_app wires the real one (per-connection endpointer over shared warm models + RestBrainClient);
#: tests inject a fake-backed factory so the WS layer is exercised with no models/network.
SessionFactory = Callable[[str, str, str, WsTtsSink], VoiceSession]


class WebSocketLike(Protocol):
    """The slice of a Starlette/FastAPI WebSocket that WsConnection uses (duck-typed for tests)."""

    async def accept(self) -> None: ...
    async def receive(self) -> Mapping[str, object]: ...
    async def send_json(self, data: object) -> None: ...
    async def close(self, code: int = 1000) -> None: ...


@dataclass
class ConnectionDeps:
    """Per-process shared collaborators injected into every connection."""

    http_client: httpx.AsyncClient  # base_url = backend origin; shared by auth + the brain
    build_session: SessionFactory  # constructs the per-connection VoiceSession (see SessionFactory)


class WsConnection:
    def __init__(self, ws: WebSocketLike, interview_id: str, deps: ConnectionDeps) -> None:
        self._ws = ws
        self._interview_id = interview_id
        self._deps = deps
        self._token = ""
        self._session: VoiceSession | None = None
        self._sink: WsTtsSink | None = None

    async def run(self) -> None:
        await self._ws.accept()
        try:
            ready = await self._handshake()
        except AuthRejected as exc:
            logger.info("WS rejected (%d) for %s: %s", exc.code, self._interview_id, exc.reason)
            await self._ws.close(code=exc.code)
            return

        self._sink = WsTtsSink(self._ws.send_json)
        self._session = self._deps.build_session(
            self._interview_id, self._token, ready.language, self._sink
        )
        await self._ws.send_json(
            {
                "type": "ready",
                "phase": ready.phase,
                "expects": ready.expects,
                "language": ready.language,
            }
        )

        frame_q: asyncio.Queue[npt.NDArray[np.float32]] = asyncio.Queue(maxsize=_FRAME_Q_MAX)
        reader = asyncio.create_task(self._reader(frame_q))
        pipeline = asyncio.create_task(self._pipeline(frame_q))
        try:
            done, pending = await asyncio.wait(
                {reader, pipeline}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                err = task.exception()
                if err is not None and not isinstance(err, asyncio.CancelledError):
                    logger.error("WS task failed for %s: %r", self._interview_id, err)
        finally:
            if self._session is not None:
                # aclose (not close): AWAITS the streaming-STT socket's Terminate+close on the
                # assemblyai path — an unterminated AssemblyAI session bills up to 3 h. This
                # finally runs on EVERY teardown (normal, error, disconnect).
                await self._session.aclose()
            await self._safe_close()

    # ── handshake ────────────────────────────────────────────────────────────────

    async def _handshake(self) -> ReadyInfo:
        """Receive {hello, token}, verify it, and return ReadyInfo — or raise AuthRejected."""
        try:
            msg = await asyncio.wait_for(self._ws.receive(), timeout=_HANDSHAKE_TIMEOUT_S)
        except TimeoutError as exc:
            raise AuthRejected(CLOSE_HANDSHAKE_TIMEOUT, "No handshake received.") from exc

        if msg.get("type") == "websocket.disconnect":
            raise AuthRejected(CLOSE_HANDSHAKE_TIMEOUT, "Client disconnected before handshake.")
        text = msg.get("text")
        if not isinstance(text, str):
            raise AuthRejected(CLOSE_BAD_PROTOCOL, "Expected a JSON hello, got binary.")
        try:
            data = json.loads(text)
        except (ValueError, TypeError) as exc:
            raise AuthRejected(CLOSE_BAD_PROTOCOL, "Malformed handshake JSON.") from exc
        if not isinstance(data, dict) or data.get("type") != "hello":
            raise AuthRejected(CLOSE_BAD_PROTOCOL, "First message must be a hello.")
        token = data.get("token")
        if not isinstance(token, str) or not token:
            raise AuthRejected(CLOSE_BAD_PROTOCOL, "hello.token is required.")

        self._token = token
        return await verify_connect(self._interview_id, token, client=self._deps.http_client)

    # ── reader task ──────────────────────────────────────────────────────────────

    async def _reader(self, frame_q: asyncio.Queue[npt.NDArray[np.float32]]) -> None:
        while True:
            msg = await self._ws.receive()
            if msg.get("type") == "websocket.disconnect":
                return
            if msg.get("type") != "websocket.receive":
                continue

            data = msg.get("bytes")
            if isinstance(data, (bytes, bytearray)):
                try:
                    frame = decode_frame(bytes(data))
                except ValueError:
                    logger.warning(
                        "WS bad audio frame length for %s — closing.", self._interview_id
                    )
                    await self._ws.close(code=CLOSE_BAD_PROTOCOL)
                    return
                try:
                    frame_q.put_nowait(frame)
                except asyncio.QueueFull:
                    pass  # drop — bounded backpressure; never block the reader
                continue

            text = msg.get("text")
            if isinstance(text, str) and self._handle_control(text):
                return  # {bye}

    def _handle_control(self, text: str) -> bool:
        """Handle a JSON control message. Returns True if the connection should stop ({bye})."""
        try:
            data = json.loads(text)
        except (ValueError, TypeError):
            logger.warning("WS ignoring malformed control message for %s.", self._interview_id)
            return False
        if not isinstance(data, dict):
            return False
        mtype = data.get("type")
        if mtype == "spoken":
            request_id = data.get("requestId")
            if isinstance(request_id, str) and self._sink is not None:
                self._sink.ack(request_id)
        elif mtype == "bye":
            return True
        # 'mute' / 'mic_off' are advisory in B.4a (the browser stops sending frames itself).
        return False

    # ── pipeline task ────────────────────────────────────────────────────────────

    async def _pipeline(self, frame_q: asyncio.Queue[npt.NDArray[np.float32]]) -> None:
        assert self._session is not None
        while True:
            # pump = frame_q.get() + feed_frame on the default whisper path (unchanged); on the
            # streaming-STT path it also consumes the provider's end-of-turn events, which can
            # arrive independently of mic-frame timing (e.g. right after the client mic gates).
            turn = await self._session.pump(frame_q)
            if turn is None:
                # A false-fire commit already fired {thinking} (which disarms the browser mic) but
                # returns no turn_ready; re-send {ready} so the browser re-arms instead of staying
                # stuck on "Speaking". (A plain no-commit frame leaves take_rearm False → no send.)
                if self._session.take_rearm():
                    await self._ws.send_json({"type": "ready", "expects": "voice"})
                continue
            # feed_frame already sent turn_ready and awaited the browser's spoken ack (inside
            # sink.speak), so playback is done. Terminal → close out; else discard any frames
            # captured during the turn and arm the next one.
            if turn.is_terminal:
                await self._ws.send_json({"type": "closing", "reason": "terminal"})
                return
            _drain(frame_q)
            self._session.arm_next_turn()

    # ── helpers ──────────────────────────────────────────────────────────────────

    async def _safe_close(self) -> None:
        try:
            await self._ws.close(code=1000)
        except Exception:
            pass  # already closed


def _drain(frame_q: asyncio.Queue[npt.NDArray[np.float32]]) -> None:
    """Discard any queued frames (stale audio captured during a turn) without blocking."""
    while True:
        try:
            frame_q.get_nowait()
        except asyncio.QueueEmpty:
            return
