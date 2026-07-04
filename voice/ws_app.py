"""FastAPI entrypoint for the Overforge voice service (P2-B.4a).

Run: ``uv run uvicorn ws_app:app --host 0.0.0.0 --port ${PORT:-5002} --workers 1`` (one asyncio loop
— VoiceSession assumes a single loop). At startup it warms the shared, read-mostly models ONCE
(Silero VAD + Smart Turn ONNX + WhisperSTT) and injects them into each per-connection endpointer
so a connection is cheap. STT is serialized through a threading.Semaphore (the 4-core cap), and the
process caps concurrent connections.

Env: OVERFORGE_API_URL (backend origin — internal compose address in prod), FRONTEND_URL (allowed WS
Origin), PORT, MAX_CONNECTIONS, STT_CONCURRENCY, OMP_NUM_THREADS.

STT provider (P1-A, flag-gated): STT_PROVIDER=assemblyai routes each connection through the
AssemblyAI v3 real-time stream (built-in semantic turn detection — no local endpointer false-cuts
on thinking pauses) with ASSEMBLYAI_API_KEY + STT_KEYTERMS + the STT_* tuning vars (see
stt_assemblyai.AssemblyAIConfig.from_env). Unset/`whisper` keeps the local Silero + Smart-Turn +
whisper path byte-for-byte unchanged; the local models stay warm either way — they are the
in-session fallback when the remote stream permanently fails.

Shadow STT (A/B): STT_SHADOW=soniox + SONIOX_API_KEY runs a Soniox stt-rt-v5 observer that
transcribes the SAME audio in parallel with whatever the primary is. It is log-only (per-turn
transcript captured into voice_turn_telemetry.shadow_*) and never drives turns, so it is safe
alongside any primary. Unset = no shadow.
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
from contracts import AudioArray, ShadowSttLike, SttStreamerLike  # noqa: E402
from endpointing import SilenceGatedEndpointer  # noqa: E402
from session import VoiceSession  # noqa: E402
from stt_assemblyai import AssemblyAIConfig, AssemblyAIStreamer  # noqa: E402
from stt_soniox import SonioxConfig, SonioxShadow  # noqa: E402
from telemetry import RestTelemetrySink  # noqa: E402
from ws_connection import ConnectionDeps, WsConnection  # noqa: E402
from ws_protocol import CLOSE_AT_CAPACITY, CLOSE_ORIGIN_DENIED  # noqa: E402
from ws_sink import WsTtsSink  # noqa: E402

logger = logging.getLogger(__name__)

OVERFORGE_API_URL = os.environ.get("OVERFORGE_API_URL", "http://localhost:5001")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
MAX_CONNECTIONS = int(os.environ.get("MAX_CONNECTIONS", "4"))
STT_CONCURRENCY = int(os.environ.get("STT_CONCURRENCY", "2"))
STT_PROVIDER = os.environ.get("STT_PROVIDER", "whisper").strip().lower()
# Shadow STT (A/B): a second engine transcribes the SAME audio in parallel, log-only. It never
# drives turns, so it's safe to run alongside any primary. STT_SHADOW=soniox enables it.
STT_SHADOW = os.environ.get("STT_SHADOW", "").strip().lower()
_REQUEST_TIMEOUT_S = 30.0


def _use_assemblyai() -> bool:
    """True when the assemblyai provider is selected AND usable (key present)."""
    if STT_PROVIDER != "assemblyai":
        if STT_PROVIDER not in ("", "whisper"):
            logger.error("Unknown STT_PROVIDER=%r — using whisper.", STT_PROVIDER)
        return False
    if not os.environ.get("ASSEMBLYAI_API_KEY"):
        logger.error("STT_PROVIDER=assemblyai but ASSEMBLYAI_API_KEY is unset — using whisper.")
        return False
    return True


def _use_soniox_shadow() -> bool:
    """True when the Soniox shadow is selected AND usable (key present). Log-only observer."""
    if STT_SHADOW != "soniox":
        if STT_SHADOW not in ("", "none"):
            logger.error("Unknown STT_SHADOW=%r — no shadow STT.", STT_SHADOW)
        return False
    if not os.environ.get("SONIOX_API_KEY"):
        logger.error("STT_SHADOW=soniox but SONIOX_API_KEY is unset — no shadow STT.")
        return False
    return True


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
    use_assemblyai = _use_assemblyai()
    if use_assemblyai:
        logger.info("STT provider: assemblyai (v3 streaming; local whisper kept as fallback).")
    use_soniox_shadow = _use_soniox_shadow()
    if use_soniox_shadow:
        logger.info("STT shadow: soniox (A/B observer; log-only, never drives turns).")

    def build_session(
        interview_id: str, token: str, language: str, sink: WsTtsSink
    ) -> VoiceSession:
        # Each connection gets its OWN endpointer (VAD state is per-speaker) over the SHARED,
        # read-mostly warm models; one shared SemaphoreStt; a brain and telemetry sink both
        # using the shared HTTP client (no second connection opened). On the assemblyai path
        # each connection also gets its OWN streamer (one AAI WS per session lifetime); the
        # endpointer + whisper stay wired in as the in-session fallback. With the shadow enabled
        # each connection also gets its OWN Soniox observer (one shadow WS per session lifetime).
        endpointer = SilenceGatedEndpointer(
            vad_model=vad_model, smart_turn_session=smart_turn_session
        )
        telemetry_sink = RestTelemetrySink(interview_id, token, client=http_client)
        streamer: SttStreamerLike | None = None
        if use_assemblyai:
            streamer = AssemblyAIStreamer(AssemblyAIConfig.from_env(language=language))
        shadow: ShadowSttLike | None = None
        if use_soniox_shadow:
            shadow = SonioxShadow(SonioxConfig.from_env(language=language))
        return VoiceSession(
            interview_id=interview_id,
            session_token=token,
            endpointer=endpointer,
            stt=stt,
            brain=RestBrainClient(client=http_client),
            sink=sink,
            language=language,
            telemetry=telemetry_sink,
            streamer=streamer,
            shadow=shadow,
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
