"""FakeBrowserClient — a headless 'browser' over the voice WebSocket for the E2E / load harness.

Speaks the frozen wire protocol: sends {hello,token}, awaits {ready}, streams Int16 audio frames,
collects the {thinking} + {turn_ready} cues, and auto-acks playback with {spoken,requestId} (so the
server arms the next turn). It is deliberately dumb — no audio playback — so it can drive the full
server pipeline (endpointer → STT → brain → cues) with no browser.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from types import TracebackType

import websockets

logger = logging.getLogger(__name__)

_REALTIME_FRAME_S = 0.032  # 32 ms — true mic cadence
_FAST_FRAME_S = 0.004  # load mode — push frames ~8x faster than realtime


@dataclass
class TurnOutcome:
    """What the server emitted for one driven turn."""

    thinking: bool = False
    turn_ready: dict[str, object] | None = None
    eot_to_thinking_s: float | None = None
    eot_to_turn_ready_s: float | None = None
    cues: list[dict[str, object]] = field(default_factory=list)


class FakeBrowserClient:
    def __init__(self, url: str, token: str, *, pace: str = "realtime") -> None:
        self._url = url
        self._token = token
        self._frame_dt = _REALTIME_FRAME_S if pace == "realtime" else _FAST_FRAME_S
        self._ws: websockets.ClientConnection | None = None
        self.ready: dict[str, object] | None = None
        self.frames_sent = 0

    async def __aenter__(self) -> FakeBrowserClient:
        self._ws = await websockets.connect(self._url, max_size=None)
        await self._ws.send(json.dumps({"type": "hello", "token": self._token}))
        msg = json.loads(await self._ws.recv())
        if msg.get("type") != "ready":
            raise RuntimeError(f"expected ready, got {msg!r}")
        self.ready = msg
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._ws is not None:
            await self._ws.close()

    async def drive_turn(self, frames: list[bytes], *, timeout: float = 30.0) -> TurnOutcome:
        """Stream one turn's frames and return the {thinking}+{turn_ready} the server emits.

        Streams frames concurrently with reading cues; auto-acks the turn_ready so the session can
        advance. ``eot_to_*`` times are measured from the last frame sent (a proxy for the EOT).
        """
        assert self._ws is not None
        ws = self._ws
        outcome = TurnOutcome()
        loop = asyncio.get_event_loop()
        sent_at: list[float] = []

        async def _send() -> None:
            for fr in frames:
                await ws.send(fr)
                self.frames_sent += 1
                await asyncio.sleep(self._frame_dt)
            sent_at.append(loop.time())  # all frames delivered ≈ EOT is imminent

        send_task = asyncio.create_task(_send())
        try:
            async with asyncio.timeout(timeout):
                while True:
                    raw = await ws.recv()
                    if isinstance(raw, (bytes, bytearray)):
                        continue
                    cue = json.loads(raw)
                    outcome.cues.append(cue)
                    ctype = cue.get("type")
                    if ctype == "thinking":
                        outcome.thinking = True
                        if sent_at:
                            outcome.eot_to_thinking_s = loop.time() - sent_at[0]
                    elif ctype == "turn_ready":
                        outcome.turn_ready = cue
                        if sent_at:
                            outcome.eot_to_turn_ready_s = loop.time() - sent_at[0]
                        await ws.send(json.dumps({"type": "spoken", "requestId": cue["requestId"]}))
                        break
                    elif ctype == "closing":
                        break
        finally:
            send_task.cancel()
            try:
                await send_task
            except asyncio.CancelledError:
                pass
        return outcome
