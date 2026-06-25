# Voice Turn-Detection Bake-off — Phase 1 (Offline)

Offline eval harness for end-of-turn (EOT) detectors targeting the Overforge interview product.

The interview-critical metric is **False-Cutoff Rate (FCR)** — how often the detector misfires
on a 3–6 second "thinking pause" and cuts the candidate off mid-thought.

---

## Quick start

```bash
cd eval/voice-turn-bakeoff
uv sync
uv run python run_offline.py   # fetches data, runs adapters → results/raw_runs.csv
uv run python score.py         # computes FCR table + Pareto → results/
```

Results land in `results/`:
- `raw_runs.csv` — one row per (adapter, param, clip)
- `scored_comparison.csv` — FCR@bucket + latency P50
- `pareto.png` — latency-vs-FCR Pareto frontier
- `pareto_frontier.csv` — Pareto-optimal operating points
- `summary.txt` — human-readable table

---

## Phase 1 coverage

| What | Detail |
|---|---|
| Corpus | pipecat-ai/smart-turn (public HF, binary complete/incomplete labels) |
| Adapters | Smart Turn v3 (ONNX, CPU) + Silero-VAD baseline |
| Param sweep | Silero: stop_secs 0.5-6.0; Smart Turn: stop_secs 1-4 x threshold 0.3/0.5/0.7 |
| Metrics | FCR per bucket (0-2s/2-3s/3-5s/5s+), EOT latency P50/P90, Pareto frontier |
| Network deps | HF dataset fetch only (no API keys required) |

### CANDOR corpus (stretch goal)

CANDOR (850h conversational dataset) requires a gated HF account. Set HF_TOKEN to attempt
streaming 30 clips. Phase 1 succeeds without it.

```bash
HF_TOKEN=hf_xxx uv run python run_offline.py
```

---

## Phase 2 — Closed providers (TODO, requires API keys)

These adapters are stubbed in `adapters/` with integration notes but not implemented:

| File | Provider | Key env vars | Notes |
|---|---|---|---|
| `adapters/deepgram_flux.py` | Deepgram Flux | `DEEPGRAM_API_KEY` | Websocket streaming, SpeechFinal events |
| `adapters/vapi.py` | VAPI | `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID` | Wraps Deepgram; no offline batch API yet |
| `adapters/livekit_v1.py` | LiveKit Agents | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | livekit-agents VAD, min/max endpointing delay |

Phase 2 also adds:
- A larger eval corpus (CANDOR full, LibriSpeech pause-injected synthetic clips)
- Real-time streaming simulation (TCP socket to adapter)
- Significance testing (bootstrap CI on FCR delta between adapters)

---

## Architecture

```
run_offline.py
  +-- corpora/fetch_smartturn.py   <- pipecat-ai/smart-turn (HF)
  +-- corpora/fetch_candor.py      <- CANDOR streaming (optional, gated)
  +-- adapters/silero_vad.py       <- Silero VAD + silence timeout
  +-- adapters/smart_turn_v3.py    <- Smart Turn v3 ONNX + Silero gate

score.py -> results/
```

### Adapter ABC

```python
class BaseAdapter:
    def detect(audio: np.ndarray, sample_rate: int, clip_id: str, is_complete: bool) -> ClipResult
```

`ClipResult.fired_at_ms` = first EOT fire timestamp (None = never fired).

### Metric definitions

- **FCR** = false_cutoffs / n_incomplete_clips (lower = better; target < 10%)
- **EOT latency** = fired_at_ms on complete clips (lower = better)
- **Pareto** = operating points not dominated on both FCR and latency simultaneously

### Smart Turn v3 fallback

If the ONNX model cannot be fetched from pipecat-ai/smart-turn, the adapter
automatically falls back to pure Silero-VAD timeout with the same stop_secs param.
The `fallback` column in raw_runs.csv records this.

---

## Requirements

- Python 3.11+, managed by uv
- ffmpeg (install: `brew install ffmpeg`)
- CPU-only; no GPU required
- No API keys for Phase 1
