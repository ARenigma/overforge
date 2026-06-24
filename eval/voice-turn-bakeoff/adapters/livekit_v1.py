"""
LiveKit v1 EOT adapter — STUB (Phase 2).

Integration notes:
- Requires: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET env vars.
- LiveKit Agents framework (livekit-agents>=0.8) has a built-in EOT detector
  (`EndOfUtteranceDetector`) based on Silero VAD + optional LLM turn detection.
- For offline eval: use `livekit.agents.vad.VAD` in isolation (no room needed)
  or inject audio frames into a local AudioSource.
- Operating params: min_endpointing_delay (0.0–3.0s), max_endpointing_delay (3.0–8.0s).
- TODO Phase 2: instantiate `AgentsVAD` with silence thresholds and drive it with
  pre-recorded PCM frames; map EndOfUtterance events to fired_at_ms.
- Package: `pip install livekit-agents[silero]`
"""
from __future__ import annotations

import logging

import numpy as np

from adapters.base import BaseAdapter, ClipResult

logger = logging.getLogger(__name__)


class LiveKitV1Adapter(BaseAdapter):
    """Stub — not implemented in Phase 1 (requires LiveKit infra + SDK)."""

    NAME = "livekit_v1"

    def __init__(
        self,
        min_endpointing_delay: float = 0.5,
        max_endpointing_delay: float = 4.0,
    ) -> None:
        super().__init__(
            min_endpointing_delay=min_endpointing_delay,
            max_endpointing_delay=max_endpointing_delay,
        )
        raise NotImplementedError(
            "LiveKitV1Adapter requires livekit-agents SDK and LIVEKIT_* env vars. "
            "Implement in Phase 2."
        )

    def detect(
        self,
        audio: np.ndarray,
        sample_rate: int,
        clip_id: str,
        is_complete: bool,
    ) -> ClipResult:
        raise NotImplementedError
