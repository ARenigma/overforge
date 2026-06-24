"""
Fetch the pipecat-ai Smart Turn evaluation clips from HuggingFace.

Dataset: pipecat-ai/smart-turn (public, no auth required).
Clip labels: binary — "complete" (real EOT) vs "incomplete" (thinking pause / mid-utterance).

The dataset is small (~few MB of audio + parquet) and safe to download fully.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

_DATASET_ID = "pipecat-ai/smart-turn"
_CACHE_DIR = Path.home() / ".cache" / "voice-turn-bakeoff" / "smart-turn-dataset"


def fetch(cache_dir: Path | None = None) -> list[dict]:
    """
    Download and return the Smart Turn eval clips.

    Returns:
        List of dicts with keys:
            clip_id (str), audio (np.ndarray float32 mono 16kHz),
            sample_rate (int), is_complete (bool), source (str)

    If the dataset cannot be fetched, returns an empty list and logs the error.
    """
    from datasets import load_dataset  # type: ignore[import]

    target = cache_dir or _CACHE_DIR
    target.mkdir(parents=True, exist_ok=True)

    logger.info("Fetching Smart Turn dataset from HF: %s …", _DATASET_ID)

    try:
        ds = load_dataset(
            _DATASET_ID,
            split="train",
            cache_dir=str(target),
            trust_remote_code=False,
        )
    except Exception:
        # Try alternative: the dataset might have a different split name
        try:
            ds = load_dataset(
                _DATASET_ID,
                split="test",
                cache_dir=str(target),
                trust_remote_code=False,
            )
        except Exception:
            logger.exception(
                "Could not fetch Smart Turn dataset from HF. "
                "Ensure HF network access is available. Returning empty list."
            )
            return []

    clips: list[dict] = []
    skipped = 0

    for i, row in enumerate(ds):
        try:
            clip_id = f"smartturn_{i:04d}"

            # Detect label column
            label: bool
            if "label" in row:
                raw = row["label"]
                if isinstance(raw, int):
                    label = bool(raw)
                elif isinstance(raw, str):
                    label = raw.lower() in ("complete", "eot", "1", "true", "end")
                else:
                    label = bool(raw)
            elif "complete" in row:
                label = bool(row["complete"])
            else:
                logger.warning("Row %d has no recognisable label column; skipping", i)
                skipped += 1
                continue

            # Detect audio column
            audio_data: np.ndarray | None = None
            sr = 16_000

            if "audio" in row and row["audio"] is not None:
                audio_col = row["audio"]
                if isinstance(audio_col, dict):
                    arr = audio_col.get("array")
                    sr = int(audio_col.get("sampling_rate", 16_000))
                    if arr is not None:
                        audio_data = np.array(arr, dtype=np.float32)
                elif isinstance(audio_col, (list, np.ndarray)):
                    audio_data = np.array(audio_col, dtype=np.float32)

            if audio_data is None:
                logger.warning("Row %d has no usable audio; skipping", i)
                skipped += 1
                continue

            # Ensure mono
            if audio_data.ndim > 1:
                audio_data = audio_data.mean(axis=-1)

            clips.append(
                {
                    "clip_id": clip_id,
                    "audio": audio_data,
                    "sample_rate": sr,
                    "is_complete": label,
                    "source": "smartturn",
                }
            )

        except Exception:
            logger.exception("Error processing Smart Turn row %d; skipping", i)
            skipped += 1

    logger.info(
        "Smart Turn: loaded %d clips, skipped %d (label=complete: %d, incomplete: %d)",
        len(clips),
        skipped,
        sum(1 for c in clips if c["is_complete"]),
        sum(1 for c in clips if not c["is_complete"]),
    )
    return clips
