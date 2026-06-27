# Overforge P2-B Voice Pipeline — Candidate Talk-Back Core

This directory contains the validated real-time **silence-gated end-of-turn (EOT) detector**
and **STT wrapper** that form the core of the P2-B candidate talk-back loop.

## Architecture

```
Mic → 32 ms PCM frames
         │
         ▼
  SilenceGatedEndpointer (endpointing.py)
    ├── Silero VAD (per-frame, 32 ms, stateful)
    │     • is_speech?  →  track trailing-silence duration
    ├── Smart Turn v3.2 ONNX (pipecat-ai)
    │     • probe ONCE when trailing silence first reaches hold_s (0.8 s)
    │     • P(complete) ≥ 0.5 → fire EOT ("smartturn")
    └── Backstop
          • trailing silence ≥ backstop_s (3.0 s) → fire EOT regardless ("backstop")
         │
         ▼
  EotEvent(cursor_s, kind, prob, silence_onset_s)
         │
         ├─→ WhisperSTT.transcribe(committed_audio)  →  text  (off hot-path)
         │       faster-whisper small, CPU, int8 — 0.12× real-time
         └─→ [next phases below]
```

## Validated Parameters

| Parameter | Value | Why |
|---|---|---|
| `hold_s` | 0.8 s | Offline sweep (replay_gated.py) showed 0.8 s drops FCR from 70% to ~10% on Buckeye monologues. Clause-boundary pauses are shorter than this; true EOT silences are not. |
| `smart_turn_threshold` | 0.5 | Balanced: best operating point in the offline sweep. Raising to 0.7–0.9 trades away EOT recall at similar FCR. |
| `backstop_s` | 3.0 s | Catches the ~10% of turns where Smart Turn never clears the threshold (long deliberate pauses or low confidence). |
| `vad_threshold` | 0.5 | Silero VAD v5 default; production-tuned. |

**Source:** `eval/voice-turn-bakeoff/replay_gated.py` + `RESULTS_replay_stream.md`.

## Key Design Decisions

### Why silence HOLD beats threshold tuning
Smart Turn fires high (0.9+) at clause-boundary pauses AND at real turn-ends — no threshold
cleanly separates them. The hold gate sidesteps this: clause pauses are short (< 0.5 s) and the
speaker resumes before the hold is reached; only a true turn-end produces silence that persists
past 0.8 s.

### Why one probe per silence onset
Calling the ONNX model every frame during silence wastes CPU and can cause double-firing at the
same silence onset. The `hold_probed` flag ensures exactly one Smart Turn call per qualifying
silence run.

### Why a ring buffer
Smart Turn v3.2 always judges the trailing 8 s of audio (`_WINDOW_SAMPLES = 128 000`). Keeping a
ring buffer avoids O(n) copying of the full audio on every probe — the window is a simple
circular-buffer read.

## How Next Phases Plug In

### P2-B.2 — Backend FSM wiring
On `EotEvent`:
1. Collect all PCM frames accumulated since the last `reset()` into `committed_audio`.
2. Call `WhisperSTT.transcribe(committed_audio)` (async, off the hot-path).
3. POST `{ answer: text }` to the backend FSM route `POST /api/interview/{id}/submit-answer`.
4. Stream the oracle utterance text back.

### P2-B.3 — Cartesia TTS + filler backchannel
- On `EotEvent`, immediately play a ~200 ms acknowledgement sound ("uh-huh", "right") via
  Cartesia's streaming TTS to fill the STT + round-trip latency gap.
- Then stream the oracle utterance as TTS audio to the candidate.

### P2-B.4 — WebSocket transport + browser mic
- Browser `MediaRecorder` at 16 kHz mono sends binary WebSocket frames (32 ms / 512 samples).
- Server-side WebSocket handler calls `ep.feed_frame(frame)` on each incoming chunk.
- On `EotEvent` → trigger the P2-B.2 flow above.
- After oracle TTS completes → call `ep.reset()` to arm for the next turn.

## File Structure

```
voice/
├── endpointing.py        — SilenceGatedEndpointer (this file)
├── stt.py                — WhisperSTT (faster-whisper small, CPU int8)
├── test_endpointing.py   — streaming replay test against Buckeye corpus
├── pyproject.toml        — uv project (reuses eval deps)
└── README.md             — this file
```

## Running Tests

```bash
cd /Users/amit.ranjan/overforge/voice
uv sync                              # builds .venv with exact eval dep set
uv run pytest test_endpointing.py -v -s   # models download on first use
```

Expected output (approximate, depends on Buckeye sample):
- FCR well below 70% baseline (target: 10–30%)
- At least 1 EOT hit
- Clear results table per turn

## Reproduce the Offline Sweep (for reference)

```bash
cd /Users/amit.ranjan/overforge/eval/voice-turn-bakeoff
uv run python replay_gated.py   # full HOLD × threshold sweep on 10 Buckeye turns
```
