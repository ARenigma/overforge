"""Real recorded-speech frames for the E2E / load harness.

Streams genuine Buckeye interviewee turns (16 kHz mono, WITH real intra-turn pauses) so the live
Silero + Smart-Turn endpointer fires on its own — a synthetic/TTS clip with unnatural pauses
wouldn't validate end-of-turn detection. Each turn is tail-padded with silence PAST the 3.0 s
backstop so EVERY turn reliably commits — turns whose ending Smart Turn is confident about fire at
the 0.8 s hold; the rest fire at the backstop. (A real open mic streams silence indefinitely, so the
backstop always fires; the harness must pad enough to mimic that — a short pad would just run out of
frames mid-silence and never commit.) Audio is encoded to the wire format the browser uses:
little-endian Int16, exactly 512 samples (1024 bytes)/frame.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import numpy.typing as npt

# The Buckeye loader lives in the eval harness (test-only — not shipped in the service image).
_EVAL_DIR = Path(__file__).resolve().parent.parent.parent / "eval" / "voice-turn-bakeoff"
if str(_EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(_EVAL_DIR))

_SR = 16_000
_FRAME = 512
# > the endpointer's 3.0 s backstop, so a turn always commits even if Smart Turn never confirms.
_TAIL_PAD_S = 3.6


def _to_int16_frames(
    audio: npt.NDArray[np.float32], tail_pad_s: float = _TAIL_PAD_S
) -> list[bytes]:
    padded = np.concatenate(
        [np.asarray(audio, dtype=np.float32), np.zeros(int(tail_pad_s * _SR), dtype=np.float32)]
    )
    n = len(padded) // _FRAME
    frames: list[bytes] = []
    for i in range(n):
        seg = padded[i * _FRAME : (i + 1) * _FRAME]
        pcm = np.clip(seg * 32768.0, -32768.0, 32767.0).astype("<i2")
        frames.append(pcm.tobytes())
    return frames


def load_turn_frames(n_turns: int = 3) -> list[tuple[str, list[bytes]]]:
    """Return ``[(label, [1024-byte Int16 frames])]`` for the first ``n_turns`` Buckeye turns."""
    from corpora.buckeye import fetch_turns  # noqa: PLC0415

    turns = fetch_turns(n_turns=n_turns)
    if not turns:
        raise RuntimeError("No Buckeye turns found — check the recordings dir used by fetch_turns.")
    return [(f"buckeye-{i}", _to_int16_frames(t.audio)) for i, t in enumerate(turns)]
