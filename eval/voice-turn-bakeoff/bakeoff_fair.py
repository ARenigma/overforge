"""Level-playing-field turn-detection bake-off on neutral Buckeye clips.

Every SYSTEM supplies a score in [0,1] = P(end-of-turn) per clip. We compare with metrics that
do NOT favor any system's tuning:
  - ROC-AUC (positives = real turn-ends, negatives = real thinking pauses): threshold-free
    discrimination, robust to Buckeye's noisy turn-end labels (same labels for everyone).
  - False-cutoff rate (on thinking pauses) at MATCHED end-of-turn recall — each system at its
    OWN threshold that hits the same recall, so we compare like-for-like.
Same clips + labels for all systems. Adapter scores are cached in results/fair_scores.json so
each closed-API system is only queried once.
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")

from corpora.buckeye import fetch

_RESULTS = Path(__file__).parent / "results"
_RESULTS.mkdir(exist_ok=True)
_SCORES_CACHE = _RESULTS / "fair_scores.json"
_MAX_TRACKS = 10


def smart_turn_scores(clips: list[dict]) -> dict[str, float]:
    from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session, compute_whisper_log_mel

    sess = _load_onnx_session(_get_onnx_path())
    out: dict[str, float] = {}
    for c in clips:
        lm = compute_whisper_log_mel(c["audio"])
        r = sess.run(None, {"input_features": lm[np.newaxis, ...]})
        out[c["clip_id"]] = float(np.asarray(r[0]).reshape(-1)[0])
    return out


def roc_auc(pos: list[float], neg: list[float]) -> float:
    """Mann-Whitney U / AUC = P(random turn-end scores above a random thinking-pause)."""
    if not pos or not neg:
        return float("nan")
    wins = ties = 0.0
    for p in pos:
        for n in neg:
            if p > n:
                wins += 1
            elif p == n:
                ties += 0.5
    return (wins + ties) / (len(pos) * len(neg))


def fcr_recall_curve(eot: list[float], hold: list[float]):
    ts = sorted(set(eot + hold), reverse=True)
    return [(t, sum(s >= t for s in eot) / len(eot), sum(s >= t for s in hold) / len(hold)) for t in ts]


def fcr_at_recall(curve, target: float) -> float:
    cand = [fcr for (_t, rec, fcr) in curve if rec >= target]
    return min(cand) if cand else float("nan")


def main() -> None:
    clips = fetch(max_tracks=_MAX_TRACKS)
    holds = [c for c in clips if not c["is_complete"]]
    eots = [c for c in clips if c["is_complete"]]

    # Smart Turn computed fresh each run; closed-API systems loaded from cache (queried once).
    systems: dict[str, dict[str, float]] = {"smart_turn_v3": smart_turn_scores(clips)}
    if _SCORES_CACHE.exists():
        try:
            cached = json.loads(_SCORES_CACHE.read_text())
            for k, v in cached.items():
                if k != "smart_turn_v3":
                    systems[k] = v
        except Exception:
            logging.exception("Could not read scores cache")
    # Persist (so adapters can merge their scores in here).
    _SCORES_CACHE.write_text(json.dumps(systems, indent=0))

    # Fair head-to-head: only clips that EVERY scored system has → identical clip set for all.
    scored = {k: v for k, v in systems.items() if v}
    common: set[str] = set.intersection(*[set(v) for v in scored.values()]) if scored else set()
    eots_c = [c for c in eots if c["clip_id"] in common]
    holds_c = [c for c in holds if c["clip_id"] in common]

    print("\n=== LEVEL turn-detection bake-off — Buckeye (identical clips + labels for all) ===")
    print(f"common clip set: {len(eots_c)} real turn-ends + {len(holds_c)} real thinking-pauses\n")
    print(f"{'system':>16} {'AUC':>7} {'FCR@rec.60':>11} {'FCR@rec.80':>11}   (higher AUC + lower FCR = better)")
    print("-" * 70)
    rows = []
    for name, sc in systems.items():
        eotv = [sc[c["clip_id"]] for c in eots_c if c["clip_id"] in sc]
        holdv = [sc[c["clip_id"]] for c in holds_c if c["clip_id"] in sc]
        if not eotv or not holdv:
            print(f"{name:>16}   (no scores yet — adapter pending)")
            continue
        auc = roc_auc(eotv, holdv)
        curve = fcr_recall_curve(eotv, holdv)
        f60, f80 = fcr_at_recall(curve, 0.6), fcr_at_recall(curve, 0.8)
        rows.append((name, auc, f60, f80))
        print(f"{name:>16} {auc:>7.3f} {f60:>11.1%} {f80:>11.1%}")
    print("\nAUC = ability to tell real turn-ends from thinking pauses (1.0 perfect, 0.5 chance).")


if __name__ == "__main__":
    main()
