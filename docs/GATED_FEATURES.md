# Gated / Deferred Features

Features the product owner (Amit) has **explicitly designated as gated, held, or deferred**.
Do **not** implement these without explicit authorization, even if adjacent work makes them easy.
This is the living list — append a row when a new gate is declared, strike one when it's lifted.

_Last updated: 2026-07-04._

**Recently SHIPPED:** Candidate camera + behavioral anti-cheat **Phase 1** (approved + deployed
2026-06-30) — in-browser MediaPipe, flags-only, required gate, advisory scorecard. See the struck
row below. The rest of the video umbrella (avatar output, lip-sync, full Wan-Streamer) stays gated,
and the audio "second-voice" anti-cheat is **Phase 2 (gated, §4)**.

---

## 1. Video interviewer (umbrella — gated 2026-06-28)

A *visual* AI interviewer is the long-term differentiator, but explicitly **deferred to a later phase**.
None of the sub-items below ship until video is taken off the gate. Evaluated in depth via the
Wan-Streamer study (see `wan-streamer-eval` memory).

| Sub-feature | What it is | Revisit trigger |
|---|---|---|
| Animated avatar state machine | Idle/listening/speaking animation driven by existing React state (`micForwarding`, `voiceSpeakingRef`) in `frontend/app/interview/[id]/page.tsx`. Cosmetic, $0 infra. | When video phase opens — this is the cheapest first step. |
| ~~Candidate camera + behavioral anti-cheat~~ **✅ SHIPPED 2026-06-30 — Phase 1 deployed** | In-browser MediaPipe face-detect; **flags only, no image/video uploaded or stored**. Required camera gate to start; advisory scorecard. Signals: face present/absent, multiple faces, gaze. **+ audio second-voice detection** (another person helping verbally; keyboard already filtered by Silero VAD) — that's the harder **Phase 2**. | Approved — Phase 1 (camera) building; Phase 2 (audio second-voice) needs an approach decision (voiceprint-verification vs diarization vs heuristic) + accepts added model/CPU cost on the slim voice service. |
| In-browser lip-sync (Wav2Lip ONNX) | Client-side lip-sync of the existing Cartesia audio over a static portrait. No GPU (browser inference). | After a latency/quality spike on a mid-range laptop + a bias audit. |
| Hosted talking-head avatar API | Simli (~$0.40–0.50/interview) or Anam ($299/mo) bolted onto `cartesia.ts` synthesize(). Only positive value/feasibility path to *real* video. | When video phase opens — preferred path vs self-hosting. |
| Full Wan-Streamer end-to-end A/V model | Unified streaming Transformer (arXiv 2606.25041). | **Blocked**: needs released weights (none yet) + GPU infra (we're CPU-only) + 480p+ + bias audit. Watch for weight release. |

## 2. ~~V1.1 proactive idle nudges (held)~~ **✅ BUILT 2026-07-05 — behind `IDLE_NUDGE_ENABLED` (default OFF)**

Authorized by Amit 2026-07-05 ("full human vision"). Research-grounded design (real coding-round
corpus): compound-idle detection in the room (no keystroke + no run + no chat + not speaking;
protected planning windows — 90 s idle / 150 s blank-editor floor in real interviews, compressed in
dev interviews), server-authoritative gates (`decideIdleIntervention`: coding-phase only, 1
nudge/question, quiet on a pending/declined offer or a solved problem), content-free rung-0 wording
only (never a probe/offer/hint — nothing failed), persisted as a synthetic `status:'Idle'` run on
the code-run channel (race-free; excluded from run signals, the assist budget, and the scorer).

- **✅ ENABLED in prod since 2026-07-07** (Amit's go); `IDLE_NUDGE_ENABLED=1` in the host
  `deploy/backend.env`, re-confirmed live in the running backend container 2026-07-10.
- **Next — data-gated tuning:** the 90 s idle / 150 s blank-editor windows are still the corpus
  defaults. Once enough prod interviews accrue, review the synthetic `Idle` runs (fire rate, whether
  the nudged candidate then acted, false positives on genuine thinking) and tune the windows +
  consider a wall-clock stagnation backstop.

## 3. ~~Mid-speech active-listening backchannels~~ **✗ REJECTED 2026-07-20 ("we don't need backchannel")**

Lightweight audio backchannels ("mm-hmm", "right") injected *during* a long candidate answer (not just
post-EOT). The old post-EOT "thinking filler" infrastructure (`backend/src/voice/fillers.ts` +
`fillerCache.ts` + `frontend/lib/voice/play-filler.ts`) was **removed as slop 2026-07-04** — the
thinking filler was killed (it bled into the mic → self-echo), so its code was dead.

- **Decision:** Amit explicitly rejected the feature 2026-07-20. Do not build. Voice quality effort
  goes to voice *selection* (more natural Cartesia voice IDs) instead.

## 4. Audio "second-voice" detection — anti-cheat Phase 2 (gated 2026-06-30)

Detect when **another person speaks** to help the candidate verbally. Keyboard strokes are already
non-speech → filtered by Silero VAD; the hard part is distinguishing the candidate's voice from a
second voice (speaker verification / diarization). **Deferred behind Phase 1 (camera)** per Amit, and
it adds a speaker-embedding model + CPU load to the deliberately-slim CPU-only voice service
(11.8→3.73 GB; `STT_CONCURRENCY=2`, `OMP=2` on a 4-core ARM box) — a real milestone, not a bolt-on.

- **Options:** (A) voiceprint enroll + per-turn verify *(recommended)*; (B) diarization / speaker-change
  heuristic; (C) lightweight overlap/background-speech heuristic (no new model, noisier).
- **Revisit trigger:** after Phase 1 (camera) ships, pick an approach (A/B/C) and accept the model/CPU cost.

---

> Maintained in lockstep with the `overforge-gated-features` project memory so these gates are
> respected automatically each session.
