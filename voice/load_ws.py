"""Concurrency / load probe for the voice service — the capacity half of the stress test.

NOT a pytest test. Spawns N FakeBrowserClients (each its own dev interview) that stream a real
Buckeye turn through the live service at once, then reports per-turn latencies + dropped frames, so
the 4-core beef box's safe concurrency is known before deploy.

    uv run python load_ws.py --n 4 --turns 1

Env: OVERFORGE_API_URL, VOICE_WS_URL, OVERFORGE_DEV_JWT (same as test_e2e_ws.py).
Pass bar (target N=4): every client gets a non-empty turn_ready, zero dropped frames, and
p95 EOT→turn_ready stays within a few seconds (STT + brain) while EOT→thinking stays ~flat.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import statistics

from harness.audio_source import load_turn_frames
from harness.bootstrap import create_and_begin
from harness.ws_client import FakeBrowserClient, TurnOutcome

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("load_ws")


async def _one_client(
    idx: int, *, api_base: str, ws_base: str, jwt: str, frames: list[bytes], n_turns: int
) -> list[TurnOutcome]:
    interview_id, session_token = await asyncio.to_thread(
        create_and_begin, api_base=api_base, jwt=jwt, candidate_email=f"load-{idx}@acme.test"
    )
    url = f"{ws_base.rstrip('/')}/ws/interview/{interview_id}"
    outcomes: list[TurnOutcome] = []
    async with FakeBrowserClient(url, session_token, pace="fast") as client:
        for _ in range(n_turns):
            outcome = await client.drive_turn(frames, timeout=60.0)
            outcomes.append(outcome)
            if outcome.turn_ready and outcome.turn_ready.get("isTerminal"):
                break
    return outcomes


async def _main(n: int, n_turns: int) -> int:
    api_base = os.environ["OVERFORGE_API_URL"]
    ws_base = os.environ["VOICE_WS_URL"]
    jwt = os.environ["OVERFORGE_DEV_JWT"]

    # One Buckeye turn, reused by every client (each drives its own interview).
    _, frames = load_turn_frames(n_turns=1)[0]
    logger.info(
        "Loaded %d frames/turn; launching %d concurrent clients × %d turns …",
        len(frames),
        n,
        n_turns,
    )

    results = await asyncio.gather(
        *[
            _one_client(
                i, api_base=api_base, ws_base=ws_base, jwt=jwt, frames=frames, n_turns=n_turns
            )
            for i in range(n)
        ],
        return_exceptions=True,
    )

    thinking_lat: list[float] = []
    turn_lat: list[float] = []
    failures = 0
    for i, res in enumerate(results):
        if isinstance(res, BaseException):
            logger.error("client %d FAILED: %r", i, res)
            failures += 1
            continue
        for o in res:
            if not (o.thinking and o.turn_ready and str(o.turn_ready["transcript"]).strip()):
                logger.error("client %d: incomplete turn (%s)", i, o.cues)
                failures += 1
            if o.eot_to_thinking_s is not None:
                thinking_lat.append(o.eot_to_thinking_s)
            if o.eot_to_turn_ready_s is not None:
                turn_lat.append(o.eot_to_turn_ready_s)

    def _p95(xs: list[float]) -> float:
        return 0.0 if not xs else sorted(xs)[min(len(xs) - 1, int(0.95 * len(xs)))]

    logger.info("=== load N=%d: %d failures ===", n, failures)
    if thinking_lat:
        logger.info(
            "EOT→thinking  mean %.2fs p95 %.2fs", statistics.mean(thinking_lat), _p95(thinking_lat)
        )
    if turn_lat:
        logger.info(
            "EOT→turn_ready mean %.2fs p95 %.2fs", statistics.mean(turn_lat), _p95(turn_lat)
        )
    return 1 if failures else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=4, help="concurrent clients")
    parser.add_argument("--turns", type=int, default=1, help="turns per client")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_main(args.n, args.turns)))
