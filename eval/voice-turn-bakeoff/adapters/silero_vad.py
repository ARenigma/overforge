"""Silero-VAD + fixed silence-timeout baseline adapter."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from adapters.base import BaseAdapter, ClipResult, EOTEvent

logger = logging.getLogger(__name__)

# Frame size that Silero VAD v5 expects (512 samples @ 16kHz = 32ms)
_FRAME_SAMPLES = 512
_SR = 16_000


def _load_silero_model() -> Any:
    """Load the Silero VAD model via torch.hub (cached after first call)."""
    import torch

    try:
        model, utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            onnx=False,
            verbose=False,
        )
        return model, utils
    except Exception:
        logger.exception("Failed to load Silero VAD via torch.hub")
        raise


_silero_model_cache: tuple[Any, Any] | None = None


def get_silero_model() -> tuple[Any, Any]:
    """Return cached (model, utils) pair."""
    global _silero_model_cache  # noqa: PLW0603
    if _silero_model_cache is None:
        _silero_model_cache = _load_silero_model()
    return _silero_model_cache


class SileroVADAdapter(BaseAdapter):
    """
    Pure Silero-VAD baseline.

    Operating params:
        stop_secs (float): Consecutive silence seconds required to fire EOT.
                           Sweep range: 0.5 – 6.0.
        vad_threshold (float): Speech/silence threshold for Silero.
    """

    NAME = "silero_vad"

    def __init__(self, stop_secs: float = 2.0, vad_threshold: float = 0.5) -> None:
        super().__init__(stop_secs=stop_secs, vad_threshold=vad_threshold)
        self.stop_secs = stop_secs
        self.vad_threshold = vad_threshold
        self._model: Any = None

    def _ensure_model(self) -> None:
        if self._model is None:
            self._model, _ = get_silero_model()

    def detect(
        self,
        audio: np.ndarray,
        sample_rate: int,
        clip_id: str,
        is_complete: bool,
    ) -> ClipResult:
        import torch

        self._ensure_model()
        model = self._model

        # Resample if needed
        if sample_rate != _SR:
            import librosa

            audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=_SR)

        # Ensure float32 mono
        audio = audio.astype(np.float32)
        if audio.ndim > 1:
            audio = audio.mean(axis=0)

        duration_ms = len(audio) / _SR * 1000.0
        result = ClipResult(
            adapter_name=self.NAME,
            clip_id=clip_id,
            params=dict(self.params),
            is_complete=is_complete,
            duration_ms=duration_ms,
        )

        stop_samples = int(self.stop_secs * _SR)
        silence_count = 0
        timeline: list[EOTEvent] = []

        # Process frame by frame causally
        n_frames = len(audio) // _FRAME_SAMPLES
        for i in range(n_frames):
            frame_start = i * _FRAME_SAMPLES
            frame = audio[frame_start : frame_start + _FRAME_SAMPLES]
            t_ms = frame_start / _SR * 1000.0

            with torch.no_grad():
                tensor = torch.from_numpy(frame).unsqueeze(0)
                speech_prob: float = float(model(tensor, _SR).item())

            is_speech = speech_prob >= self.vad_threshold
            eot_prob = 1.0 - speech_prob if not is_speech else 0.0
            timeline.append(EOTEvent(t_ms=t_ms, eot_prob=eot_prob))

            if not is_speech:
                silence_count += _FRAME_SAMPLES
            else:
                silence_count = 0

            if silence_count >= stop_samples and result.fired_at_ms is None:
                result.fired_at_ms = t_ms
                break

        result.timeline = timeline
        return result
