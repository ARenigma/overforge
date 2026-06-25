"""LiveKit text turn-detector scored on LOCAL Whisper transcripts (no Deepgram needed).

Transcribes every Buckeye clip with the latest Whisper (large-v3-turbo), feeds each transcript
to LiveKit's text EOU model → P(end-of-utterance). Merges into the fair-scores cache and drops
the stale partial Deepgram scores so Smart Turn vs LiveKit-text compares on the FULL clip set.
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

from corpora.buckeye import fetch
from run_closed import LiveKitTextEOU

_RESULTS = Path(__file__).parent / "results"
_SCORES = _RESULTS / "fair_scores.json"


def load_whisper():
    from faster_whisper import WhisperModel

    for name in ("large-v3-turbo", "turbo", "large-v3", "distil-large-v3"):
        try:
            m = WhisperModel(name, device="cpu", compute_type="int8")
            logger.info("Whisper model loaded: %s", name)
            return m
        except Exception as exc:  # noqa: BLE001
            logger.warning("Whisper %s unavailable: %s", name, exc)
    raise RuntimeError("No Whisper model could be loaded")


def transcribe(model, audio: np.ndarray) -> str:
    segments, _ = model.transcribe(audio.astype(np.float32), language="en", beam_size=1, vad_filter=False)
    return " ".join(s.text for s in segments).strip()


def main() -> None:
    clips = fetch(max_tracks=10)
    wm = load_whisper()
    lk = LiveKitTextEOU()

    lk_scores: dict[str, float] = {}
    for i, c in enumerate(clips):
        try:
            txt = transcribe(wm, c["audio"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Whisper failed on %s: %s", c["clip_id"], exc)
            continue
        lk_scores[c["clip_id"]] = lk.score(txt)
        if i < 8 or i % 40 == 0:
            logger.info(
                "[%d/%d] %s complete=%s eou=%.3f txt=%r",
                i + 1, len(clips), c["clip_id"], c["is_complete"], lk_scores[c["clip_id"]], txt[:60],
            )

    cache = json.loads(_SCORES.read_text()) if _SCORES.exists() else {}
    cache.pop("deepgram_flux", None)  # stale 29-clip partial — drop so intersection = full set
    cache["livekit_text"] = lk_scores
    _RESULTS.mkdir(exist_ok=True)
    _SCORES.write_text(json.dumps(cache, indent=0))
    logger.info("Wrote %d livekit_text scores (Whisper transcripts); dropped stale deepgram_flux", len(lk_scores))


if __name__ == "__main__":
    main()
