"""Base adapter ABC for end-of-turn (EOT) detectors."""
from __future__ import annotations

import abc
import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EOTEvent:
    """A single end-of-turn probability sample at a given time."""

    t_ms: float
    eot_prob: float


@dataclass
class ClipResult:
    """Result of running an adapter on a single clip."""

    adapter_name: str
    clip_id: str
    params: dict[str, Any]
    # List of (t_ms, eot_prob) time-series
    timeline: list[EOTEvent] = field(default_factory=list)
    # Timestamp of first EOT fire (None = never fired within clip)
    fired_at_ms: float | None = None
    # Ground truth
    is_complete: bool = False
    # Clip duration in ms
    duration_ms: float = 0.0


class BaseAdapter(abc.ABC):
    """
    Abstract base for an EOT-detection adapter.

    Subclasses process a mono 16 kHz PCM array and return a ClipResult.
    """

    NAME: str = "base"

    def __init__(self, **params: Any) -> None:
        self.params = params

    @abc.abstractmethod
    def detect(
        self,
        audio: np.ndarray,
        sample_rate: int,
        clip_id: str,
        is_complete: bool,
    ) -> ClipResult:
        """
        Run EOT detection on a mono PCM audio array.

        Args:
            audio: Mono float32 PCM array, already at `sample_rate` Hz.
            sample_rate: Sample rate (expected 16000).
            clip_id: Unique identifier for the clip (for logging / CSV rows).
            is_complete: Ground-truth label — True = the clip ends with a real EOT.

        Returns:
            ClipResult with timeline and fired_at_ms populated.
        """
        ...

    def param_key(self) -> str:
        """Return a stable string key representing the current param set."""
        parts = [f"{k}={v}" for k, v in sorted(self.params.items())]
        return "|".join(parts)
