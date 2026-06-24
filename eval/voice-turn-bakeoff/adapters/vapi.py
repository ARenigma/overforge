"""
VAPI EOT adapter — STUB (Phase 2).

Integration notes:
- Requires: VAPI_API_KEY + VAPI_PHONE_NUMBER_ID env vars.
- VAPI uses Deepgram under the hood; EOT is controlled via server-url webhooks.
- For offline evaluation, simulate via VAPI's real-time call API with audio injection
  (not yet supported in the public SDK as of 2025-06).
- Alternative: use VAPI's transcriber config (endpointing_ms param) with a mock call.
- TODO Phase 2: check if VAPI exposes a batch-eval endpoint; otherwise use Deepgram
  directly with matching VAPI defaults.
"""
from __future__ import annotations

import logging

import numpy as np

from adapters.base import BaseAdapter, ClipResult

logger = logging.getLogger(__name__)


class VAPIAdapter(BaseAdapter):
    """Stub — not implemented in Phase 1 (requires API key + live call infra)."""

    NAME = "vapi"

    def __init__(self, endpointing_ms: int = 500) -> None:
        super().__init__(endpointing_ms=endpointing_ms)
        raise NotImplementedError(
            "VAPIAdapter requires VAPI_API_KEY and live network + call infrastructure. "
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
