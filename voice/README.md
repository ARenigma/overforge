# Overforge Voice Service

Python WebSocket service that handles real-time speech in the interview room. One asyncio
process; one event loop; one active connection per interview session.

## Architecture

```
Browser mic (PCM16 mono, 16 kHz)
  │  binary WebSocket frames (32 ms / 512 samples)
  ▼
ws_app.py  (FastAPI + WebSockets, port 5002)
  │
  ├─ STT_PROVIDER=assemblyai (primary, default)
  │     stt_assemblyai.py — AssemblyAI Universal-3-5-pro real-time stream
  │     Semantic turn detection built in; transcript arrives with end-of-turn event
  │
  ├─ STT_SHADOW=soniox (optional, log-only A/B shadow)
  │     stt_soniox.py — Soniox stt-rt-v5 observer on the same audio
  │     Never drives turn detection; swallows all errors silently
  │
  └─ local fallback (STT_PROVIDER=whisper or on AssemblyAI permanent failure)
        endpointing.py — SilenceGatedEndpointer
          ├─ adapters/silero_vad.py   — Silero VAD v5 per-frame gate (32 ms, stateful)
          ├─ adapters/smart_turn_v3.py — Smart Turn v3.2 ONNX (pipecat-ai), one probe
          │                              per silence onset at 0.8 s hold
          └─ backstop: 3.0 s trailing silence fires EOT unconditionally
        stt.py — faster-whisper small (CPU, int8) transcribes committed audio off hot-path

session.py  — VoiceSession turn orchestrator; forwards committed text to the FSM backend
              via POST /api/interviews/{id}/answer (brain_client.py)
contracts.py — shared dataclasses + Protocols (BrainClient, TtsSink, STT, endpointer)
```

Note: **Cartesia TTS lives in the backend** (`backend/src/voice/`), not here. The voice
service is receive-only (mic → text → FSM); TTS audio is streamed from the backend directly
to the browser.

## Environment variables

| Variable | Purpose |
|---|---|
| `OVERFORGE_API_URL` | Backend origin (internal compose address in prod) |
| `FRONTEND_URL` | Allowed WebSocket Origin |
| `PORT` | Listen port (default 5002) |
| `STT_PROVIDER` | `assemblyai` (default) or `whisper` |
| `ASSEMBLYAI_API_KEY` | Required when `STT_PROVIDER=assemblyai` |
| `STT_SHADOW` | Set to `soniox` to enable shadow A/B logging |
| `SONIOX_API_KEY` | Required when `STT_SHADOW=soniox` |
| `MAX_CONNECTIONS` | Concurrent WS connection cap |
| `STT_CONCURRENCY` | Threading semaphore for local Whisper (default 4) |

## Running locally

```bash
cd voice
uv sync
uv run uvicorn ws_app:app --host 0.0.0.0 --port 5002 --workers 1
```

## Tests

```bash
cd voice
uv run pytest -x -q
```

## Load testing

`load_ws.py` is a standalone WebSocket load-test harness — it opens multiple concurrent
connections and streams synthetic PCM frames to stress the service end-to-end.

```bash
cd voice
uv run python load_ws.py --help
```

## Files

```
voice/
├── ws_app.py          — FastAPI entrypoint + lifespan model warm-up
├── ws_connection.py   — per-connection WebSocket handler
├── ws_protocol.py     — WS message framing + auth handshake
├── ws_sink.py         — TtsSink adapter (NoopTtsSink in current deploy)
├── ws_auth.py         — token validation
├── session.py         — VoiceSession turn orchestrator
├── stt.py             — faster-whisper local STT (fallback)
├── stt_assemblyai.py  — AssemblyAI real-time STT (primary)
├── stt_soniox.py      — Soniox shadow streamer (log-only)
├── endpointing.py     — SilenceGatedEndpointer (local path)
├── brain_client.py    — RestBrainClient → POST /api/interviews/:id/answer
├── contracts.py       — shared dataclasses + Protocols
├── telemetry.py       — per-turn voice.turn telemetry (STT/oracle/TTS ms)
├── adapters/          — Silero VAD + Smart Turn ONNX adapters
├── load_ws.py         — standalone WS load-test harness (uv run python load_ws.py --help)
├── harness/           — offline replay harness
└── eval/              — bakeoff results
```
