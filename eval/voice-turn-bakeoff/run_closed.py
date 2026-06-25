"""Score the closed contenders on the SAME Buckeye clips, merge into the fair-bake-off cache.

- Deepgram Flux (audio EOT): stream each clip's PCM, take end_of_turn_confidence at the clip end.
  One Flux call also yields the transcript, which feeds LiveKit's text model (free, same audio).
- LiveKit turn-detector (TEXT model, standalone ONNX): eou_probability of the Flux transcript.
  Labeled "livekit_text" — it judges the transcript, a different signal than the audio detectors.
- VAPI: not clip-testable (orchestrator); its EOT == its configured backend. Not scored.

Run with CLIP_LIMIT small first to validate, then raise. Scores merge into results/fair_scores.json
so bakeoff_fair.py compares all systems on identical clips.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

from corpora.buckeye import fetch  # noqa: E402
import secrets_local  # noqa: E402

_RESULTS = Path(__file__).parent / "results"
_SCORES = _RESULTS / "fair_scores.json"
_MAX_TRACKS = 10
CLIP_LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 6  # small default = validation run
_FLUX_PACE = 0.03  # seconds between 80ms chunks; faster than realtime (timing is intrinsic to audio)


def _pcm16(audio: np.ndarray) -> bytes:
    return (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


async def flux_score(pcm: bytes, key: str) -> tuple[float, str]:
    """Stream PCM to Deepgram Flux; return (end_of_turn_confidence at clip end, transcript)."""
    import websockets

    url = (
        "wss://api.deepgram.com/v2/listen?model=flux-general-en"
        "&encoding=linear16&sample_rate=16000&eot_threshold=0.5&eot_timeout_ms=9000"
    )
    max_conf = 0.0
    transcript = ""
    try:
        conn = websockets.connect(url, additional_headers={"Authorization": f"Token {key}"}, max_size=None)
    except TypeError:
        conn = websockets.connect(url, extra_headers={"Authorization": f"Token {key}"}, max_size=None)
    async with conn as ws:
        async def send_all():
            for i in range(0, len(pcm), 2560):
                await ws.send(pcm[i : i + 2560])
                await asyncio.sleep(_FLUX_PACE)

        sender = asyncio.create_task(send_all())
        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=1.5)
                if isinstance(msg, (bytes, bytearray)):
                    continue
                d = json.loads(msg)
                if d.get("type") in ("TurnInfo", "ListenV2TurnInfo"):
                    c = d.get("end_of_turn_confidence")
                    if c is not None:
                        max_conf = max(max_conf, float(c))  # peak EOT belief = "would it fire?"
                    if d.get("transcript"):
                        transcript = d["transcript"]
        except (asyncio.TimeoutError, Exception):
            pass
        finally:
            sender.cancel()
    return max_conf, transcript


class LiveKitTextEOU:
    """LiveKit turn-detector text model (Qwen2.5-0.5B ONNX) → P(end-of-utterance | transcript)."""

    def __init__(self) -> None:
        import onnxruntime as ort
        from huggingface_hub import snapshot_download
        from transformers import AutoTokenizer

        model_dir = snapshot_download("livekit/turn-detector")
        self.tok = AutoTokenizer.from_pretrained(model_dir)
        onnx_files = list(Path(model_dir).glob("*.onnx"))
        onnx_path = next((p for p in onnx_files if "quant" in p.name.lower() or "q8" in p.name.lower()), onnx_files[0])
        self.sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        self.eou_id = self.tok.encode("<|im_end|>", add_special_tokens=False)[0]

    def score(self, transcript: str) -> float:
        if not transcript.strip():
            return 0.0
        formatted = self.tok.apply_chat_template(
            [{"role": "user", "content": transcript}], tokenize=False, add_generation_prompt=False
        )
        inp = self.tok(formatted, return_tensors="np", max_length=1024, truncation=True, add_special_tokens=False)
        logits = self.sess.run(["logits"], {"input_ids": inp["input_ids"].astype(np.int64)})[0]
        last = logits[0, -1]
        probs = np.exp(last - last.max())
        probs /= probs.sum()
        return float(probs[self.eou_id])


async def main() -> None:
    allc = fetch(max_tracks=_MAX_TRACKS)
    if CLIP_LIMIT:
        holds = [c for c in allc if not c["is_complete"]][: CLIP_LIMIT // 2]
        eots = [c for c in allc if c["is_complete"]][: CLIP_LIMIT // 2]
        clips = holds + eots
    else:
        clips = allc
    logger.info("Scoring %d clips through Deepgram Flux + LiveKit text", len(clips))
    dg_key = secrets_local.deepgram()
    if not dg_key:
        logger.error("No Deepgram key")
        return

    lk = LiveKitTextEOU()
    flux_scores: dict[str, float] = {}
    livekit_scores: dict[str, float] = {}

    for i, c in enumerate(clips):
        try:
            conf, transcript = await flux_score(_pcm16(c["audio"]), dg_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Flux failed on %s: %s", c["clip_id"], exc)
            continue
        flux_scores[c["clip_id"]] = conf
        livekit_scores[c["clip_id"]] = lk.score(transcript)
        if i < 8 or i % 25 == 0:
            logger.info(
                "[%d/%d] %s complete=%s  flux_conf=%.3f  lk_eou=%.3f  txt=%r",
                i + 1, len(clips), c["clip_id"], c["is_complete"], conf,
                livekit_scores[c["clip_id"]], transcript[:50],
            )

    # Merge into the shared fair-scores cache.
    cache = json.loads(_SCORES.read_text()) if _SCORES.exists() else {}
    cache["deepgram_flux"] = flux_scores
    cache["livekit_text"] = livekit_scores
    _RESULTS.mkdir(exist_ok=True)
    _SCORES.write_text(json.dumps(cache, indent=0))
    logger.info("Wrote %d Flux + %d LiveKit scores to %s", len(flux_scores), len(livekit_scores), _SCORES)


if __name__ == "__main__":
    asyncio.run(main())
