# Streaming turn-detection replay — results note (P2 voice de-risk)

`replay_stream.py` validates the **candidate-talk-back core** — Smart Turn v3 (end-of-turn
trigger) + faster-whisper **small** (STT) — on REAL conversational speech (Buckeye interviewee
turns) before we build the WebRTC pipeline.

**Method.** 10 real interviewee turns, each a run of speech with >=1 intra-turn thinking-pause
and a true turn-end (from `corpora/buckeye.py`'s `fetch_turns`). Each turn is streamed forward;
Smart Turn is **VAD-gated exactly like production** (`adapters/smart_turn_v3.detect`): Silero VAD
runs over 32 ms frames and Smart Turn is invoked on the trailing 8 s window only after >=200 ms of
silence — the realistic moment a pipeline asks "is the turn over?". A fire (P(complete) >= 0.5)
**before** the true end = false cutoff (interview-killing); **at/after** = EOT detection. STT
transcribes the full turn.

> Note: an early un-gated variant probing at a fixed 1 s cadence gave FCR 80% by firing mid-word.
> The VAD gate (above) is what makes the FCR production-faithful — and it still lands at 70%.

## Per-turn results

```
turn                 dur wrds pause   cutoff  EOT?   delay  peak_p  STT ms
--------------------------------------------------------------------------------------------
s0101a_turn56      28.9s   90     1    @0.2s   yes     310    0.75    3391
s0101a_turn225     23.4s   76     1        —  MISS       —    0.38    3113
s0101a_turn266     33.3s  103     3    @3.7s   yes     292    0.87    5271
s0101b_turn0       29.3s   96     4    @6.0s  MISS       —    0.93    5272
s0101b_turn87      57.7s  176     4    @1.2s  MISS       —    0.97    6324
s0101b_turn238     30.0s  107     1        —   yes     284    0.04    4807
s0102a_turn21      15.9s   62     1        —  MISS       —    0.02    2816
s0102a_turn48       6.3s   13     1    @2.0s  MISS       —    0.94    1160
s0102a_turn57      11.7s   35     1    @9.2s   yes     271    0.89    1788
s0102b_turn52      18.4s   45     2    @1.1s  MISS       —    0.59    2150
```

(`peak_p` = highest P(complete) seen strictly before the true turn-end — i.e. how close it came
to false-firing even when it didn't.)

## Aggregate

| metric | value |
|---|---|
| turns replayed | 10 |
| **false-cutoff rate** | **7/10 = 70%** (fires mid-turn at a thinking-pause) |
| EOT hit rate | 4/10 = 40% (fires at/after the true turn-end) |
| median EOT delay | 288 ms after last word |
| median STT (small, CPU int8) | 3252 ms/turn |
| STT real-time factor | **0.12x** (8x faster than real-time on CPU) |

## Fire-threshold sweep (same VAD-gated probes, re-scored)

| threshold | FCR | EOT hit | median delay |
|---|---|---|---|
| 0.50 | 70% | 40% | 288 ms |
| 0.70 | 60% | 20% | 291 ms |
| 0.90 | 30% | 20% | 291 ms |
| 0.95 | 10% | 10% | 310 ms |

**No threshold cleanly separates intra-turn pauses from true turn-ends.** The model fires high
(0.9+) at mid-thought clause boundaries *and* at real ends, so raising the bar trades away EOT
recall just as fast as it trades down FCR.

## Verdict

1. **Smart Turn is NOT solid as a standalone EOT trigger** on this material. At P>=0.5 it
   false-cuts 70% of turns; the sweep shows no usable operating point. It latches onto prosodic
   clause boundaries inside long, deliberative answers.
2. **Implication for P2:** do not let Smart Turn fire alone. Gate it behind a longer
   trailing-silence hold (~700-1000 ms) before it may fire, and keep the Silero `stop_secs`
   silence-timeout fallback (already in the adapter) as the backstop for missed EOTs. Treat these
   6-58 s Buckeye monologues as a **worst case** — real interview answers are shorter with fewer
   deep mid-thought pauses, so production FCR should be lower, but this needs re-measuring on
   product-representative speech (e.g. recorded mock-interview answers).
3. **whisper-small (STT) is the right P2 default.** 0.12x real-time on CPU (8x faster than
   real-time) and transcripts are legible for technical speech — acronyms ("OSU"→"OSU"),
   place-names, and clause structure come through; the corpus `um`/`uh` fillers are correctly
   dropped. Finalize STT on the committed turn so it runs concurrently and stays off the
   talk-back hot path. (Per-turn ms looks large only because these turns are 4-8x longer than a
   normal answer; the real-time factor is the model-choice number.)

## Reproduce

```bash
cd eval/voice-turn-bakeoff
uv sync                       # recreates the gitignored .venv
uv run python replay_stream.py   # slow: model downloads + CPU inference
```

Models (Smart Turn v3.2 ONNX via pipecat-ai, whisper-small via faster-whisper, Silero VAD via
torch.hub) download on first use. CPU-only, no API keys.
