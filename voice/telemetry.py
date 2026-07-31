"""Telemetry sink for per-turn voice pipeline metrics.

The Python voice service has NO Supabase credentials.  It POSTs turn telemetry
to the backend, which owns the service-role client and writes the DB row.

Fire-and-forget contract: ``RestTelemetrySink.record()`` swallows ALL exceptions
so a telemetry failure can never block or break a turn.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Protocol

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "http://localhost:5001"
_DEFAULT_TIMEOUT_S = 5.0


@dataclass(frozen=True)
class TurnTelemetry:
    """Immutable snapshot of per-turn latency and classification fields."""

    request_id: str
    commit: str
    audio_s: float
    stt_ms: float
    oracle_ms: float | None
    tts_ms: float | None
    gap_ms: float
    phase: str
    empty: bool
    terminal: bool
    #: Primary-engine transcript for this turn — the pairwise reference for A/B disagreement.
    primary_transcript: str = ""
    #: Shadow STT engine run in parallel on the same audio ("soniox"); None when no shadow ran.
    shadow_engine: str | None = None
    #: Shadow transcript for the SAME audio window as ``primary_transcript`` (log-only).
    shadow_transcript: str | None = None
    #: Rough shadow finalization latency (ms from window start to last shadow final token).
    shadow_stt_ms: float | None = None
    #: When the shadow engine's OWN semantic endpoint (its EOT) first fired, ms from window start
    #: (None = it never fired). Compare to audio_s*1000 (when the primary actually cut the turn).
    shadow_endpoint_ms: float | None = None
    #: Count of shadow semantic endpoints in the window (0 = never ended; >=2 = would have split).
    shadow_endpoint_count: int | None = None
    #: Browser-measured TTFB: performance.now() delta from turn_ready receipt to first PCM sample
    #: scheduled for playback (ms).  None when the client didn't report it or TTS failed entirely.
    first_audio_ms: float | None = None
    #: True when the candidate barged in mid-utterance, cutting the interviewer short.
    barge_in: bool = False


class TelemetrySink(Protocol):
    """Protocol satisfied by any telemetry sink (real or noop)."""

    async def record(self, t: TurnTelemetry) -> None: ...


class NoopTelemetrySink:
    """Default no-op sink used in headless mode and tests that don't care about telemetry."""

    async def record(self, t: TurnTelemetry) -> None:
        pass


class RestTelemetrySink:
    """Posts per-turn telemetry to the backend's ``/api/interviews/:id/voice-turn`` route.

    Mirrors :class:`brain_client.RestBrainClient` in construction and ownership semantics:
    - ``base_url`` falls back to ``$OVERFORGE_API_URL`` then ``http://localhost:5001``.
    - When ``client`` is injected the caller owns it (no double-close); when omitted, this
      class creates and owns a client closed by :meth:`aclose`.
    - ``record()`` swallows ALL exceptions — telemetry must never propagate to the turn loop.

    Args:
        interview_id:  The interview row id (path segment).
        token:         The rotated session token (same one used for ``/answer``).
        client:        Optional injected :class:`httpx.AsyncClient` (e.g. shared with the brain).
                       Must have ``base_url`` set if injected. When ``None`` an owned client is
                       created.
        base_url:      Backend origin override.  Falls back to ``$OVERFORGE_API_URL`` then
                       ``http://localhost:5001``.
        timeout:       Per-request timeout in seconds for the owned client.
    """

    def __init__(
        self,
        interview_id: str,
        token: str,
        *,
        client: httpx.AsyncClient | None = None,
        base_url: str | None = None,
        timeout: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._interview_id = interview_id
        self._token = token
        resolved_base = (
            base_url or os.environ.get("OVERFORGE_API_URL") or _DEFAULT_BASE_URL
        ).rstrip("/")
        self._owns_client = client is None
        self._client: httpx.AsyncClient = client or httpx.AsyncClient(
            base_url=resolved_base, timeout=timeout
        )

    async def record(self, t: TurnTelemetry) -> None:
        """POST one telemetry row.  Swallows ALL exceptions — fire-and-forget."""
        try:
            path = f"/api/interviews/{self._interview_id}/voice-turn"
            body: dict[str, object] = {
                "token": self._token,
                "requestId": t.request_id,
                "commit": t.commit,
                "audioS": t.audio_s,
                "sttMs": t.stt_ms,
                "oracleMs": t.oracle_ms,
                "ttsMs": t.tts_ms,
                "gapMs": t.gap_ms,
                "phase": t.phase,
                "empty": t.empty,
                "terminal": t.terminal,
                "primaryTranscript": t.primary_transcript,
                "shadowEngine": t.shadow_engine,
                "shadowTranscript": t.shadow_transcript,
                "shadowSttMs": t.shadow_stt_ms,
                "shadowEndpointMs": t.shadow_endpoint_ms,
                "shadowEndpointCount": t.shadow_endpoint_count,
                "firstAudioMs": t.first_audio_ms,
                "bargeIn": t.barge_in,
            }
            resp = await self._client.post(path, json=body)
            if resp.status_code not in (200, 204):
                logger.debug(
                    "voice-turn telemetry: unexpected status %d for %s",
                    resp.status_code,
                    self._interview_id,
                )
        except Exception:
            logger.debug(
                "voice-turn telemetry POST failed for %s — swallowed.", self._interview_id
            )

    async def aclose(self) -> None:
        """Close the underlying client if this instance owns it."""
        if self._owns_client:
            await self._client.aclose()
