"""Streaming, stateful, silence-gated end-of-turn (EOT) detector for Overforge P2-B.

Architecture (validated in eval/voice-turn-bakeoff/replay_gated.py):
  - Silero VAD runs on every incoming 32 ms frame (512 samples @ 16 kHz).
  - When trailing silence FIRST reaches `hold_s` (default 0.8 s), Smart Turn v3.2 is probed
    on the trailing 8-second window. If P(complete) >= `smart_turn_threshold` → fire EOT.
  - One Smart Turn probe per qualifying silence onset (hold reached) — no spamming.
  - If trailing silence reaches `backstop_s` (default 3.0 s) → fire EOT regardless.
  - When speech resumes the silence counter is reset; a new silence onset starts fresh.

Key decision:
  Clause-boundary pauses are short (< 0.5 s); a real end-of-turn silence persists past the hold.
  The hold gate is what makes Smart Turn safe — at 0.8 s HOLD the validated offline FCR drops from
  ~70% (Smart Turn alone) to ~10% on Buckeye interviewee turns.  See eval/voice-turn-bakeoff/
  RESULTS_replay_gated.md and RESULTS_replay_stream.md for the sweep data.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

_SR = 16_000
_VAD_FRAME = 512         # 32 ms @ 16 kHz — Silero VAD v5 native frame size
_WINDOW_S = 8.0          # seconds of audio fed to Smart Turn
_WINDOW_SAMPLES = int(_WINDOW_S * _SR)  # 128 000
# Require at least this much DETECTED speech in a turn before an EOT may fire. Rejects brief
# residual-echo bursts (the interviewer's own audio leaking past AEC / the client gate) that are too
# short to be a real answer; real answers run well over this floor.
_MIN_SPEECH_SAMPLES = int(0.2 * _SR)  # 200 ms


@dataclass
class EotEvent:
    """Fired when the endpointer commits to an end-of-turn decision.

    Attributes:
        cursor_s:  Time (in seconds, measured from the first sample fed to this instance
                   since the last reset()) at which the EOT was committed.
        kind:      "smartturn" — Smart Turn P(complete) crossed the threshold after hold_s of
                   silence; "backstop" — silence exceeded backstop_s so we fire unconditionally.
        prob:      Smart Turn P(complete) at the fire point (1.0 for backstop fires).
        silence_onset_s: When the current trailing-silence run started (seconds from reset).
    """

    cursor_s: float
    kind: str  # "smartturn" | "backstop"
    prob: float
    silence_onset_s: float


@dataclass
class _SilenceState:
    onset_sample: int = 0          # absolute sample index where the current silence started
    consecutive_samples: int = 0   # running count of consecutive silence samples
    hold_probed: bool = False      # True once we've run the Smart Turn probe for this onset


class SilenceGatedEndpointer:
    """Streaming, stateful, real-time silence-gated EOT detector.

    Consumes 32 ms audio frames one at a time (via `feed_frame`) and fires an `EotEvent`
    the moment the end-of-turn policy commits.  Can be reset between speaker turns via `reset()`.

    Args:
        hold_s:                  Minimum trailing-silence duration before Smart Turn may fire.
        smart_turn_threshold:    P(complete) bar for Smart Turn to commit EOT.
        backstop_s:              Unconditional fire if trailing silence exceeds this.
        vad_threshold:           Silero VAD speech/silence threshold.
        vad_model:               Optional pre-loaded Silero VAD model (torch nn.Module).
                                 If None, lazy-loaded on first call (cached globally).
        smart_turn_session:      Optional pre-loaded ONNX InferenceSession.
                                 If None, lazy-loaded on first call.
    """

    def __init__(
        self,
        *,
        hold_s: float = 0.8,
        smart_turn_threshold: float = 0.5,
        backstop_s: float = 3.0,
        vad_threshold: float = 0.5,
        vad_model: Any | None = None,
        smart_turn_session: Any | None = None,
    ) -> None:
        self.hold_s = hold_s
        self.smart_turn_threshold = smart_turn_threshold
        self.backstop_s = backstop_s
        self.vad_threshold = vad_threshold

        self._hold_samples = int(hold_s * _SR)
        self._backstop_samples = int(backstop_s * _SR)

        # Injected or lazy-loaded models
        self._vad_model = vad_model
        self._smart_turn_session = smart_turn_session

        # Ring buffer — keeps the last 8 s of audio so Smart Turn always has full context.
        self._ring: np.ndarray = np.zeros(_WINDOW_SAMPLES, dtype=np.float32)
        self._ring_head: int = 0       # next write position (circular)
        self._total_samples: int = 0   # samples fed since last reset()

        # Silence tracking
        self._sil = _SilenceState()
        self._fired: bool = False       # prevent double-firing per turn
        self._speech_samples: int = 0   # total VAD-speech samples this turn (min-speech gate)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def feed_frame(self, frame: np.ndarray) -> EotEvent | None:
        """Feed one 32 ms frame (512 samples, float32, 16 kHz) and return an EotEvent or None.

        The frame MUST be exactly `_VAD_FRAME` (512) samples.  Callers chunking a larger
        buffer should use `feed()` which handles the slicing automatically.

        Returns:
            EotEvent if the EOT policy fired this frame, else None.
        """
        if self._fired:
            return None  # already committed; caller must reset() for the next turn

        if len(frame) != _VAD_FRAME:
            raise ValueError(f"feed_frame expects exactly {_VAD_FRAME} samples; got {len(frame)}")

        frame = frame.astype(np.float32)

        # 1. Update ring buffer
        self._ring[self._ring_head : self._ring_head + _VAD_FRAME] = frame
        self._ring_head = (self._ring_head + _VAD_FRAME) % _WINDOW_SAMPLES

        sample_end = self._total_samples + _VAD_FRAME
        self._total_samples = sample_end

        # 2. VAD
        is_speech = self._run_vad(frame)

        # 3. Silence accumulation
        if is_speech:
            # Accumulate speech evidence (min-speech gate) + reset silence; a new onset starts if
            # silence resumes.
            self._speech_samples += _VAD_FRAME
            self._sil = _SilenceState()
        else:
            if self._sil.consecutive_samples == 0:
                # New silence onset
                self._sil.onset_sample = sample_end - _VAD_FRAME
            self._sil.consecutive_samples += _VAD_FRAME

        # 4. EOT policy
        return self._check_eot(sample_end)

    def feed(self, pcm: np.ndarray) -> list[EotEvent]:
        """Feed an arbitrary-length PCM buffer (float32, 16 kHz) in 32 ms chunks.

        Convenience wrapper over `feed_frame`.  Returns a list of any EotEvents fired
        (at most one, since the endpointer marks itself fired after the first event).
        """
        pcm = pcm.astype(np.float32)
        events: list[EotEvent] = []
        n_frames = len(pcm) // _VAD_FRAME
        for i in range(n_frames):
            start = i * _VAD_FRAME
            ev = self.feed_frame(pcm[start : start + _VAD_FRAME])
            if ev is not None:
                events.append(ev)
        return events

    def reset(self) -> None:
        """Reset state for a new speaker turn.

        Call this after the EOT fires (and any upstream consumers have processed the committed
        audio) so the endpointer is ready for the next candidate turn.
        """
        self._ring[:] = 0.0
        self._ring_head = 0
        self._total_samples = 0
        self._sil = _SilenceState()
        self._fired = False
        self._speech_samples = 0
        # Reset Silero VAD internal state (it is stateful between frames)
        if self._vad_model is not None and hasattr(self._vad_model, "reset_states"):
            self._vad_model.reset_states()

    @property
    def trailing_silence_s(self) -> float:
        """Current run of trailing silence in seconds (0.0 while in speech). Lets the session commit
        completed speech segments at natural pauses (streaming STT) without duplicating VAD."""
        return self._sil.consecutive_samples / _SR

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_vad(self) -> Any:
        if self._vad_model is None:
            # Imported lazily (torch is heavy) from the vendored voice/adapters package, which is
            # importable whenever the process runs with voice/ on sys.path (tests, the WS service,
            # and the Docker image WORKDIR). No eval/ path hack — adapters ship with the service.
            from adapters.silero_vad import get_silero_model  # noqa: PLC0415

            self._vad_model, _ = get_silero_model()
        return self._vad_model

    def _ensure_smart_turn(self) -> Any:
        if self._smart_turn_session is None:
            from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session  # noqa: PLC0415

            self._smart_turn_session = _load_onnx_session(_get_onnx_path())
        return self._smart_turn_session

    def _run_vad(self, frame: np.ndarray) -> bool:
        """Return True (speech) / False (silence) for this 32 ms frame."""
        import torch

        vad = self._ensure_vad()
        if hasattr(vad, "reset_states") and self._total_samples == _VAD_FRAME:
            # First frame after a reset — ensure Silero internal state is clean
            vad.reset_states()
        tensor = torch.from_numpy(frame).unsqueeze(0)
        with torch.no_grad():
            prob: float = float(vad(tensor, _SR).item())
        return prob >= self.vad_threshold

    def _get_window(self) -> np.ndarray:
        """Return the last up to 8 s of audio from the ring buffer, time-ordered."""
        if self._total_samples < _WINDOW_SAMPLES:
            # Buffer not yet full — return only the samples we've written
            filled = self._total_samples
            # The filled region is ring[ring_head - filled : ring_head] (mod), but since
            # we started at head=0 and haven't wrapped yet, it's simpler:
            # head always points to the NEXT write position; data is 0..head (pre-wrap)
            return self._ring[:filled].copy()
        # Full ring: read from ring_head (oldest) around to ring_head-1 (newest)
        head = self._ring_head
        return np.concatenate([self._ring[head:], self._ring[:head]])

    def _run_smart_turn(self) -> float:
        """Run Smart Turn on the current 8-second window. Returns P(complete) in [0, 1]."""
        from adapters.smart_turn_v3 import compute_whisper_log_mel  # noqa: PLC0415

        window = self._get_window()
        session = self._ensure_smart_turn()
        lm = compute_whisper_log_mel(window)
        outputs = session.run(None, {"input_features": lm[np.newaxis, ...]})
        return float(np.asarray(outputs[0]).reshape(-1)[0])

    def _check_eot(self, sample_end: int) -> EotEvent | None:
        """Apply the silence-gated EOT policy and return an event if it fires."""
        sil = self._sil
        cons = sil.consecutive_samples

        if cons == 0:
            return None  # currently in speech

        # Min-speech gate: never commit a turn that had too little detected speech — that's a brief
        # residual-echo burst (interviewer audio leaking past AEC / the gate), not a real answer.
        if self._speech_samples < _MIN_SPEECH_SAMPLES:
            return None

        cursor_s = sample_end / _SR
        silence_onset_s = sil.onset_sample / _SR

        # Backstop: fire unconditionally if silence has gone on too long
        if cons >= self._backstop_samples:
            logger.debug(
                "EOT backstop fired at %.2f s (%.1f s silence)", cursor_s, cons / _SR
            )
            self._fired = True
            return EotEvent(
                cursor_s=cursor_s,
                kind="backstop",
                prob=1.0,
                silence_onset_s=silence_onset_s,
            )

        # Smart Turn gate: fire once per silence onset when hold is reached
        if cons >= self._hold_samples and not sil.hold_probed:
            sil.hold_probed = True
            prob = self._run_smart_turn()
            logger.debug(
                "Smart Turn probe at %.2f s (%.1f s silence): P(complete)=%.3f",
                cursor_s, cons / _SR, prob,
            )
            if prob >= self.smart_turn_threshold:
                logger.debug("EOT smartturn fired at %.2f s (p=%.3f)", cursor_s, prob)
                self._fired = True
                return EotEvent(
                    cursor_s=cursor_s,
                    kind="smartturn",
                    prob=prob,
                    silence_onset_s=silence_onset_s,
                )

        return None
