"""HTTP client for the Overforge interview brain (the TypeScript backend).

The voice ML runs in a separate process from the backend, so the brain is reached over
HTTP — the same verified, rate-limited, idempotent ``POST /api/interviews/:id/answer`` the
typed room uses. One-shot only (no streaming). A single same-``requestId`` retry on a
transport/5xx failure lets the server REPLAY its last result rather than double-submit the
answer to the FSM.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Self, cast

import httpx

from contracts import AnswerResult, BrainTransientError, Expects, TerminalError, Utterance

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "http://localhost:5001"
_DEFAULT_TIMEOUT_S = 30.0
_RETRY_BACKOFF_S = 0.25
_TERMINAL_MSG = "Interview is no longer in progress."
_VALID_EXPECTS: frozenset[str] = frozenset({"voice", "text", "code"})


class RestBrainClient:
    """One-shot REST client for the interview brain's ``/answer`` route.

    Args:
        base_url:  Backend origin. Falls back to ``$OVERFORGE_API_URL`` then localhost.
        client:    Inject an :class:`httpx.AsyncClient` (e.g. with ``MockTransport``) for tests.
                   It MUST have a ``base_url`` set — requests use relative paths. When omitted, an
                   owned client is created (with ``base_url``) and closed by :meth:`aclose`.
        timeout:   Per-request timeout (seconds) for the owned client.

    Usable as an async context manager (``async with RestBrainClient() as brain: ...``) to close
    the owned client on exit.
    """

    def __init__(
        self,
        base_url: str | None = None,
        *,
        client: httpx.AsyncClient | None = None,
        timeout: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._base_url = (
            base_url or os.environ.get("OVERFORGE_API_URL") or _DEFAULT_BASE_URL
        ).rstrip("/")
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(base_url=self._base_url, timeout=timeout)

    async def submit_answer(
        self, interview_id: str, token: str, answer: str, request_id: str
    ) -> AnswerResult:
        """POST the transcribed answer and return the next interviewer utterance.

        Raises:
            TerminalError:       on HTTP 409 (interview not in progress / time limit) or 403
                                 (dead/invalid session token) — retrying is futile, end the session.
            BrainTransientError: on transport error / timeout / 5xx (after one same-``requestId``
                                 retry), 429 (rate limited), malformed response, or other non-2xx.
        """
        path = f"/api/interviews/{interview_id}/answer"
        body = {"token": token, "answer": answer, "requestId": request_id}

        last_detail: str | None = None
        for attempt in (1, 2):  # one same-requestId retry; the server replays on a duplicate
            try:
                resp = await self._client.post(path, json=body)
            except (
                httpx.TransportError
            ) as exc:  # includes timeouts (TimeoutException ⊂ TransportError)
                last_detail = repr(exc)
                logger.warning("answer POST transport error (attempt %d/2): %s", attempt, exc)
                if attempt == 1:
                    await asyncio.sleep(_RETRY_BACKOFF_S)
                continue

            if resp.status_code == 200:
                return self._parse(resp)
            if resp.status_code in (403, 409):
                # 409 = interview not in progress / time-limit; 403 = dead/invalid session token.
                # Both are terminal — retrying cannot help, so end the session rather than loop.
                raise TerminalError(self._error_message(resp) or _TERMINAL_MSG)
            if resp.status_code == 429:
                # Rate limited. Surface the Retry-After (don't tight-loop the limiter) and let the
                # caller back off; treated as transient so the session stays alive.
                retry_after = resp.headers.get("Retry-After", "?")
                logger.warning("answer POST rate-limited (Retry-After=%s)", retry_after)
                raise BrainTransientError(f"Rate limited (retry after {retry_after}s)")
            if resp.status_code >= 500:
                last_detail = f"server {resp.status_code}"
                logger.warning("answer POST %d (attempt %d/2)", resp.status_code, attempt)
                if attempt == 1:
                    await asyncio.sleep(_RETRY_BACKOFF_S)
                continue
            # Other 4xx (e.g. 400 empty answer — guarded upstream) — not retryable, not terminal;
            # surface as transient so the session stays alive and the typed fallback keeps working.
            raise BrainTransientError(
                f"answer POST failed {resp.status_code}: {self._error_message(resp)}"
            )

        raise BrainTransientError(f"answer POST failed after retry: {last_detail}")

    @staticmethod
    def _parse(resp: httpx.Response) -> AnswerResult:
        """Parse a 200 AnswerResult. A malformed/non-JSON body becomes a BrainTransientError so the
        session recovers via the normal transient path rather than crashing mid-turn."""
        try:
            data = resp.json()
            utt = data["utterance"]
            expects = utt.get("expects", "text")
            if expects not in _VALID_EXPECTS:
                logger.warning(
                    "Unexpected 'expects' from brain: %r — defaulting to 'text'.", expects
                )
                expects = "text"
            return AnswerResult(
                utterance=Utterance(text=str(utt.get("text", "")), expects=cast(Expects, expects)),
                phase=str(data.get("phase", "")),
                state=data.get("state") or {},
            )
        except (KeyError, TypeError, AttributeError, ValueError) as exc:
            raise BrainTransientError(f"malformed brain response: {exc!r}") from exc

    @staticmethod
    def _error_message(resp: httpx.Response) -> str:
        try:
            return str(resp.json().get("error", ""))
        except (ValueError, AttributeError):
            return ""

    async def aclose(self) -> None:
        """Close the underlying client if this instance owns it."""
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()
