"""Smart Turn v3 on REAL Buckeye interview speech — the decisive thinking-pause test.

Each HOLD clip ends at a real intra-turn pause (speaker resumed) → a good detector must NOT
fire (firing = false cutoff). Each EOT clip ends at a real turn end → it should fire.
"""
from __future__ import annotations

import collections
import logging
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")

from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session, compute_whisper_log_mel
from corpora.buckeye import fetch

clips = fetch(max_tracks=10)
if not clips:
    print("No Buckeye clips — check recordings/ extraction")
    sys.exit(1)

session = _load_onnx_session(_get_onnx_path())
for c in clips:
    lm = compute_whisper_log_mel(c["audio"])
    out = session.run(None, {"input_features": lm[np.newaxis, ...]})
    c["p"] = float(np.asarray(out[0]).reshape(-1)[0])

holds = [c for c in clips if not c["is_complete"]]
eots = [c for c in clips if c["is_complete"]]

print("\n=== Smart Turn v3 on REAL Buckeye interview speech ===")
print(f"{len(holds)} thinking-pause (HOLD) clips + {len(eots)} turn-end (EOT) clips\n")
print(f"{'threshold':>10} {'FCR(pauses)':>12} {'EOT recall':>11}")
for thr in (0.5, 0.7, 0.9):
    fcr = sum(c["p"] >= thr for c in holds) / max(1, len(holds))
    rec = sum(c["p"] >= thr for c in eots) / max(1, len(eots))
    print(f"{thr:>10} {fcr:>11.1%} {rec:>10.1%}")

print("\nFCR by pause-duration bucket @ threshold 0.5:")
bk = collections.defaultdict(list)
for c in holds:
    bk[c["pause_bucket"]].append(c["p"] >= 0.5)
for b in ("0.5-1s", "1-2s", "2-3s", "3-5s", "5s+"):
    if bk[b]:
        print(f"  {b:>7}: {sum(bk[b]) / len(bk[b]):>6.1%}  (n={len(bk[b])})")

if holds and eots:
    print(
        f"\nP(complete): HOLD mean={np.mean([c['p'] for c in holds]):.3f}  "
        f"EOT mean={np.mean([c['p'] for c in eots]):.3f}"
    )
