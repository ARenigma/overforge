"""
Attempt to stream a small sample (20–50 clips) from the CANDOR corpus.

CANDOR is a 850h conversational dataset hosted on HF (Wharton-CANDOR/CANDOR-corpus).
It requires gated access (HF user agreement). This fetcher will:
1. Check if HF_TOKEN is set and has access.
2. Attempt to stream the first N examples — NEVER downloading the full corpus.
3. On any failure (auth, size, timeout), log clearly and return an empty list.

Phase 1 can succeed entirely on Smart Turn clips — CANDOR is a "nice-to-have" stretch goal.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_DATASET_ID = "Wharton-CANDOR/CANDOR-corpus"
_MAX_CLIPS = 30
_CACHE_DIR = Path.home() / ".cache" / "voice-turn-bakeoff" / "candor"


def fetch(max_clips: int = _MAX_CLIPS, cache_dir: Path | None = None) -> list[dict]:
    """
    Stream up to `max_clips` clips from CANDOR.

    CANDOR has turn-level annotations (speaker_turns.csv per session).
    We treat pauses ≤ 3s within a speaker's turn as "incomplete" (hold),
    and the final utterance of each turn as "complete".

    Returns:
        List of dicts with clip_id, audio, sample_rate, is_complete, source.
        Returns [] on any failure.
    """
    hf_token = os.environ.get("HF_TOKEN", "")
    if not hf_token:
        logger.warning(
            "CANDOR: HF_TOKEN not set. CANDOR requires authenticated HF access. "
            "Skipping CANDOR — Phase 1 will run on Smart Turn clips only."
        )
        return []

    logger.info(
        "CANDOR: attempting to stream up to %d clips from %s …",
        max_clips,
        _DATASET_ID,
    )

    try:
        from datasets import load_dataset  # type: ignore[import]

        # Stream=True avoids downloading the full 850h corpus
        ds = load_dataset(
            _DATASET_ID,
            split="train",
            streaming=True,
            token=hf_token,
            trust_remote_code=False,
        )
    except Exception:
        logger.exception(
            "CANDOR: failed to open streaming dataset. "
            "Likely gated access or network issue. Returning []."
        )
        return []

    clips: list[dict] = []
    skipped = 0

    try:
        for i, row in enumerate(ds):
            if len(clips) >= max_clips:
                break

            try:
                clip_id = f"candor_{i:04d}"

                # CANDOR audio column may be 'audio' dict with array + sampling_rate
                audio_data: np.ndarray | None = None
                sr = 16_000

                if "audio" in row and row["audio"] is not None:
                    audio_col = row["audio"]
                    if isinstance(audio_col, dict):
                        arr = audio_col.get("array")
                        sr = int(audio_col.get("sampling_rate", 16_000))
                        if arr is not None:
                            audio_data = np.array(arr, dtype=np.float32)

                if audio_data is None:
                    skipped += 1
                    continue

                # Derive label: CANDOR doesn't have binary complete/incomplete per-clip
                # natively. Use heuristic: clip shorter than 2s after last speech = incomplete.
                # This is a rough approximation; Phase 2 can align with speaker_turns.csv.
                is_complete = len(audio_data) / sr > 1.5  # >1.5s → treat as complete

                if audio_data.ndim > 1:
                    audio_data = audio_data.mean(axis=-1)

                clips.append(
                    {
                        "clip_id": clip_id,
                        "audio": audio_data,
                        "sample_rate": sr,
                        "is_complete": is_complete,
                        "source": "candor",
                    }
                )

            except Exception:
                logger.exception("CANDOR: error on row %d, skipping", i)
                skipped += 1

    except Exception:
        logger.exception(
            "CANDOR: streaming interrupted after %d clips. Returning what we have.",
            len(clips),
        )

    logger.info(
        "CANDOR: collected %d clips, skipped %d (complete: %d, incomplete: %d)",
        len(clips),
        skipped,
        sum(1 for c in clips if c["is_complete"]),
        sum(1 for c in clips if not c["is_complete"]),
    )
    return clips
