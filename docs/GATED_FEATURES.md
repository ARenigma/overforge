# Gated / Deferred Features

Features the product owner (Amit) has **explicitly designated as gated, held, or deferred**.
Do **not** implement these without explicit authorization, even if adjacent work makes them easy.
This is the living list — append a row when a new gate is declared, strike one when it's lifted.

_Last updated: 2026-06-30._

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

## 2. V1.1 proactive idle nudges (held)

The interviewer proactively nudges when a candidate stalls (e.g. ~90 s of no typing/speech).
The reactive V1 autonomous interviewer is deployed; the **proactive** layer is **held pending explicit
authorization**. Trigger logic exists conceptually in `backend/src/interview/intervention.ts`; the
background idle-watcher is what's held. See `overforge-usp` memory.

- **Revisit trigger:** explicit go from Amit. The Wan-Streamer "proactive speaking on visual events"
  concept validates the UX framing (a long pause is a reactable event) but does not lift the gate.

## 3. Mid-speech active-listening backchannels (held — V1.1-adjacent)

Lightweight audio backchannels ("mm-hmm", "right") injected *during* a long candidate answer (not just
post-EOT). Infrastructure already exists (`backend/src/voice/fillers.ts` + `fillerCache.ts`), so it's
cheap — but it is adjacent to the V1.1 proactive hold and **requires explicit authorization**.

- **Revisit trigger:** explicit go from Amit (bundled with, or after, the V1.1 decision).

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
