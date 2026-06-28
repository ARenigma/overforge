"""End-to-end voice pipeline test — the 'stress test before deploy' correctness backbone.

SKIPPED unless ``$OVERFORGE_E2E=1`` (keeps the default gate hermetic). When enabled it needs a LIVE
local backend (``$OVERFORGE_API_URL``, e.g. http://localhost:5001), a running voice service
(``$VOICE_WS_URL``, e.g. ws://localhost:5002), and an interviewer JWT (``$OVERFORGE_DEV_JWT``).

It mints a real dev interview, then streams genuine Buckeye audio through the actual WS → endpointer
→ whisper STT → /answer → cues, asserting the loop fires correctly turn after turn. The brain can be
the deterministic oracle (no MiniMax needed locally) — this validates the PIPELINE, not the LLM.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

_VOICE_DIR = Path(__file__).parent
if str(_VOICE_DIR) not in sys.path:
    sys.path.insert(0, str(_VOICE_DIR))

from harness.audio_source import load_turn_frames  # noqa: E402
from harness.bootstrap import create_and_begin  # noqa: E402
from harness.ws_client import FakeBrowserClient  # noqa: E402

e2e = pytest.mark.skipif(
    os.environ.get("OVERFORGE_E2E") != "1",
    reason="set OVERFORGE_E2E=1 with a live backend + voice service + OVERFORGE_DEV_JWT",
)


@e2e
async def test_e2e_voice_pipeline() -> None:
    api_base = os.environ["OVERFORGE_API_URL"]
    ws_base = os.environ["VOICE_WS_URL"].rstrip("/")
    jwt = os.environ["OVERFORGE_DEV_JWT"]

    interview_id, session_token = create_and_begin(api_base=api_base, jwt=jwt)
    turns = load_turn_frames(n_turns=3)
    url = f"{ws_base}/ws/interview/{interview_id}"

    async with FakeBrowserClient(url, session_token, pace="fast") as client:
        assert client.ready is not None
        assert client.ready["expects"] in ("voice", "text", "code")

        last_phase = None
        for label, frames in turns:
            outcome = await client.drive_turn(frames, timeout=40.0)
            assert outcome.thinking, f"{label}: no 'thinking' backchannel cue"
            tr = outcome.turn_ready
            assert tr is not None, f"{label}: no 'turn_ready' cue"
            assert str(tr["transcript"]).strip() != "", f"{label}: empty transcript from STT"
            utterance = tr["utterance"]
            assert isinstance(utterance, dict) and str(utterance["text"]).strip() != ""
            assert client.frames_sent > 0
            last_phase = tr["phase"]
            if tr["isTerminal"]:
                break

        assert last_phase is not None
