"""Smart Turn v3 (pipecat-ai) adapter — ONNX on CPU + Silero-VAD gate."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

from adapters.base import BaseAdapter, ClipResult, EOTEvent
from adapters.silero_vad import SileroVADAdapter, get_silero_model

logger = logging.getLogger(__name__)

_SR = 16_000
# Frame stride used by Smart Turn (20ms = 320 samples)
_STRIDE_SAMPLES = 320
# Context window expected by Smart Turn v3: 21 frames × 320 = 6720 samples
_CONTEXT_FRAMES = 21
_VAD_FRAME_SAMPLES = 512

# HF model IDs to try, in preference order
_HF_MODELS = [
    ("pipecat-ai/smart-turn", "smart_turn_v3.onnx"),
    ("pipecat-ai/smart-turn", "smart_turn_v2.onnx"),
]

_MODEL_CACHE_DIR = Path.home() / ".cache" / "voice-turn-bakeoff" / "smart-turn"


def _try_download_model() -> Path | None:
    """
    Attempt to download the Smart Turn ONNX model from HuggingFace.

    Returns the local path if successful, None otherwise.
    """
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import HfHubHTTPError

    _MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    for repo_id, filename in _HF_MODELS:
        local_path = _MODEL_CACHE_DIR / filename
        if local_path.exists():
            logger.info("Smart Turn model already cached at %s", local_path)
            return local_path
        logger.info("Attempting to fetch %s from %s …", filename, repo_id)
        try:
            downloaded = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                cache_dir=str(_MODEL_CACHE_DIR),
                local_dir=str(_MODEL_CACHE_DIR),
            )
            logger.info("Downloaded Smart Turn model to %s", downloaded)
            return Path(downloaded)
        except HfHubHTTPError as exc:
            logger.warning("HF HTTP error fetching %s/%s: %s", repo_id, filename, exc)
        except Exception:
            logger.exception("Unexpected error fetching %s/%s", repo_id, filename)

    return None


def _load_onnx_session(model_path: Path) -> Any:
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.inter_op_num_threads = 1
    opts.intra_op_num_threads = os.cpu_count() or 2
    session = ort.InferenceSession(str(model_path), sess_options=opts)
    logger.info(
        "ONNX session loaded. Inputs: %s",
        [i.name for i in session.get_inputs()],
    )
    return session


def _extract_log_mel(audio_chunk: np.ndarray) -> np.ndarray:
    """
    Compute an 80-band log-mel spectrogram matching OpenAI Whisper / Smart Turn
    feature extraction conventions (no normalisation beyond log).
    """
    import librosa

    mel = librosa.feature.melspectrogram(
        y=audio_chunk,
        sr=_SR,
        n_fft=512,
        hop_length=_STRIDE_SAMPLES,
        n_mels=80,
        fmax=8000,
    )
    log_mel = librosa.power_to_db(mel, ref=np.max)
    return log_mel.astype(np.float32)


class SmartTurnV3Adapter(BaseAdapter):
    """
    Smart Turn v3 (ONNX) gated by Silero VAD.

    Operating params:
        stop_secs (float): Silence-fallback timeout in seconds (1.0–6.0).
        model_threshold (float): Smart Turn classification threshold (0–1).
        vad_threshold (float): Silero VAD speech/silence threshold.
    """

    NAME = "smart_turn_v3"

    def __init__(
        self,
        stop_secs: float = 2.0,
        model_threshold: float = 0.5,
        vad_threshold: float = 0.5,
    ) -> None:
        super().__init__(
            stop_secs=stop_secs,
            model_threshold=model_threshold,
            vad_threshold=vad_threshold,
        )
        self.stop_secs = stop_secs
        self.model_threshold = model_threshold
        self.vad_threshold = vad_threshold

        self._session: Any | None = None
        self._model_available: bool | None = None  # None = not yet checked
        self._vad_adapter = SileroVADAdapter(
            stop_secs=stop_secs, vad_threshold=vad_threshold
        )

    def _ensure_model(self) -> bool:
        """Return True if ONNX session is available."""
        if self._model_available is not None:
            return self._model_available

        model_path = _try_download_model()
        if model_path is None:
            logger.warning(
                "SmartTurnV3: ONNX model unavailable — adapter will fall back to "
                "pure Silero-VAD timeout for this run."
            )
            self._model_available = False
            return False

        try:
            self._session = _load_onnx_session(model_path)
            self._model_available = True
        except Exception:
            logger.exception("SmartTurnV3: failed to load ONNX session")
            self._model_available = False

        return self._model_available

    def _run_model_inference(
        self, audio: np.ndarray, end_sample: int
    ) -> float:
        """
        Run Smart Turn model on the audio up to end_sample.

        Returns the EOT probability from the model.
        """
        assert self._session is not None
        # Take the last ~6720 samples (21 frames × 320) as context
        context_samples = _CONTEXT_FRAMES * _STRIDE_SAMPLES
        start = max(0, end_sample - context_samples)
        chunk = audio[start:end_sample]
        if len(chunk) < _STRIDE_SAMPLES:
            return 0.0

        # Pad to full context if shorter
        if len(chunk) < context_samples:
            pad = np.zeros(context_samples - len(chunk), dtype=np.float32)
            chunk = np.concatenate([pad, chunk])

        log_mel = _extract_log_mel(chunk)  # shape (80, n_frames)
        # Model expects (1, 80, n_frames)
        input_tensor = log_mel[np.newaxis, ...]

        # Discover the input name dynamically
        input_name = self._session.get_inputs()[0].name
        outputs = self._session.run(None, {input_name: input_tensor})
        # First output, first batch item: expected shape (1,) or scalar
        eot_prob = float(np.squeeze(outputs[0]))
        # Clip to [0, 1] for robustness
        return float(np.clip(eot_prob, 0.0, 1.0))

    def detect(
        self,
        audio: np.ndarray,
        sample_rate: int,
        clip_id: str,
        is_complete: bool,
    ) -> ClipResult:
        import torch

        # Resample if needed
        if sample_rate != _SR:
            import librosa

            audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=_SR)

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

        model_ok = self._ensure_model()
        if not model_ok:
            # Fall back to pure Silero-VAD
            logger.info(
                "SmartTurnV3[%s]: using Silero-VAD fallback (stop_secs=%.1f)",
                clip_id,
                self.stop_secs,
            )
            self._vad_adapter.stop_secs = self.stop_secs
            self._vad_adapter.vad_threshold = self.vad_threshold
            fallback = self._vad_adapter.detect(audio, _SR, clip_id, is_complete)
            result.timeline = fallback.timeline
            result.fired_at_ms = fallback.fired_at_ms
            # Tag that this was a fallback
            result.params["_fallback"] = "silero_vad"
            return result

        # --- Model-gated path ---
        vad_model, _ = get_silero_model()
        stop_samples = int(self.stop_secs * _SR)
        silence_count = 0
        timeline: list[EOTEvent] = []

        n_frames = len(audio) // _VAD_FRAME_SAMPLES

        for i in range(n_frames):
            frame_start = i * _VAD_FRAME_SAMPLES
            frame = audio[frame_start : frame_start + _VAD_FRAME_SAMPLES]
            t_ms = frame_start / _SR * 1000.0

            with torch.no_grad():
                tensor = torch.from_numpy(frame).unsqueeze(0)
                speech_prob = float(vad_model(tensor, _SR).item())

            is_speech = speech_prob >= self.vad_threshold

            if not is_speech:
                silence_count += _VAD_FRAME_SAMPLES
            else:
                silence_count = 0

            # After 200ms of silence, query Smart Turn
            if silence_count >= int(0.2 * _SR):
                eot_prob = self._run_model_inference(audio, frame_start + _VAD_FRAME_SAMPLES)
            else:
                eot_prob = 0.0

            timeline.append(EOTEvent(t_ms=t_ms, eot_prob=eot_prob))

            # Fire if model says EOT OR silence fallback triggers
            model_fires = eot_prob >= self.model_threshold
            silence_fires = silence_count >= stop_samples

            if (model_fires or silence_fires) and result.fired_at_ms is None:
                result.fired_at_ms = t_ms
                logger.debug(
                    "SmartTurnV3[%s] fired at %.0f ms (model=%s, silence=%s, eot_prob=%.3f)",
                    clip_id,
                    t_ms,
                    model_fires,
                    silence_fires,
                    eot_prob,
                )
                break

        result.timeline = timeline
        return result
