"""Streaming endpointer validation against real Buckeye interviewee turns.

Tests `SilenceGatedEndpointer` by feeding each Buckeye turn FRAME-BY-FRAME (simulating a live
mic) and measuring:
  - False-cutoff rate (FCR): EOT fires BEFORE the true turn end − slack (interview-killing error)
  - EOT-hit rate: EOT fires at/after the true turn end
  - Median delay: ms between last word and EOT fire

The streaming endpointer must reproduce the validated offline result from replay_gated.py:
FCR materially below the 70% Smart-Turn-alone baseline (target: ~10–30% at 0.8 s HOLD).

Design notes:
  - EOT_SLACK_S = 0.25 s: a fire within 250 ms BEFORE last_word_end still counts as an EOT hit
    (the speaker was finishing their last word and the detector correctly committed).
  - The streaming path differs slightly from the offline sweep (offline iterates silence periods
    across the whole turn; streaming commits at the first qualifying frame) so results may not be
    identical — but the HOLD suppression effect must be clearly visible vs baseline.
"""
from __future__ import annotations

import logging
import statistics
import sys
from pathlib import Path

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Path wiring — make eval adapters and corpora importable without installing them
# ---------------------------------------------------------------------------
_EVAL_DIR = Path(__file__).parent.parent / "eval" / "voice-turn-bakeoff"
if str(_EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(_EVAL_DIR))

# Now we can import the eval modules
from adapters.silero_vad import get_silero_model  # noqa: E402
from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session  # noqa: E402
from corpora.buckeye import Turn, fetch_turns  # noqa: E402

# And the module under test
_VOICE_DIR = Path(__file__).parent
if str(_VOICE_DIR) not in sys.path:
    sys.path.insert(0, str(_VOICE_DIR))

from endpointing import SilenceGatedEndpointer  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

_SR = 16_000
_VAD_FRAME = 512         # 32 ms @ 16 kHz
_EOT_SLACK_S = 0.25      # 250 ms pre-last-word grace window
_N_TURNS = 10

# Target policy (matches replay_gated.py best policy)
_HOLD_S = 0.8
_SMART_TURN_THRESHOLD = 0.5
_BACKSTOP_S = 3.0
_VAD_THRESHOLD = 0.5


# ---------------------------------------------------------------------------
# Shared model fixtures (load once; injected into endpointer for speed)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def vad_model():
    log.info("Loading Silero VAD …")
    model, _ = get_silero_model()
    return model


@pytest.fixture(scope="session")
def smart_turn_session():
    log.info("Loading Smart Turn ONNX …")
    return _load_onnx_session(_get_onnx_path())


@pytest.fixture(scope="session")
def buckeye_turns():
    log.info("Fetching %d Buckeye turns …", _N_TURNS)
    turns = fetch_turns(n_turns=_N_TURNS)
    assert turns, "No Buckeye turns found — check /Users/amit.ranjan/overforge/recordings/"
    log.info("Fetched %d turns.", len(turns))
    return turns


# ---------------------------------------------------------------------------
# Core streaming replay helper
# ---------------------------------------------------------------------------

def _replay_turn(
    turn: Turn,
    ep: SilenceGatedEndpointer,
) -> tuple[float | None, str]:
    """Feed a full turn audio frame-by-frame through the endpointer.

    Returns:
        (fire_cursor_s, kind) — fire cursor relative to turn audio start (None if no fire), kind.
    """
    ep.reset()
    audio = turn.audio.astype(np.float32)
    n_frames = len(audio) // _VAD_FRAME
    for i in range(n_frames):
        frame = audio[i * _VAD_FRAME : (i + 1) * _VAD_FRAME]
        ev = ep.feed_frame(frame)
        if ev is not None:
            return ev.cursor_s, ev.kind
    return None, "miss"


# ---------------------------------------------------------------------------
# Main validation test
# ---------------------------------------------------------------------------

def test_streaming_endpointer_vs_baseline(
    vad_model,
    smart_turn_session,
    buckeye_turns: list[Turn],
) -> None:
    """Validate streaming endpointer FCR is materially below the 70% Smart-Turn-alone baseline."""

    ep = SilenceGatedEndpointer(
        hold_s=_HOLD_S,
        smart_turn_threshold=_SMART_TURN_THRESHOLD,
        backstop_s=_BACKSTOP_S,
        vad_threshold=_VAD_THRESHOLD,
        vad_model=vad_model,
        smart_turn_session=smart_turn_session,
    )

    n_turns = len(buckeye_turns)
    false_cuts = 0
    eot_hits = 0
    misses = 0
    delays_ms: list[float] = []

    rows: list[tuple[str, float, float, float | None, str, float | None]] = []

    for turn in buckeye_turns:
        dur_s = len(turn.audio) / _SR
        fire_s, kind = _replay_turn(turn, ep)

        last_word = turn.last_word_end  # seconds from audio start
        thresh = last_word - _EOT_SLACK_S  # anything before this = false cutoff

        if fire_s is None:
            misses += 1
            rows.append((turn.turn_id, dur_s, last_word, None, "MISS", None))
        elif fire_s < thresh:
            false_cuts += 1
            rows.append((turn.turn_id, dur_s, last_word, fire_s, f"FALSE({kind})", None))
        else:
            eot_hits += 1
            delay_ms = max(0.0, (fire_s - last_word) * 1000.0)
            delays_ms.append(delay_ms)
            rows.append((turn.turn_id, dur_s, last_word, fire_s, f"EOT({kind})", delay_ms))

    # ------------------------------------------------------------------
    # Print results table
    # ------------------------------------------------------------------
    print()
    print("=" * 90)
    print("STREAMING ENDPOINTER RESULTS  "
          f"(HOLD={_HOLD_S}s · P≥{_SMART_TURN_THRESHOLD} · backstop={_BACKSTOP_S}s)")
    print("Baseline (Smart Turn alone, 0.2s gate): FCR 70%,  EOT-hit 40%")
    print("=" * 90)
    print(f"{'turn':<28} {'dur':>5} {'lastw':>6} {'fire':>6} {'result':<18} {'delay':>8}")
    print("-" * 90)
    for tid, dur, lw, fire, result, delay in rows:
        fire_str = f"{fire:.1f}s" if fire is not None else "   —"
        delay_str = f"{delay:.0f}ms" if delay is not None else "  —"
        print(f"{tid:<28} {dur:>4.1f}s {lw:>5.1f}s {fire_str:>6} {result:<18} {delay_str:>8}")

    fcr = false_cuts / n_turns
    hit_rate = eot_hits / n_turns
    miss_rate = misses / n_turns
    med_delay = statistics.median(delays_ms) if delays_ms else float("nan")

    print()
    print("=" * 90)
    print("AGGREGATE")
    print(f"  turns:         {n_turns}")
    print(f"  false cutoffs: {false_cuts}  →  FCR = {fcr:.0%}")
    print(f"  EOT hits:      {eot_hits}  →  hit rate = {hit_rate:.0%}")
    print(f"  misses:        {misses}  →  miss rate = {miss_rate:.0%}")
    print(f"  median delay:  {med_delay:.0f} ms" if delays_ms else "  median delay: —")
    print()
    print("  Baseline FCR (Smart Turn alone):  70%")
    print(f"  Streaming FCR (this run):         {fcr:.0%}")
    if fcr < 0.70:
        improvement = (0.70 - fcr) / 0.70 * 100
        print(f"  Improvement:                      {improvement:.0f}% reduction in false cutoffs")
    print("=" * 90)

    # ------------------------------------------------------------------
    # Assertions
    # ------------------------------------------------------------------
    # The streaming endpointer MUST produce materially fewer false cutoffs than Smart Turn alone.
    # The validated offline sweep shows ~10% at HOLD=0.8s; streaming may be slightly higher due
    # to frame-level granularity and the stateful ring buffer, but must be well below 70%.
    _FCR_UPPER_BOUND = 0.45  # conservative: streaming < 45% is a clear win over 70% baseline

    assert fcr < _FCR_UPPER_BOUND, (
        f"Streaming FCR {fcr:.0%} is NOT materially below the 70% baseline. "
        f"The silence hold gate appears ineffective — check hold_s, VAD threshold, or ring buffer."
    )

    # We need to detect at least some real turn-ends (not pure miss / false-cut behaviour)
    assert eot_hits >= 1, (
        f"Zero EOT hits — the endpointer never fired at a true turn-end on {n_turns} turns. "
        f"Check backstop or Smart Turn session."
    )

    log.info(
        "PASS — FCR %.0f%% vs 70%% baseline | EOT-hit %.0f%% | median delay %.0f ms",
        fcr * 100, hit_rate * 100, med_delay,
    )


# ---------------------------------------------------------------------------
# Unit test: feed_frame rejects wrong size
# ---------------------------------------------------------------------------

def test_feed_frame_wrong_size() -> None:
    ep = SilenceGatedEndpointer()
    with pytest.raises(ValueError, match="feed_frame expects exactly"):
        ep.feed_frame(np.zeros(256, dtype=np.float32))


# ---------------------------------------------------------------------------
# Unit test: reset clears state
# ---------------------------------------------------------------------------

def test_reset_clears_fired_state() -> None:
    """After reset(), the endpointer can fire again."""
    ep = SilenceGatedEndpointer(
        hold_s=0.0,           # fire immediately on silence
        backstop_s=0.032,     # backstop after 1 frame of silence
        vad_threshold=1.1,    # threshold > 1.0 → everything is silence
    )
    # Feed one silent frame — should backstop-fire immediately
    frame = np.zeros(_VAD_FRAME, dtype=np.float32)
    ev = ep.feed_frame(frame)
    assert ev is not None, "Expected an EOT event from silent frame with backstop_s=0.032"
    assert ep._fired, "Endpointer should mark itself fired"

    # After reset, feeding again should arm it
    ep.reset()
    assert not ep._fired
    assert ep._total_samples == 0


# ---------------------------------------------------------------------------
# Unit test: feed() convenience wrapper
# ---------------------------------------------------------------------------

def test_feed_convenience(vad_model, smart_turn_session) -> None:
    """feed() with pure silence fires exactly once and returns one event."""
    ep = SilenceGatedEndpointer(
        hold_s=0.0,
        backstop_s=0.1,      # fire after 100 ms of silence
        vad_threshold=1.1,   # threshold > 1.0 → everything is silence
        vad_model=vad_model,
        smart_turn_session=smart_turn_session,
    )
    silence = np.zeros(int(0.2 * _SR), dtype=np.float32)  # 200 ms silence
    events = ep.feed(silence)
    # Exactly one event: either smartturn (hold_s=0.0 so it's probed on the first silent frame)
    # or backstop — depending on what Smart Turn returns for a zero-padded window.
    assert len(events) == 1
    assert events[0].kind in ("smartturn", "backstop")
    # After firing, further feed returns nothing (endpointer marks itself done)
    events2 = ep.feed(silence)
    assert len(events2) == 0


if __name__ == "__main__":
    # Allow running directly: uv run python test_endpointing.py
    import pytest as _pytest

    raise SystemExit(_pytest.main([__file__, "-v", "-s"]))
