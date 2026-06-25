"""Diagnostic: evaluate Smart Turn v3 SINGLE-SHOT (its real contract) vs the streaming wrapper.

Feeds each labeled clip once (last 8s → log-mel → ONNX → P(complete)), thresholds at 0.5,
and reports accuracy + confusion. If accuracy ~90% the features are fine and the streaming
eval was the bug; if ~chance, the feature pipeline is wrong.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.WARNING)

from adapters.smart_turn_v3 import (  # noqa: E402
    _get_onnx_path,
    _load_onnx_session,
    compute_whisper_log_mel,
)
from corpora.fetch_smartturn import fetch  # noqa: E402

clips = fetch(max_clips=300)
session = _load_onnx_session(_get_onnx_path())

tp = tn = fp = fn = 0
probs_complete: list[float] = []
probs_incomplete: list[float] = []

for c in clips:
    audio = c["audio"].astype(np.float32)
    log_mel = compute_whisper_log_mel(audio, do_normalize=True)
    out = session.run(None, {"input_features": log_mel[np.newaxis, ...]})
    # Output is ALREADY P(complete) — no sigmoid (that double-application was the bug).
    p = float(np.asarray(out[0]).reshape(-1)[0])
    pred_complete = p >= 0.5
    actual = c["is_complete"]
    (probs_complete if actual else probs_incomplete).append(p)
    if actual and pred_complete:
        tp += 1
    elif actual and not pred_complete:
        fn += 1
    elif not actual and not pred_complete:
        tn += 1
    else:
        fp += 1

n = len(clips)
acc = (tp + tn) / n
print(f"\n=== SINGLE-SHOT Smart Turn v3 on {n} real clips ===")
print(f"Accuracy: {acc:.3f}   (TP={tp} TN={tn} FP={fp} FN={fn})")
print(f"P(complete) on COMPLETE clips:   mean={np.mean(probs_complete):.3f}  median={np.median(probs_complete):.3f}")
print(f"P(complete) on INCOMPLETE clips: mean={np.mean(probs_incomplete):.3f}  median={np.median(probs_incomplete):.3f}")
print("Interpretation: working v3 ≈0.90+ acc, with complete-clip P high & incomplete-clip P low.")
