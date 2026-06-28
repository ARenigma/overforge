"""Smart Turn v3.2 (pipecat-ai) adapter — uses the bundled ONNX + Whisper-style features.

Architecture: Wav2Vec2BertForSequenceClassification fine-tuned on turn-completion audio.
Input: 8 s of 16 kHz mono audio → Whisper log-mel (80 bins, hop=160, n_fft=400) → (1, 80, 800).
Output: logit (higher = more likely end-of-turn); sigmoid gives P(complete).
Gate: Silero-VAD post-speech silence gate — model only runs after ≥ 200 ms silence.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

# Use pipecat's EXACT feature extractor — hand-rolling it drifted and broke the model
# (the model is sensitive to the precise WhisperFeatureExtractor replication).
from pipecat.audio.turn.smart_turn._whisper_features import (
    compute_whisper_log_mel_features as _pipecat_log_mel,
)

from adapters.base import BaseAdapter, ClipResult, EOTEvent
from adapters.silero_vad import SileroVADAdapter, get_silero_model

logger = logging.getLogger(__name__)

_SR = 16_000
# Silero-VAD frame size (512 samples @ 16kHz = 32ms)
_VAD_FRAME_SAMPLES = 512
# Smart Turn v3.2 expects exactly 8 s of audio (128 000 samples)
_MODEL_SAMPLES = _SR * 8  # 128_000
# Trigger Smart Turn after this much consecutive silence
_SILENCE_GATE_SAMPLES = int(0.2 * _SR)  # 200 ms


def _get_onnx_path() -> Path:
    """Return path to the bundled Smart Turn v3.2 ONNX from the pipecat-ai package."""
    try:
        import importlib.resources as ir

        import pipecat.audio.turn.smart_turn.data as data_pkg

        p = ir.files(data_pkg).joinpath("smart-turn-v3.2-cpu.onnx")
        if os.path.exists(str(p)):
            return Path(str(p))
    except Exception:
        logger.exception("Could not locate bundled ONNX via importlib.resources")

    raise FileNotFoundError(
        "smart-turn-v3.2-cpu.onnx not found. "
        "Install pipecat-ai: uv add pipecat-ai"
    )


def _load_onnx_session(model_path: Path) -> Any:
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    so.inter_op_num_threads = 1
    so.intra_op_num_threads = os.cpu_count() or 2
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(str(model_path), sess_options=so)
    logger.info(
        "ONNX session loaded from %s. Inputs: %s  Outputs: %s",
        model_path,
        [(i.name, i.shape) for i in session.get_inputs()],
        [(o.name, o.shape) for o in session.get_outputs()],
    )
    return session


# ---------------------------------------------------------------------------
# Whisper-style log-mel feature extraction (matches pipecat _whisper_features)
# Exact constants from pipecat-ai/pipecat src/pipecat/audio/turn/smart_turn/_whisper_features.py
# ---------------------------------------------------------------------------
_N_FFT = 400
_HOP_LENGTH = 160
_N_MELS = 80
_MEL_FLOOR = 1e-10
_NORM_VARIANCE_EPS = 1e-7


def _hertz_to_mel_slaney(freq: np.ndarray) -> np.ndarray:
    min_log_hertz = 1000.0
    min_log_mel = 15.0
    logstep = 27.0 / np.log(6.4)
    freq = np.atleast_1d(np.asarray(freq, dtype=np.float64))
    mels = 3.0 * freq / 200.0
    log_region = freq >= min_log_hertz
    mels[log_region] = min_log_mel + np.log(freq[log_region] / min_log_hertz) * logstep
    return mels


def _mel_to_hertz_slaney(mels: np.ndarray) -> np.ndarray:
    min_log_hertz = 1000.0
    min_log_mel = 15.0
    logstep = np.log(6.4) / 27.0
    mels = np.atleast_1d(np.asarray(mels, dtype=np.float64))
    freq = 200.0 * mels / 3.0
    log_region = mels >= min_log_mel
    freq[log_region] = min_log_hertz * np.exp(logstep * (mels[log_region] - min_log_mel))
    return freq


def _build_mel_filterbank(
    num_frequency_bins: int,
    num_mel_filters: int,
    min_frequency: float,
    max_frequency: float,
    sampling_rate: int,
) -> np.ndarray:
    mel_min = float(_hertz_to_mel_slaney(np.array([min_frequency], dtype=np.float64))[0])
    mel_max = float(_hertz_to_mel_slaney(np.array([max_frequency], dtype=np.float64))[0])
    mel_freqs = np.linspace(mel_min, mel_max, num_mel_filters + 2)
    filter_freqs = _mel_to_hertz_slaney(mel_freqs)
    fft_freqs = np.linspace(0, sampling_rate // 2, num_frequency_bins)
    filter_diff = np.diff(filter_freqs)
    slopes = np.expand_dims(filter_freqs, 0) - np.expand_dims(fft_freqs, 1)
    down_slopes = -slopes[:, :-2] / filter_diff[:-1]
    up_slopes = slopes[:, 2:] / filter_diff[1:]
    mel_filters = np.maximum(np.zeros(1), np.minimum(down_slopes, up_slopes))
    enorm = 2.0 / (filter_freqs[2 : num_mel_filters + 2] - filter_freqs[:num_mel_filters])
    mel_filters *= np.expand_dims(enorm, 0)
    return mel_filters


def _periodic_hann_window(window_length: int) -> np.ndarray:
    return np.hanning(window_length + 1)[:-1]


# Precomputed constants — matches pipecat's _whisper_features.py exactly
_HANN_WINDOW = _periodic_hann_window(_N_FFT)
_MEL_FILTERS = _build_mel_filterbank(
    num_frequency_bins=_N_FFT // 2 + 1,
    num_mel_filters=_N_MELS,
    min_frequency=0.0,
    max_frequency=_SR / 2.0,
    sampling_rate=_SR,
)


def compute_whisper_log_mel(audio: np.ndarray, *, do_normalize: bool = True) -> np.ndarray:
    """Log-mel features (80, 800) via pipecat's EXACT extractor.

    Truncate to the last 8 s, or pad with zeros at the BEGINNING (pipecat keeps the
    speech at the END of the window, where the model makes its decision), then delegate
    to pipecat's vendored WhisperFeatureExtractor replication.
    """
    if audio.ndim != 1:
        raise ValueError(f"Expected 1-D audio, got shape {audio.shape}")
    x = np.asarray(audio, dtype=np.float32)
    if x.size > _MODEL_SAMPLES:
        x = x[-_MODEL_SAMPLES:]
    elif x.size < _MODEL_SAMPLES:
        x = np.pad(x, (_MODEL_SAMPLES - x.size, 0), mode="constant")  # pad at the BEGINNING
    return _pipecat_log_mel(x, do_normalize=do_normalize)


class SmartTurnV3Adapter(BaseAdapter):
    """Smart Turn v3.2 (ONNX) gated by Silero VAD.

    Operating params:
        stop_secs (float): Silence-fallback timeout in seconds (1.0–6.0).
        model_threshold (float): P(complete) threshold for Smart Turn to fire (0–1).
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
        self._model_available: bool | None = None  # None = not yet attempted
        self._vad_adapter = SileroVADAdapter(
            stop_secs=stop_secs, vad_threshold=vad_threshold
        )

    def _ensure_model(self) -> bool:
        """Return True if ONNX session is ready."""
        if self._model_available is not None:
            return self._model_available

        try:
            model_path = _get_onnx_path()
            self._session = _load_onnx_session(model_path)
            self._model_available = True
        except FileNotFoundError:
            logger.warning(
                "SmartTurnV3: ONNX model unavailable — falling back to Silero-VAD timeout."
            )
            self._model_available = False
        except Exception:
            logger.exception("SmartTurnV3: failed to load ONNX session")
            self._model_available = False

        return self._model_available

    def _run_model_inference(self, audio: np.ndarray, end_sample: int) -> float:
        """Run Smart Turn v3.2 on audio[0:end_sample].

        Takes the last 8 s of context ending at end_sample, computes Whisper
        log-mel features (80×800), and returns sigmoid(logit) = P(complete).
        """
        assert self._session is not None
        chunk = audio[:end_sample]
        # Pad front to 8 s (model always sees the last 8 s — matches pipecat truncate logic)
        if len(chunk) < _MODEL_SAMPLES:
            pad = np.zeros(_MODEL_SAMPLES - len(chunk), dtype=np.float32)
            chunk = np.concatenate([pad, chunk])
        else:
            chunk = chunk[-_MODEL_SAMPLES:]

        log_mel = compute_whisper_log_mel(chunk, do_normalize=True)
        # input_features: (batch=1, n_mels=80, n_frames=800)
        input_tensor = log_mel[np.newaxis, ...]  # (1, 80, 800)

        outputs = self._session.run(None, {"input_features": input_tensor})
        # The ONNX graph already applies the final sigmoid — outputs[0][0] IS P(complete)
        # in [0,1] (pipecat reads it directly). Applying sigmoid again was the bug that
        # compressed every score into [0.5, 0.73]. Use it raw.
        return float(np.asarray(outputs[0]).reshape(-1)[0])

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

        if not self._ensure_model():
            # Fall back to pure Silero-VAD timeout
            logger.info("SmartTurnV3[%s]: using Silero-VAD fallback", clip_id)
            self._vad_adapter.stop_secs = self.stop_secs
            self._vad_adapter.vad_threshold = self.vad_threshold
            fallback = self._vad_adapter.detect(audio, _SR, clip_id, is_complete)
            result.timeline = fallback.timeline
            result.fired_at_ms = fallback.fired_at_ms
            result.params["_fallback"] = "silero_vad"
            return result

        # --- Model-gated path: Silero-VAD silence gate → Smart Turn ---
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

            # Only invoke Smart Turn after ≥ 200 ms of consecutive silence
            if silence_count >= _SILENCE_GATE_SAMPLES:
                eot_prob = self._run_model_inference(audio, frame_start + _VAD_FRAME_SAMPLES)
            else:
                eot_prob = 0.0

            timeline.append(EOTEvent(t_ms=t_ms, eot_prob=eot_prob))

            model_fires = eot_prob >= self.model_threshold
            silence_fires = silence_count >= stop_samples

            if (model_fires or silence_fires) and result.fired_at_ms is None:
                result.fired_at_ms = t_ms
                logger.debug(
                    "SmartTurnV3[%s] fired at %.0f ms "
                    "(model=%s p=%.3f, silence_timeout=%s)",
                    clip_id, t_ms, model_fires, eot_prob, silence_fires,
                )
                break

        result.timeline = timeline
        return result
