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

# 1) Resolve + install runtime deps first (cached on the lockfile, not on app code).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) App code (adapters + service modules; tests/harness/.venv excluded via .dockerignore).
COPY . .
RUN uv sync --frozen --no-dev

# 3) Bake the models so the first (and every) cold start is fully offline.
RUN uv run python -c "import numpy as np; \
from adapters.silero_vad import get_silero_model; get_silero_model(); \
from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session; _load_onnx_session(_get_onnx_path()); \
from stt import WhisperSTT; w = WhisperSTT(); w.transcribe(np.zeros(8000, dtype=np.float32))"

EXPOSE 5002

# start-period is generous: warming the shared models in lifespan takes ~30 s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://localhost:5002/healthz || exit 1

CMD ["uv", "run", "uvicorn", "ws_app:app", "--host", "0.0.0.0", "--port", "5002", "--workers", "1"]
