"""FastAPI entrypoint for the Overforge voice service (P2-B.4a).

Run: ``uv run uvicorn ws_app:app --host 0.0.0.0 --port ${PORT:-5002} --workers 1`` (one asyncio loop
— VoiceSession assumes a single loop). At startup it warms the shared, read-mostly models ONCE
(Silero VAD + Smart Turn ONNX + WhisperSTT) and injects them into each per-connection endpointer
so a connection is cheap. STT is serialized through a threading.Semaphore (the 4-core cap), and the
process caps concurrent connections.

Env: OVERFORGE_API_URL (backend origin — internal compose address in prod), FRONTEND_URL (allowed WS
Origin), PORT, MAX_CONNECTIONS, STT_CONCURRENCY, OMP_NUM_THREADS.
"""

from __future__ import annotations

import logging
import os

# Cap native thread pools BEFORE torch/onnx import so the voice service doesn't grab all 4 cores and
# starve the Docker-per-run executor it shares the beef VPS with.
os.environ.setdefault("OMP_NUM_THREADS", "2")

from collections.abc import AsyncIterator  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

import httpx  # noqa: E402
import numpy as np  # noqa: E402
from fastapi import FastAPI, WebSocket  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from brain_client import RestBrainClient  # noqa: E402
from contracts import AudioArray  # noqa: E402
from endpointing import SilenceGatedEndpointer  # noqa: E402
from session import VoiceSession  # noqa: E402
from telemetry import RestTelemetrySink  # noqa: E402
from ws_connection import ConnectionDeps, WsConnection  # noqa: E402
from ws_protocol import CLOSE_AT_CAPACITY, CLOSE_ORIGIN_DENIED  # noqa: E402
from ws_sink import WsTtsSink  # noqa: E402

logger = logging.getLogger(__name__)

OVERFORGE_API_URL = os.environ.get("OVERFORGE_API_URL", "http://localhost:5001")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
MAX_CONNECTIONS = int(os.environ.get("MAX_CONNECTIONS", "4"))
STT_CONCURRENCY = int(os.environ.get("STT_CONCURRENCY", "2"))
_REQUEST_TIMEOUT_S = 30.0


class SemaphoreStt:
    """Wraps a WhisperSTT so concurrent transcribe() calls serialize through a threading.Semaphore.

    transcribe runs in a worker thread (VoiceSession offloads it via asyncio.to_thread), so a
    *threading* semaphore is the right primitive — excess STT bursts block their thread, bounding
    CPU use across connections on the 4-core box without touching the event loop.
    """

    def __init__(self, stt: object, max_concurrency: int) -> None:
        import threading

        self._stt = stt
        self._sem = threading.Semaphore(max_concurrency)

    def transcribe(self, audio: AudioArray, language: str = "en") -> str:
        with self._sem:
            return self._stt.transcribe(audio, language)  # type: ignore[attr-defined, no-any-return]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Warm the shared models once + open the shared backend HTTP client."""
    from adapters.silero_vad import get_silero_model
    from adapters.smart_turn_v3 import _get_onnx_path, _load_onnx_session
    from stt import WhisperSTT

    logger.info("Voice service warming models …")
    vad_model, _ = get_silero_model()
    smart_turn_session = _load_onnx_session(_get_onnx_path())
    whisper = WhisperSTT()
    whisper.transcribe(
        np.zeros(8_000, dtype=np.float32)
    )  # pay the cold-start cost off the hot path
    http_client = httpx.AsyncClient(base_url=OVERFORGE_API_URL, timeout=_REQUEST_TIMEOUT_S)
    stt = SemaphoreStt(whisper, STT_CONCURRENCY)

    def build_session(
        interview_id: str, token: str, language: str, sink: WsTtsSink
    ) -> VoiceSession:
        # Each connection gets its OWN endpointer (VAD state is per-speaker) over the SHARED,
        # read-mostly warm models; one shared SemaphoreStt; a brain and telemetry sink both
        # using the shared HTTP client (no second connection opened).
        endpointer = SilenceGatedEndpointer(
            vad_model=vad_model, smart_turn_session=smart_turn_session
        )
        telemetry_sink = RestTelemetrySink(interview_id, token, client=http_client)
        return VoiceSession(
            interview_id=interview_id,
            session_token=token,
            endpointer=endpointer,
            stt=stt,
            brain=RestBrainClient(client=http_client),
            sink=sink,
            language=language,
            telemetry=telemetry_sink,
        )

    app.state.deps = ConnectionDeps(http_client=http_client, build_session=build_session)
    app.state.active = 0
    app.state.ready = True
    logger.info(
        "Voice service ready (max_connections=%d, stt_concurrency=%d).",
        MAX_CONNECTIONS,
        STT_CONCURRENCY,
    )
    try:
        yield
    finally:
        app.state.ready = False
        await http_client.aclose()


app = FastAPI(lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> JSONResponse:
    if not getattr(app.state, "ready", False):
        return JSONResponse({"status": "warming"}, status_code=503)
    return JSONResponse({"status": "ok", "active": app.state.active})


@app.websocket("/ws/interview/{interview_id}")
async def voice_ws(ws: WebSocket, interview_id: str) -> None:
    # Origin defense-in-depth: a browser sends Origin; a foreign page can't open an authed audio
    # socket even with a leaked token. Non-browser clients (the E2E/load harness) send no Origin.
    origin = ws.headers.get("origin")
    if origin is not None and origin != FRONTEND_URL:
        await ws.close(code=CLOSE_ORIGIN_DENIED)
        return
    if app.state.active >= MAX_CONNECTIONS:
        await ws.close(code=CLOSE_AT_CAPACITY)
        return

    app.state.active += 1  # atomic w.r.t. other connections (single loop, no await before here)
    try:
        await WsConnection(ws, interview_id, app.state.deps).run()
    finally:
        app.state.active -= 1
