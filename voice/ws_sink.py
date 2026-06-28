"""WsTtsSink — the TtsSink implementation that turns VoiceSession cues into WebSocket messages.

The dual TtsSink contract maps onto two wire messages:
  - on_thinking() → {type:'thinking'}: fire-and-forget; returns as soon as the cue is sent.
  - speak(turn)   → {type:'turn_ready', ...} THEN awaits the browser's {type:'spoken', requestId}
                    ack, so it resolves ONLY after playback finishes. VoiceSession arms the next
                    turn (resetting the endpointer) right after speak() resolves, and that must
                    never happen while the interviewer is still being voiced. A timeout backstop
                    prevents a lost ack from stalling the session forever.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from contracts import TurnResult

logger = logging.getLogger(__name__)

SendJson = Callable[[dict[str, object]], Awaitable[None]]

_DEFAULT_ACK_TIMEOUT_S = 30.0


class WsTtsSink:
    """Voices VoiceSession cues over a connection's WebSocket; awaits a playback ack on speak()."""

    def __init__(
        self, send_json: SendJson, *, ack_timeout_s: float = _DEFAULT_ACK_TIMEOUT_S
    ) -> None:
        self._send_json = send_json
        self._ack_timeout_s = ack_timeout_s
        self._pending: dict[str, asyncio.Event] = {}

    async def on_thinking(self) -> None:
        await self._safe_send({"type": "thinking"})

    async def speak(self, turn: TurnResult) -> None:
        event = asyncio.Event()
        self._pending[turn.request_id] = event
        await self._safe_send(
            {
                "type": "turn_ready",
                "requestId": turn.request_id,
                "transcript": turn.transcript,
                "utterance": {"text": turn.utterance.text, "expects": turn.utterance.expects},
                "phase": turn.phase,
                "isTerminal": turn.is_terminal,
            }
        )
        try:
            await asyncio.wait_for(event.wait(), timeout=self._ack_timeout_s)
        except TimeoutError:
            logger.warning(
                "spoken-ack timeout for turn %s — force-resolving so the session can continue.",
                turn.request_id,
            )
        finally:
            self._pending.pop(turn.request_id, None)

    def ack(self, request_id: str) -> None:
        """Called by the read loop on a {type:'spoken'} message — resolves speak()'s await."""
        event = self._pending.get(request_id)
        if event is not None:
            event.set()

    async def _safe_send(self, payload: dict[str, object]) -> None:
        """Send a cue; a closed/broken socket is non-fatal (the turn loop must not crash on it)."""
        try:
            await self._send_json(payload)
        except Exception:
            logger.warning("WS cue send failed (%s) — socket likely closed.", payload.get("type"))
