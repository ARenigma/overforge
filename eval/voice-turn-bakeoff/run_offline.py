"""
Offline Phase 1 eval runner.

For each adapter × each clip × each operating-param value:
  - Stream the audio causally through the adapter
  - Record first EOT fire time
  - On "incomplete" clip: fire = false cutoff (FCR event)
  - On "complete" clip: record latency = fired_at_ms
  - Bucket by clip duration: 0-2s / 2-3s / 3-5s / 5s+
  - Emit one row per (adapter, param, clip_id, bucket) to raw_runs.csv
"""
from __future__ import annotations

import csv
import logging
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

# Ensure the project root is on sys.path so adapters/ and corpora/ are importable
sys.path.insert(0, str(Path(__file__).parent))

from adapters.silero_vad import SileroVADAdapter
from adapters.smart_turn_v3 import SmartTurnV3Adapter
from corpora.fetch_candor import fetch as fetch_candor
from corpora.fetch_smartturn import fetch as fetch_smartturn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

_RESULTS_DIR = Path(__file__).parent / "results"
_RAW_CSV = _RESULTS_DIR / "raw_runs.csv"

# Duration buckets in seconds: (label, lo_inclusive, hi_exclusive)
_DURATION_BUCKETS = [
    ("0-2s", 0.0, 2.0),
    ("2-3s", 2.0, 3.0),
    ("3-5s", 3.0, 5.0),
    ("5s+", 5.0, float("inf")),
]


def _assign_bucket(duration_ms: float) -> str:
    duration_s = duration_ms / 1000.0
    for label, lo, hi in _DURATION_BUCKETS:
        if lo <= duration_s < hi:
            return label
    return "5s+"


# Param sweeps — keep reasonable for offline (CPU) speed
_SILERO_PARAMS: list[dict[str, Any]] = [
    {"stop_secs": s, "vad_threshold": 0.5}
    for s in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]
]

_SMART_TURN_PARAMS: list[dict[str, Any]] = [
    {"stop_secs": s, "model_threshold": t, "vad_threshold": 0.5}
    for s in [1.0, 2.0, 3.0, 4.0]
    for t in [0.3, 0.5, 0.7]
]


def run_adapter_on_clips(
    adapter_cls: type,
    params_list: list[dict[str, Any]],
    clips: list[dict],
    writer: csv.DictWriter,
) -> None:
    """Run one adapter class across all param combos and all clips, writing rows."""
    for params in params_list:
        try:
            adapter = adapter_cls(**params)
        except Exception:
            logger.exception("Failed to instantiate %s with params %s", adapter_cls.__name__, params)
            continue

        param_key = adapter.param_key()
        logger.info("Running %s  params=%s  on %d clips …", adapter.NAME, param_key, len(clips))

        for clip in clips:
            clip_id: str = clip["clip_id"]
            audio: np.ndarray = clip["audio"]
            sr: int = clip["sample_rate"]
            is_complete: bool = clip["is_complete"]
            source: str = clip.get("source", "unknown")

            t0 = time.perf_counter()
            try:
                result = adapter.detect(audio, sr, clip_id, is_complete)
            except Exception:
                logger.exception("Adapter %s failed on clip %s; skipping", adapter.NAME, clip_id)
                continue
            wall_ms = (time.perf_counter() - t0) * 1000.0

            duration_ms = result.duration_ms
            bucket = _assign_bucket(duration_ms)

            # Determine outcome
            fired = result.fired_at_ms is not None
            false_cutoff = fired and not is_complete
            true_eot = fired and is_complete
            missed_eot = (not fired) and is_complete
            true_hold = (not fired) and not is_complete

            latency_ms = result.fired_at_ms if true_eot else None

            writer.writerow(
                {
                    "adapter": adapter.NAME,
                    "param_key": param_key,
                    "params_json": str(params),
                    "clip_id": clip_id,
                    "source": source,
                    "is_complete": int(is_complete),
                    "duration_ms": f"{duration_ms:.1f}",
                    "bucket": bucket,
                    "fired": int(fired),
                    "false_cutoff": int(false_cutoff),
                    "true_eot": int(true_eot),
                    "missed_eot": int(missed_eot),
                    "true_hold": int(true_hold),
                    "fired_at_ms": f"{result.fired_at_ms:.1f}" if result.fired_at_ms is not None else "",
                    "latency_ms": f"{latency_ms:.1f}" if latency_ms is not None else "",
                    "wall_ms": f"{wall_ms:.1f}",
                    "fallback": str(result.params.get("_fallback", "")),
                }
            )


_FIELDNAMES = [
    "adapter", "param_key", "params_json", "clip_id", "source",
    "is_complete", "duration_ms", "bucket",
    "fired", "false_cutoff", "true_eot", "missed_eot", "true_hold",
    "fired_at_ms", "latency_ms", "wall_ms", "fallback",
]


def main() -> None:
    _RESULTS_DIR.mkdir(exist_ok=True)

    # --- Fetch corpora ---
    logger.info("=== Fetching corpora ===")
    clips: list[dict] = []

    smartturn_clips = fetch_smartturn()
    if smartturn_clips:
        logger.info("Smart Turn: %d clips loaded", len(smartturn_clips))
        clips.extend(smartturn_clips)
    else:
        logger.warning("Smart Turn dataset UNAVAILABLE — will attempt to continue with CANDOR only")

    candor_clips = fetch_candor(max_clips=30)
    if candor_clips:
        logger.info("CANDOR: %d clips loaded", len(candor_clips))
        clips.extend(candor_clips)
    else:
        logger.info("CANDOR: not available (expected in Phase 1 — requires HF_TOKEN + gated access)")

    if not clips:
        logger.error(
            "NO CLIPS AVAILABLE. Cannot run eval. "
            "Ensure HF network access for pipecat-ai/smart-turn dataset, "
            "or place pre-downloaded audio files in corpora/local/."
        )
        sys.exit(1)

    logger.info("Total clips for eval: %d", len(clips))

    # --- Run adapters ---
    logger.info("=== Running adapters ===")
    with _RAW_CSV.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=_FIELDNAMES)
        writer.writeheader()

        run_adapter_on_clips(SileroVADAdapter, _SILERO_PARAMS, clips, writer)
        run_adapter_on_clips(SmartTurnV3Adapter, _SMART_TURN_PARAMS, clips, writer)

    logger.info("Raw results written to: %s", _RAW_CSV)
    logger.info("=== run_offline.py complete — run score.py next ===")


if __name__ == "__main__":
    main()
