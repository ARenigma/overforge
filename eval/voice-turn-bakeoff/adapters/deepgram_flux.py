"""
Deepgram Flux EOT adapter — STUB (Phase 2).

Integration notes:
- Requires: DEEPGRAM_API_KEY env var.
- Endpoint: wss://api.deepgram.com/v1/listen with endpointing=true.
- Send 20ms PCM frames over the websocket; Deepgram emits SpeechFinal events.
- Map SpeechFinal → fired_at_ms.
- Operating param: endpointing_ms (100–2000).
- TODO Phase 2: implement using `deepgram-sdk` (async websocket client).
"""
from __future__ import annotations

import logging

import numpy as np

from adapters.base import BaseAdapter, ClipResult

logger = logging.getLogger(__name__)


class DeepgramFluxAdapter(BaseAdapter):
    """Stub — not implemented in Phase 1 (requires API key)."""

    NAME = "deepgram_flux"

    def __init__(self, endpointing_ms: int = 500) -> None:
        super().__init__(endpointing_ms=endpointing_ms)
        raise NotImplementedError(
            "DeepgramFluxAdapter requires a DEEPGRAM_API_KEY and live network access. "
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
