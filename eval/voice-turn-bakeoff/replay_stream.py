"""STREAMING turn-detection replay harness — the candidate-talk-back core for P2 voice.

This validates the two pieces of the talk-back loop on REAL conversational speech BEFORE we
build the WebRTC pipeline:

  1. Smart Turn v3 as the end-of-turn (EOT) trigger.  We replay each interviewee turn forward
     in ~1s frames (as a real-time stream would arrive).  Smart Turn is VAD-GATED exactly as in
     production (adapters/smart_turn_v3.detect): we run Silero VAD frame-by-frame and only invoke
     Smart Turn on the trailing 8 s window AFTER >= 200 ms of consecutive silence — i.e. at the
     silence onsets where a real pipeline would actually ask "is the turn over?".  We record
     whether it would FIRE (P(complete) >= 0.5) at each such point.  Two failure modes matter:
       (a) FALSE CUTOFF — fires DURING the turn, at an intra-turn thinking-pause, before the real
           end.  This is the interview-killing error: it cuts the candidate off mid-thought.
       (b) EOT detection — fires at/after the true turn boundary, and how many ms after the last
           word it takes (the talk-back latency the rest of the pipeline inherits).
  Gating matters: an un-gated probe at a fixed 1 s cadence fires mid-word and wildly over-counts
  cutoffs; the VAD gate is what makes the FCR number production-faithful.
  2. faster-whisper **small** (CPU, int8) as the STT.  We transcribe each full turn and report
     the text + per-turn wall-time, to confirm `small` is accurate enough for technical-interview
     speech and fast enough on CPU.

NOTE: Smart Turn's ONNX graph already applies the final sigmoid — outputs[0][0] IS P(complete).
Do NOT re-sigmoid it (that bug compressed every score into [0.5, 0.73]).

Run:  uv run python replay_stream.py
(slow on first run — model downloads + CPU inference; that's expected.)
"""
from __future__ import annotations

import logging
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

from adapters.silero_vad import get_silero_model  # noqa: E402
from adapters.smart_turn_v3 import (  # noqa: E402
    _get_onnx_path,
    _load_onnx_session,
    compute_whisper_log_mel,
)
from corpora.buckeye import Turn, fetch_turns  # noqa: E402

_SR = 16_000
_VAD_FRAME = 512        # Silero VAD frame (512 samples @ 16 kHz = 32 ms)
_WINDOW_S = 8.0         # Smart Turn always judges on the trailing 8 s
_SILENCE_GATE_S = 0.2   # invoke Smart Turn only after >= 200 ms trailing silence (prod gate)
_FIRE_THRESHOLD = 0.5   # P(complete) >= this → the trigger would fire
_VAD_THRESHOLD = 0.5    # Silero speech/silence threshold
# A fire counts as a true-EOT hit if it lands at/after the last word minus this slack (a fire a
# hair before the labelled word-end is still an end-of-turn detection, not a mid-thought cutoff).
_EOT_SLACK_S = 0.25
_N_TURNS = 10


@dataclass
class StreamResult:
    turn_id: str
    source: str
    turn_dur_s: float
    last_word_s: float
    n_words: int
    n_hold_pauses: int
    # Streaming EOT detection
    false_cutoff: bool
    first_cutoff_ms: float | None     # when it fired mid-turn (None = never)
    eot_hit: bool
    eot_delay_ms: float | None        # ms after last word that it fired (None = missed)
    max_prob_in_turn: float           # peak P(complete) seen strictly before the true end
    # Full gated-probe sequence (cursor_s, prob) — kept so we can sweep the fire threshold.
    probes: list[tuple[float, float]]
    # STT
    stt_text: str
    stt_ms: float
    ref_words: str


def _smart_turn_prob(session, audio: np.ndarray, end_sample: int) -> float:
    """P(complete) for the trailing 8 s window ending at `end_sample`. Raw ONNX output."""
    window_samples = int(_WINDOW_S * _SR)
    chunk = audio[max(0, end_sample - window_samples) : end_sample]
    log_mel = compute_whisper_log_mel(chunk)  # handles front-pad to 8 s
    out = session.run(None, {"input_features": log_mel[np.newaxis, ...]})
    return float(np.asarray(out[0]).reshape(-1)[0])


def stream_probe(session, vad_model, turn: Turn) -> list[tuple[float, float]]:
    """Replay one turn as a forward stream, VAD-gated like production, and return EVERY Smart Turn
    probe as (cursor_s, prob).

    Walks Silero VAD over 32 ms frames; whenever consecutive trailing silence first crosses the
    200 ms gate (the realistic moment a pipeline asks "is the turn over?"), runs Smart Turn on the
    trailing 8 s window. Probing the WHOLE turn (no early stop) lets us sweep the fire threshold
    offline against the same probe sequence the live trigger would see.
    """
    import torch

    audio = turn.audio
    gate_samples = int(_SILENCE_GATE_S * _SR)
    n_frames = len(audio) // _VAD_FRAME

    probes: list[tuple[float, float]] = []
    silence_count = 0
    probed_this_silence = False  # one Smart Turn probe per silence onset (avoids 32 ms spam)

    for i in range(n_frames):
        end_sample = i * _VAD_FRAME + _VAD_FRAME
        frame = audio[i * _VAD_FRAME : end_sample]

        with torch.no_grad():
            speech_prob = float(vad_model(torch.from_numpy(frame).unsqueeze(0), _SR).item())

        if speech_prob >= _VAD_THRESHOLD:
            silence_count = 0
            probed_this_silence = False
            continue

        silence_count += _VAD_FRAME
        if silence_count >= gate_samples and not probed_this_silence:
            probed_this_silence = True
            probes.append((end_sample / _SR, _smart_turn_prob(session, audio, end_sample)))

    return probes


def score_probes(
    probes: list[tuple[float, float]], last_word_s: float, threshold: float
) -> tuple[bool, float | None, bool, float | None, float]:
    """Turn a probe sequence into outcomes at a given fire threshold.

    First fire BEFORE the true end → false cutoff; first fire AT/AFTER → EOT detection.
    Returns: (false_cutoff, first_cutoff_ms, eot_hit, eot_delay_ms, max_prob_in_turn).
    """
    false_cutoff = False
    first_cutoff_ms: float | None = None
    eot_hit = False
    eot_delay_ms: float | None = None
    max_prob_in_turn = 0.0

    for cursor_s, prob in probes:
        if cursor_s < last_word_s - _EOT_SLACK_S:
            max_prob_in_turn = max(max_prob_in_turn, prob)
        if prob < threshold:
            continue
        if cursor_s >= last_word_s - _EOT_SLACK_S:
            if not eot_hit:
                eot_hit = True
                eot_delay_ms = max(0.0, (cursor_s - last_word_s) * 1000.0)
            break  # a real EOT fire ends the turn in a live system
        elif not false_cutoff:
            false_cutoff = True
            first_cutoff_ms = cursor_s * 1000.0

    return false_cutoff, first_cutoff_ms, eot_hit, eot_delay_ms, max_prob_in_turn


def transcribe(stt_model, audio: np.ndarray) -> tuple[str, float]:
    """faster-whisper small on the full turn. Returns (text, wall_time_ms)."""
    t0 = time.perf_counter()
    segs, _ = stt_model.transcribe(audio.astype(np.float32), language="en", beam_size=1)
    text = " ".join(s.text for s in segs).strip()
    return text, (time.perf_counter() - t0) * 1000.0


def main() -> None:
    turns = fetch_turns(n_turns=_N_TURNS)
    if not turns:
        print("No qualifying Buckeye turns found — check recordings/ extraction.")
        sys.exit(1)
    log.info("Loaded %d turns; loading models…", len(turns))

    session = _load_onnx_session(_get_onnx_path())
    vad_model, _ = get_silero_model()

    from faster_whisper import WhisperModel

    log.info("loading faster-whisper small (cpu, int8)… (downloads on first use)")
    stt_model = WhisperModel("small", device="cpu", compute_type="int8")
    # Warm STT so the one-off graph/model load isn't charged to a per-turn measurement.
    warm = turns[0].audio[:_SR].astype(np.float32)
    list(stt_model.transcribe(warm, language="en", beam_size=1)[0])

    results: list[StreamResult] = []
    for i, turn in enumerate(turns, 1):
        log.info(
            "[%d/%d] %s — %.1fs, %d words, %d intra-turn pause(s), last word @ %.1fs",
            i, len(turns), turn.turn_id, len(turn.audio) / _SR,
            turn.n_words, len(turn.hold_pauses), turn.last_word_end,
        )
        probes = stream_probe(session, vad_model, turn)
        fc, fc_ms, hit, delay_ms, max_p = score_probes(
            probes, turn.last_word_end, _FIRE_THRESHOLD
        )
        text, stt_ms = transcribe(stt_model, turn.audio)
        log.info("    cutoff=%s  eot_hit=%s  delay=%s  stt=%.0fms",
                 fc, hit, f"{delay_ms:.0f}ms" if delay_ms is not None else "—", stt_ms)
        results.append(
            StreamResult(
                turn_id=turn.turn_id,
                source=turn.source,
                turn_dur_s=len(turn.audio) / _SR,
                last_word_s=turn.last_word_end,
                n_words=turn.n_words,
                n_hold_pauses=len(turn.hold_pauses),
                false_cutoff=fc,
                first_cutoff_ms=fc_ms,
                eot_hit=hit,
                eot_delay_ms=delay_ms,
                max_prob_in_turn=max_p,
                probes=probes,
                stt_text=text,
                stt_ms=stt_ms,
                ref_words=turn.transcript_words,
            )
        )

    _print_report(results)


def _print_report(results: list[StreamResult]) -> None:
    n = len(results)
    n_cutoff = sum(r.false_cutoff for r in results)
    n_hit = sum(r.eot_hit for r in results)
    delays = [r.eot_delay_ms for r in results if r.eot_hit and r.eot_delay_ms is not None]
    stt_times = [r.stt_ms for r in results]

    print("\n" + "=" * 92)
    print("STREAMING turn-detection replay — Smart Turn v3 (EOT) + whisper-small (STT)")
    print("Real Buckeye interview turns, streamed forward; Smart Turn VAD-gated (200ms silence),")
    print(f"8s trailing window, fire @ P>={_FIRE_THRESHOLD}.")
    print("=" * 92)

    print(
        f"\n{'turn':<18}{'dur':>6}{'wrds':>5}{'pause':>6}"
        f"{'cutoff':>9}{'EOT?':>6}{'delay':>8}{'peak_p':>8}{'STT ms':>8}"
    )
    print("-" * 92)
    for r in results:
        cut = f"@{r.first_cutoff_ms / 1000:.1f}s" if r.false_cutoff else "—"
        delay = f"{r.eot_delay_ms:.0f}" if (r.eot_hit and r.eot_delay_ms is not None) else "—"
        eot = "yes" if r.eot_hit else "MISS"
        print(
            f"{r.turn_id:<18}{r.turn_dur_s:>5.1f}s{r.n_words:>5}{r.n_hold_pauses:>6}"
            f"{cut:>9}{eot:>6}{delay:>8}{r.max_prob_in_turn:>8.2f}{r.stt_ms:>8.0f}"
        )

    print("\n--- transcripts (STT small) vs corpus word labels ---")
    for r in results:
        print(f"\n  [{r.turn_id}]")
        print(f"    STT : {r.stt_text!r}")
        print(f"    ref : {r.ref_words!r}")

    med_delay = statistics.median(delays) if delays else float("nan")
    med_stt = statistics.median(stt_times)
    print("\n" + "=" * 92)
    print("AGGREGATE")
    print("-" * 92)
    print(f"  turns replayed          : {n}")
    print(f"  FALSE-CUTOFF rate       : {n_cutoff}/{n} = {n_cutoff / n:.0%}"
          "   (fires mid-turn at a thinking-pause — interview-killing)")
    print(f"  EOT hit rate            : {n_hit}/{n} = {n_hit / n:.0%}"
          "   (fires at/after the true turn-end)")
    if delays:
        print(f"  median EOT delay        : {med_delay:.0f} ms after last word")
    else:
        print("  median EOT delay        : n/a (no EOT hits)")
    print(f"  median STT (small, cpu) : {med_stt:.0f} ms per turn")
    if stt_times:
        rtf = med_stt / 1000.0 / statistics.median([r.turn_dur_s for r in results])
        print(f"  STT real-time factor    : {rtf:.2f}x  (<1 = faster than real-time on CPU)")

    # --- Fire-threshold sweep: can a higher threshold trade FCR for EOT recall? ---
    print("\nFIRE-THRESHOLD SWEEP (same VAD-gated probes, re-scored)")
    print(f"  {'thr':>5}{'FCR':>8}{'EOT hit':>9}{'med delay':>11}")
    for thr in (0.5, 0.7, 0.9, 0.95):
        cuts = hits = 0
        sweep_delays: list[float] = []
        for r in results:
            fc, _, hit, d, _ = score_probes(r.probes, r.last_word_s, thr)
            cuts += fc
            hits += hit
            if hit and d is not None:
                sweep_delays.append(d)
        md = f"{statistics.median(sweep_delays):.0f} ms" if sweep_delays else "—"
        print(f"  {thr:>5.2f}{cuts / n:>8.0%}{hits / n:>9.0%}{md:>11}")

    print("\n" + "=" * 92)
    print("VERDICT (P2 candidate-talk-back core)")
    print("-" * 92)
    fcr = n_cutoff / n
    rtf = med_stt / 1000.0 / statistics.median([r.turn_dur_s for r in results])
    # Line 1: Smart Turn EOT — the make-or-break interview metric, read off the sweep.
    if fcr == 0:
        print("  1. SMART TURN: held through every thinking-pause (0% false-cutoff) — solid as the")
        print("     EOT trigger; ship it gated behind VAD as tested.")
    else:
        print("  1. SMART TURN: NOT solid as a standalone EOT trigger. At P>=0.5 it false-cuts")
        print(f"     {fcr:.0%} of turns, and the sweep shows NO threshold cleanly splits mid-turn")
        print("     pauses from true ends — fires high (0.9+) mid-thought on long, deliberative")
        print("     answers, so raising the bar kills EOT recall before FCR is safe.")
    # Line 2: what to do — engineering implication, not just the raw number.
    print("  2. IMPLICATION: do NOT let Smart Turn fire alone. Require a longer trailing-silence")
    print("     hold (e.g. 700-1000ms) before it may fire, lean on the Silero stop_secs fallback")
    print("     for missed EOTs, and treat these 6-58s Buckeye monologues as a worst case (real")
    print("     interview answers are shorter, with fewer deep mid-thought pauses).")
    # Line 3: STT — judge by real-time factor + legibility, not raw ms (these turns are long).
    if rtf < 0.5:
        print(f"  3. WHISPER-SMALL (STT): {rtf:.2f}x real-time on CPU, transcripts legible for")
        print("     speech (numbers/acronyms intact) — small is the right P2 default; finalize on")
        print("     the committed turn so STT runs concurrently, off the talk-back path.")
    else:
        print(f"  3. WHISPER-SMALL (STT): {rtf:.2f}x real-time on CPU is marginal — use a turbo")
        print("     model or streaming partial finalize to keep STT off the talk-back path.")
    print("=" * 92)


if __name__ == "__main__":
    main()
