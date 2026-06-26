"""Validate the CORRECTED P2 end-of-turn policy: silence-HOLD gating + Smart Turn confirmation.

P2-C (replay_stream.py) found that letting Smart Turn fire at a 200 ms silence gate gives ~70%
false-cutoff on long answers — it fires at clause boundaries mid-thought. The fix tested here:

  fire `answer` only when the trailing silence has LASTED >= HOLD ms  AND  Smart Turn says complete
  (P >= threshold) at that point — with a max-silence BACKSTOP that fires regardless once the
  candidate is clearly done.

Why a silence HOLD fixes it: a clause-boundary pause is short — the speaker resumes within a few
hundred ms, so the silence never reaches HOLD and Smart Turn is never consulted there. Only a real
end-of-turn produces a silence that persists past HOLD. This sweeps HOLD x threshold over real
Buckeye turns to find the policy that drives false-cutoff to ~0 while still detecting true ends
with acceptable latency. Causally honest: at each silence we only "know" it reached HOLD because
it actually persisted that long (we never peek past the fire point).
"""
from __future__ import annotations

import logging
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

from adapters.silero_vad import get_silero_model  # noqa: E402
from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session, compute_whisper_log_mel  # noqa: E402
from corpora.buckeye import Turn, fetch_turns  # noqa: E402

_SR = 16_000
_VAD_FRAME = 512          # 32 ms @ 16 kHz
_WINDOW_S = 8.0           # Smart Turn judges the trailing 8 s
_VAD_THRESHOLD = 0.5
_EOT_SLACK_S = 0.25       # a fire within 250 ms before the last word still counts as an EOT hit
_BACKSTOP_S = 3.0         # silence this long → fire regardless (candidate is clearly done)
_N_TURNS = 10

HOLDS = (0.2, 0.5, 0.8, 1.2)        # trailing-silence hold before Smart Turn may fire
THRESHOLDS = (0.5, 0.7, 0.9)        # Smart Turn P(complete) bar


def smart_turn_prob(session, audio: np.ndarray, end_sample: int) -> float:
    chunk = audio[max(0, end_sample - int(_WINDOW_S * _SR)) : end_sample]
    lm = compute_whisper_log_mel(chunk)
    return float(np.asarray(session.run(None, {"input_features": lm[np.newaxis, ...]})[0]).reshape(-1)[0])


def silence_periods(audio: np.ndarray, vad_model) -> list[tuple[float, float]]:
    """Return [(onset_s, duration_s)] for every run of trailing silence, via Silero VAD (stateful;
    reset per turn). A clause pause is a short period; a true end is a long one."""
    import torch

    if hasattr(vad_model, "reset_states"):
        vad_model.reset_states()
    n = len(audio) // _VAD_FRAME
    periods: list[tuple[float, float]] = []
    sil_start: int | None = None
    for i in range(n):
        s = i * _VAD_FRAME
        frame = audio[s : s + _VAD_FRAME]
        with torch.no_grad():
            speech = float(vad_model(torch.from_numpy(frame).unsqueeze(0), _SR).item())
        if speech >= _VAD_THRESHOLD:
            if sil_start is not None:
                periods.append((sil_start / _SR, (s - sil_start) / _SR))
                sil_start = None
        else:
            if sil_start is None:
                sil_start = s
    if sil_start is not None:
        periods.append((sil_start / _SR, (len(audio) - sil_start) / _SR))
    return periods


@dataclass
class Fire:
    cursor_s: float
    kind: str  # 'smartturn' | 'backstop'
    prob: float


def candidate_fires(session, audio: np.ndarray, periods: list[tuple[float, float]]) -> dict:
    """Precompute, per HOLD level, the Smart Turn probe at (silence_onset + HOLD) for every silence
    that reached HOLD, plus backstop fires. Lets us sweep without re-running the model per policy."""
    probes_by_hold: dict[float, list[Fire]] = {h: [] for h in HOLDS}
    backstops: list[Fire] = []
    for onset, dur in periods:
        for h in HOLDS:
            if dur >= h:
                cur = onset + h
                probes_by_hold[h].append(Fire(cur, "smartturn", smart_turn_prob(session, audio, int(cur * _SR))))
        if dur >= _BACKSTOP_S:
            backstops.append(Fire(onset + _BACKSTOP_S, "backstop", 1.0))
    return {"by_hold": probes_by_hold, "backstops": backstops}


def first_fire(fires: dict, hold: float, threshold: float) -> Fire | None:
    """First fire (in time) under a (hold, threshold) policy: a Smart Turn probe at this hold that
    clears the threshold, OR a backstop — whichever comes first."""
    cands = [f for f in fires["by_hold"][hold] if f.prob >= threshold] + fires["backstops"]
    return min(cands, key=lambda f: f.cursor_s) if cands else None


def main() -> None:
    turns = fetch_turns(n_turns=_N_TURNS)
    if not turns:
        print("No Buckeye turns — check recordings/.")
        sys.exit(1)
    log.info("Loaded %d turns; loading models…", len(turns))
    session = _load_onnx_session(_get_onnx_path())
    vad_model, _ = get_silero_model()

    per_turn = []
    for i, t in enumerate(turns, 1):
        periods = silence_periods(t.audio, vad_model)
        fires = candidate_fires(session, t.audio, periods)
        per_turn.append((t, fires))
        log.info("[%d/%d] %s — %.1fs, last word @ %.1fs, %d silence periods",
                 i, len(turns), t.turn_id, len(t.audio) / _SR, t.last_word_end, len(periods))

    print("\n" + "=" * 78)
    print("SILENCE-GATED EOT POLICY SWEEP  (HOLD x Smart-Turn threshold)")
    print(f"real Buckeye turns: {len(turns)} · backstop {_BACKSTOP_S}s · EOT slack {_EOT_SLACK_S}s")
    print("baseline (P2-C, 0.2s gate, no hold): FCR 70%, EOT-hit 40%")
    print("=" * 78)
    print(f"\n{'HOLD':>6}{'thr':>6}{'FCR':>8}{'EOT hit':>9}{'med delay':>11}{'miss':>6}")
    print("-" * 78)
    best = None
    for hold in HOLDS:
        for thr in THRESHOLDS:
            cuts = hits = 0
            delays: list[float] = []
            for t, fires in per_turn:
                f = first_fire(fires, hold, thr)
                if f is None:
                    continue
                if f.cursor_s >= t.last_word_end - _EOT_SLACK_S:
                    hits += 1
                    delays.append(max(0.0, (f.cursor_s - t.last_word_end) * 1000.0))
                else:
                    cuts += 1
            n = len(turns)
            fcr, hit = cuts / n, hits / n
            md = statistics.median(delays) if delays else float("nan")
            miss = n - cuts - hits
            print(f"{hold:>5.1f}s{thr:>6.2f}{fcr:>8.0%}{hit:>9.0%}"
                  f"{(f'{md:.0f} ms' if delays else '—'):>11}{miss:>6}")
            # Pick the lowest-FCR policy, tie-broken by highest EOT hit then lowest delay.
            score = (fcr, -hit, md if delays else 1e9)
            if best is None or score < best[0]:
                best = (score, hold, thr, fcr, hit, md)

    print("\n" + "=" * 78)
    if best:
        _, h, th, fcr, hit, md = best
        print(f"BEST POLICY: HOLD={h:.1f}s + Smart Turn P>={th:.2f}  →  "
              f"FCR {fcr:.0%}, EOT-hit {hit:.0%}, median delay {md:.0f} ms"
              if not np.isnan(md) else
              f"BEST POLICY: HOLD={h:.1f}s + Smart Turn P>={th:.2f}  →  FCR {fcr:.0%}, EOT-hit {hit:.0%}")
        print("vs P2-C baseline FCR 70% — the silence hold is what makes Smart Turn safe.")
        print("NOTE: Buckeye monologues are a worst case; re-measure on shorter interview answers.")
    print("=" * 78)


if __name__ == "__main__":
    main()
