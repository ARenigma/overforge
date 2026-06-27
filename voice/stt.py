"""Whisper-small STT wrapper for Overforge P2-B — finalize-on-EOT transcriber.

This runs ONCE per committed turn (off the talk-back hot path) after the endpointer fires.
The design choice: whisper-small on CPU int8 runs at 0.12x real-time (8x faster than real-time),
so even a 30 s answer takes ~3.5 s to transcribe — well inside the window while the TTS system
fetches the oracle response.  See RESULTS_replay_stream.md for the benchmark.
"""
from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger(__name__)

_SR = 16_000
_DEFAULT_MODEL = "small"
_DEFAULT_DEVICE = "cpu"
_DEFAULT_COMPUTE_TYPE = "int8"


class WhisperSTT:
    """Transcribe committed candidate audio with faster-whisper (whisper-small, CPU, int8).

    Usage::

        stt = WhisperSTT()
        text = stt.transcribe(audio_np)   # audio_np: float32 1-D array @ 16 kHz

    The model is lazy-loaded on first call and cached for the lifetime of the object.
    """

    def __init__(
        self,
        model_size: str = _DEFAULT_MODEL,
        device: str = _DEFAULT_DEVICE,
        compute_type: str = _DEFAULT_COMPUTE_TYPE,
    ) -> None:
        """Create a WhisperSTT instance.

        Args:
            model_size:    faster-whisper model identifier (default "small").
            device:        Inference device, "cpu" or "cuda" (default "cpu").
            compute_type:  Quantisation level, e.g. "int8", "float16" (default "int8").
        """
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model = None  # lazy-loaded

    def _ensure_model(self) -> None:
        if self._model is not None:
            return
        try:
            from faster_whisper import WhisperModel  # noqa: PLC0415
        except ImportError as exc:
            raise ImportError(
                "faster-whisper is not installed. Run: uv add faster-whisper"
            ) from exc
        logger.info(
            "Loading faster-whisper %s (device=%s, compute_type=%s) …",
            self._model_size, self._device, self._compute_type,
        )
        self._model = WhisperModel(
            self._model_size,
            device=self._device,
            compute_type=self._compute_type,
        )
        logger.info("faster-whisper model loaded.")

    def transcribe(self, audio: np.ndarray, language: str = "en") -> str:
        """Transcribe a committed candidate turn.

        Args:
            audio:    Float32 mono PCM at 16 kHz.  The entire committed turn audio (post-EOT).
            language: BCP-47 language code passed to Whisper (default "en").

        Returns:
            Transcribed text with leading/trailing whitespace stripped.
        """
        self._ensure_model()

        audio = np.asarray(audio, dtype=np.float32)
        if audio.ndim != 1:
            raise ValueError(f"Expected 1-D audio array; got shape {audio.shape}")

        segments, _info = self._model.transcribe(  # type: ignore[union-attr]
            audio,
            language=language,
            beam_size=5,
            word_timestamps=False,
        )
        text = " ".join(seg.text for seg in segments).strip()
        logger.debug("STT result: %r (%.1f s audio)", text, len(audio) / _SR)
        return text
