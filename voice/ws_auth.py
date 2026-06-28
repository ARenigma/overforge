"""WebSocket handshake authentication for the voice service (P2-B.4a).

The voice socket carries candidate audio, so it MUST be authenticated before any frame is read.
We reuse the existing server-authoritative ``POST /api/interviews/:id/state`` route (no new backend
endpoint): it validates the rotated session token and returns the interview status + phase. The
socket is rejected with a 4xxx close code if the token is bad or the interview is not in progress.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from ws_protocol import (
    CLOSE_NOT_IN_PROGRESS,
    CLOSE_UNAUTHORIZED,
    Expects,
)

logger = logging.getLogger(__name__)

# The interviewer's last utterance carries the authoritative `expects`; on connect (rehydrate) we
# only know the phase, so we derive an initial expectation from it. The browser uses this only to
# decide whether to open the mic immediately — every turn_ready cue then carries the real value.
_PHASE_EXPECTS: dict[str, Expects] = {
    "greeting": "voice",
    "oral": "voice",
    "handoff": "text",
    "coding": "code",
    "wrap_up": "text",
    "done": "text",
    "scoring": "text",
}

_TERMINAL_PHASES = frozenset({"done", "scoring"})


@dataclass(frozen=True)
class ReadyInfo:
    """What the server tells the browser once the handshake succeeds."""

    phase: str
    expects: Expects
    language: str  # BCP-47 speech language for STT/TTS (the coding language is separate)


class AuthRejected(Exception):
    """Raised when a WS connection must be rejected; carries the close code + a safe reason."""

    def __init__(self, code: int, reason: str) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason


async def verify_connect(
    interview_id: str,
    token: str,
    *,
    client: httpx.AsyncClient,
    language: str = "en",
) -> ReadyInfo:
    """Validate the connecting candidate against the backend; ReadyInfo or raise AuthRejected.

    ``client`` must have ``base_url`` set to the backend origin (the internal compose address in
    prod, e.g. http://backend:5001 — never the public TLS host). Posts a relative path so the same
    client is shared with RestBrainClient. Never logs the token.
    """
    try:
        resp = await client.post(f"/api/interviews/{interview_id}/state", json={"token": token})
    except httpx.HTTPError as exc:
        logger.warning("WS auth: /state unreachable for %s: %s", interview_id, exc)
        raise AuthRejected(CLOSE_UNAUTHORIZED, "Could not verify the interview session.") from exc

    if resp.status_code in (401, 403, 404):
        raise AuthRejected(CLOSE_UNAUTHORIZED, "Invalid or expired interview link.")
    if resp.status_code != 200:
        logger.warning("WS auth: /state %d for %s", resp.status_code, interview_id)
        raise AuthRejected(CLOSE_UNAUTHORIZED, "Could not verify the interview session.")

    data = resp.json()
    status = str(data.get("status", ""))
    phase = str(data.get("phase", ""))
    if status != "in_progress" or phase in _TERMINAL_PHASES:
        raise AuthRejected(CLOSE_NOT_IN_PROGRESS, "This interview is not in progress.")

    return ReadyInfo(phase=phase, expects=_PHASE_EXPECTS.get(phase, "text"), language=language)
