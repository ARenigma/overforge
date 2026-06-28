# Overforge voice service (P2-B) — FastAPI WebSocket over the silence-gated endpointer + whisper STT.
#
# The models are BAKED into the image so the container loads them OFFLINE at startup (no GitHub/HF
# fetch on a cold start — a runtime fetch would hang /healthz). The three sources:
#   - Smart Turn v3.2 ONNX  → bundled inside the pipecat-ai wheel (ships with `uv sync`).
#   - Silero VAD            → torch.hub download → baked into $TORCH_HOME at build (build == run).
#   - whisper-small (STT)   → faster-whisper HF download → baked into $HF_HOME via a warm transcribe.
# TORCH_HOME / HF_HOME are set as ENV (persist to runtime) so the runtime resolves the baked caches.
#
# Native arm64 (the beef VPS is ARM64). Built on the host by `docker compose build`.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    TORCH_HOME=/models/torch \
    HF_HOME=/models/hf \
    OMP_NUM_THREADS=2

# Runtime libs: libgomp (torch/onnx OpenMP), libsndfile (soundfile), curl (healthcheck).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 libsndfile1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# 1) Resolve + install runtime deps into the venv (cached on the lockfile, not on app code).
# --no-install-project: the service runs the flat modules directly (uv run --no-sync), so we never
# build/install the overforge-voice package itself — avoids a needless hatchling build in the image.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) Bake the models into the image caches (TORCH_HOME / HF_HOME + the wheel-bundled Smart Turn ONNX)
# using ONLY installed deps — NO app code — so this layer's cache key is the lockfile, not app code.
# The GitHub (Silero) + HF (whisper-small) fetch then re-runs only when deps change, never on a code
# edit (previously COPY . . sat above the bake, so every edit re-downloaded the models). These calls
# mirror adapters/silero_vad.py::_load_silero_model, adapters/smart_turn_v3.py::_get_onnx_path, and
# stt.py::WhisperSTT — keep them in sync; the runtime lifespan re-warms via the real adapters, so any
# drift trips the deploy health check. --no-sync: use the venv as-is; never re-sync/build the project.
RUN uv run --no-sync python -c "\
import torch; torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False, onnx=False, verbose=False, trust_repo=True); \
import importlib.resources as ir, pipecat.audio.turn.smart_turn.data as _d, onnxruntime as ort; ort.InferenceSession(str(ir.files(_d).joinpath('smart-turn-v3.2-cpu.onnx'))); \
from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# 3) App code (adapters + service modules; tests/harness/.venv excluded via .dockerignore). Last so an
# edit only busts this cheap layer — the deps + baked-model layers above stay cached.
COPY . .

EXPOSE 5002

# start-period is generous: warming the shared models in lifespan takes ~30 s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:5002/healthz || exit 1

CMD ["uv", "run", "--no-sync", "uvicorn", "ws_app:app", "--app-dir", "/app", "--host", "0.0.0.0", "--port", "5002", "--workers", "1"]
