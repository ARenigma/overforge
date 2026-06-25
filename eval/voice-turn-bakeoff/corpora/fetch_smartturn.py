"""
Fetch the pipecat-ai Smart Turn v3.2 evaluation clips from HuggingFace.

Dataset: pipecat-ai/smart-turn-data-v3.2-test (public, no auth required).
Label column: endpoint_bool — True = complete turn, False = mid-turn / thinking pause.

We cast the audio column to decode=False and decode the raw bytes with soundfile,
so we DON'T depend on torchcodec (HF's default audio decoder, fragile to install).
We also take a balanced random sample (default 300 clips, 50/50 by label) so the
offline param-sweep finishes on CPU in minutes rather than hours.
"""
from __future__ import annotations

import io
import logging
import random
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# Dataset preference order — newest official test split first
_DATASET_IDS = [
    "pipecat-ai/smart-turn-data-v3.2-test",
    "pipecat-ai/smart-turn-data-v3.1-test",
    "pipecat-ai/smart-turn-data-v3-test",
]
_CACHE_DIR = Path.home() / ".cache" / "voice-turn-bakeoff" / "smart-turn-dataset"
_SEED = 42


def _decode_audio_bytes(audio_col: object) -> tuple[np.ndarray, int] | None:
    """Decode an HF (decode=False) audio cell {'bytes','path'} via soundfile → (float32 mono, sr)."""
    import soundfile as sf  # libsndfile — handles WAV/FLAC/OGG without torchcodec

    raw: bytes | None = None
    if isinstance(audio_col, dict):
        raw = audio_col.get("bytes")
        if raw is None and audio_col.get("path"):
            try:
                with open(audio_col["path"], "rb") as fh:
                    raw = fh.read()
            except OSError:
                return None
    if not raw:
        return None
    try:
        data, sr = sf.read(io.BytesIO(raw), dtype="float32", always_2d=False)
    except Exception:
        try:
            import librosa

            data, sr = librosa.load(io.BytesIO(raw), sr=None, mono=True)
        except Exception:
            return None
    data = np.asarray(data, dtype=np.float32)
    if data.ndim > 1:
        data = data.mean(axis=-1)
    return data, int(sr)


def fetch(max_clips: int = 300, cache_dir: Path | None = None) -> list[dict]:
    """Download and return a balanced sample of Smart Turn eval clips.

    Returns a list of dicts: clip_id, audio (float32 mono), sample_rate, is_complete, source.
    Returns [] and logs the error if the dataset cannot be fetched.
    """
    from datasets import Audio, load_dataset  # type: ignore[import]

    target = cache_dir or _CACHE_DIR
    target.mkdir(parents=True, exist_ok=True)

    ds = None
    used_id = ""
    for dataset_id in _DATASET_IDS:
        for split in ("train", "test"):
            try:
                ds = load_dataset(dataset_id, split=split, cache_dir=str(target))
                used_id = dataset_id
                logger.info("Loaded %s (split=%s): %d rows", dataset_id, split, len(ds))
                break
            except Exception as exc:  # noqa: BLE001
                logger.debug("  %s split=%s: %s", dataset_id, split, exc)
        if ds is not None:
            break

    if ds is None:
        logger.error("Could not fetch any Smart Turn dataset from HF. Tried: %s", _DATASET_IDS)
        return []

    # Decode bytes ourselves (no torchcodec).
    ds = ds.cast_column("audio", Audio(decode=False))

    # Pick the label column name once.
    cols = ds.column_names
    label_col = "endpoint_bool" if "endpoint_bool" in cols else ("label" if "label" in cols else None)
    if label_col is None:
        logger.error("No endpoint_bool/label column in %s (cols=%s)", used_id, cols)
        return []

    # Balanced sample of row indices by label (reading a non-audio column does NOT decode audio).
    labels = ds[label_col]
    idx_true = [i for i, v in enumerate(labels) if bool(v)]
    idx_false = [i for i, v in enumerate(labels) if not bool(v)]
    rng = random.Random(_SEED)
    rng.shuffle(idx_true)
    rng.shuffle(idx_false)
    k = max(1, max_clips // 2)
    chosen = sorted(idx_true[:k] + idx_false[:k])
    logger.info(
        "Sampling %d clips (%d complete / %d incomplete) from %d rows",
        len(chosen), min(k, len(idx_true)), min(k, len(idx_false)), len(ds),
    )

    clips: list[dict] = []
    skipped = 0
    for i in chosen:
        row = ds[i]
        decoded = _decode_audio_bytes(row.get("audio"))
        if decoded is None:
            skipped += 1
            continue
        audio_data, sr = decoded
        clips.append(
            {
                "clip_id": f"smartturn_{i:05d}",
                "audio": audio_data,
                "sample_rate": sr,
                "is_complete": bool(row[label_col]),
                "source": f"smartturn/{used_id.split('/')[-1]}",
            }
        )

    logger.info(
        "Smart Turn (%s): loaded %d clips, skipped %d (complete: %d, incomplete: %d)",
        used_id, len(clips), skipped,
        sum(1 for c in clips if c["is_complete"]),
        sum(1 for c in clips if not c["is_complete"]),
    )
    return clips
