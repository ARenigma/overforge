"""Voice-substrate latency spike (THROWAWAY de-risk).

Validates the chosen hybrid stack against the natural-turn-taking budget: from the moment the
candidate stops speaking, first audio of the reply should land in <~800ms. Measures each stage on
a real-speech clip:
  - STT      : self-hosted faster-whisper (no lock-in) — finalize latency
  - Smart Turn: EOT inference (the trigger) — runs concurrently with speech, so ~free
  - TTS      : Cartesia Sonic (cloud) — time-to-first-audio-chunk
The LLM stage is characterized separately (MiniMax M2 reasoning was 8–13s/turn in the live E2E —
too slow; voice needs a fast model + token streaming). This spike isolates everything else so we
know how much budget the LLM gets. Run on the VPS for the real numbers; mac gives a ballpark.
"""
from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

import secrets_local  # noqa: E402
from corpora.buckeye import fetch  # noqa: E402

BUDGET_MS = 800
SAMPLE_REPLY = (
    "Good — before you run it, what do you expect the output to be for an empty input, "
    "and how does your loop handle that case?"
)


def measure_stt(audio: np.ndarray) -> tuple[str, float]:
    from faster_whisper import WhisperModel

    model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
    # Warm once (model/graph load shouldn't count toward per-turn latency).
    list(model.transcribe(audio[: 16000].astype(np.float32), language="en", beam_size=1)[0])
    t0 = time.perf_counter()
    segs, _ = model.transcribe(audio.astype(np.float32), language="en", beam_size=1)
    text = " ".join(s.text for s in segs).strip()
    return text, (time.perf_counter() - t0) * 1000


def measure_smart_turn(audio: np.ndarray) -> float:
    from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session, compute_whisper_log_mel

    sess = _load_onnx_session(_get_onnx_path())
    lm = compute_whisper_log_mel(audio)
    sess.run(None, {"input_features": lm[np.newaxis, ...]})  # warm
    t0 = time.perf_counter()
    sess.run(None, {"input_features": lm[np.newaxis, ...]})
    return (time.perf_counter() - t0) * 1000


def measure_cartesia(text: str) -> tuple[float | None, str]:
    """Time-to-first-audio-chunk from Cartesia Sonic streaming SSE. Best-effort."""
    import json

    import requests

    key = secrets_local.cartesia()
    if not key:
        return None, "no cartesia key in api_keys.rtf"
    ver = {"X-API-Key": key, "Cartesia-Version": "2024-11-13"}
    try:
        vr = requests.get("https://api.cartesia.ai/voices", headers=ver, timeout=15)
        vr.raise_for_status()
        voices = vr.json()
        voices = voices.get("data", voices) if isinstance(voices, dict) else voices
        voice_id = voices[0]["id"]
    except Exception as exc:  # noqa: BLE001
        return None, f"voice list failed: {exc}"
    body = {
        "model_id": "sonic-2",
        "transcript": text,
        "voice": {"mode": "id", "id": voice_id},
        "output_format": {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 16000},
    }
    t0 = time.perf_counter()
    try:
        with requests.post(
            "https://api.cartesia.ai/tts/sse",
            headers={**ver, "Content-Type": "application/json"},
            json=body,
            stream=True,
            timeout=30,
        ) as r:
            r.raise_for_status()
            for raw in r.iter_lines():
                if not raw:
                    continue
                line = raw.decode("utf-8", "replace")
                if line.startswith("data:"):
                    payload = json.loads(line[5:].strip())
                    if payload.get("data"):  # first audio chunk
                        return (time.perf_counter() - t0) * 1000, "ok"
    except Exception as exc:  # noqa: BLE001
        return None, f"tts stream failed: {exc}"
    return None, "no audio chunk received"


def main() -> None:
    clips = fetch(max_tracks=1)
    clip = next((c for c in clips if c["is_complete"]), clips[0])
    audio = clip["audio"]
    log.info("clip %s — %.1fs of real speech", clip["clip_id"], len(audio) / 16000)

    log.info("measuring STT (faster-whisper large-v3-turbo, CPU int8)…")
    text, stt_ms = measure_stt(audio)
    log.info("  transcript: %r", text[:80])

    log.info("measuring Smart Turn EOT…")
    st_ms = measure_smart_turn(audio)

    log.info("measuring Cartesia TTS time-to-first-audio…")
    tts_ms, tts_note = measure_cartesia(SAMPLE_REPLY)

    print("\n=== Voice latency spike — hybrid stack (self-host STT + Cartesia TTS) ===")
    print(f"{'stage':<26}{'latency':>12}   note")
    print("-" * 66)
    print(f"{'STT (whisper finalize)':<26}{stt_ms:>10.0f}ms   self-hosted; streaming finalize is faster")
    print(f"{'Smart Turn EOT':<26}{st_ms:>10.0f}ms   ~concurrent with speech (trigger, not on path)")
    print(f"{'TTS first-audio (Cartesia)':<26}" + (f"{tts_ms:>10.0f}ms   {tts_note}" if tts_ms else f"{'—':>10}    {tts_note}"))
    print("-" * 66)
    # Post-EOT critical path = STT finalize + LLM TTFT + TTS first-audio (Smart Turn ~concurrent).
    non_llm = stt_ms + (tts_ms or 0)
    print(f"non-LLM critical path (STT+TTS): {non_llm:.0f}ms  → leaves {BUDGET_MS - non_llm:.0f}ms"
          f" of the {BUDGET_MS}ms budget for the LLM's time-to-first-token")
    print("\nNote: measured on this machine; the VPS (CPU) is the real target. The LLM must be a fast,\n"
          "non-reasoning model streamed sentence-by-sentence — MiniMax M2 (8–13s/turn) is for scoring only.")


if __name__ == "__main__":
    main()
