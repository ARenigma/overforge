# Real-Interview Findings — 2 live voice sessions, Sunday 2026-07-26

Evidence: prod DB (`interviews`, `interview_events`, `voice_turn_telemetry`, `cost_events`).
Sessions: `843ef70a` (19m20s, 22 turns, **0 code runs**) and `452a2295` (5m30s, 17 turns, 0 runs).
Neither was dev-mode. Both scored. Both ran on Grok TTS (sirius) + AAI STT.

---

## The 7 confirmed defects, in severity order

### D1 — HANDOFF IS A DEAD END: 7m22s of dead air, no coding cue (CRITICAL)
`843ef70a` transitions: `oral→handoff` at 10:51:26, `handoff→coding` at **10:58:48**. The candidate
sat for **7 minutes 22 seconds** with no interviewer speech and no instruction. The transcript proves
why: **there is no handoff utterance and no `ask_code` intro turn anywhere in the 22 turns** (11
interviewer turns = greeting + 6 oral + 4 coding). The candidate was never told the coding round had
started, never told a problem was on screen, never invited to share an approach.

What broke it out of the deadlock: turn 14 = `[Candidate submitted their solution.]` — the candidate
noticed the problem panel on their own, wrote code, and pressed SUBMIT. That submit is what advanced
`handoff→coding`. The FSM's `handoff` state only advances on an `answer` event, so after the oral
round the interviewer went silent and *waited for a candidate utterance it had never asked for*.

Owner-reported symptoms this explains: "didn't ask coding question", "asked coding question without
any cue (no guide to user)", "interviewer stopped talking many times".

### D2 — CODING ROUND ENDS ON TALK, NOT ON WORK (CRITICAL)
`843ef70a` coding phase: 3 `coding→coding` transitions (11:03, 11:06, 11:07) then `coding→wrap_up`
at 11:08:23 — **with zero code runs in the entire interview**. Every *verbal* reply is an `answer`
event that consumes coding follow-up budget (`codeMaxFollowUps=2`/problem); once both problems'
budgets are spent the machine advances to `wrap_up` and scores. So a candidate who talks while coding
gets the interview ended out from under them. Owner-reported: "interview ended even before 2nd coding
question was complete." The coding phase currently has no concept of "work in progress".

### D3 — REPETITION STILL RAMPANT IN PRODUCTION
Oral: turns 3,5,7,9,11,13 are **six consecutive turns** asking for the same thing (latency bottleneck
/ how did you measure it). Coding: turns 15,17,19,21 are **four turns** asking "point me to the line
where you check the dictionary". The repeat-guard shipped 2026-07-24 (8e14da3) did not prevent either
— it guards `ask_oral`/`ask_oral_followup` wording, but these were mostly clarify-path replies and
coding `ask_followup`s, which bypass the cluster check entirely. **The guard must cover EVERY
interviewer utterance path, not just the oral effects.**

### D4 — INTERVIEWER ANSWERS STT FRAGMENTS (the "abrupt" complaint)
`452a2295` turn 16 = candidate `"there?"` (a mid-word cut), turn 17 = interviewer *"Hmm… you
mentioned 'there?'—could you give me the concrete metrics…"*. AAI's EOT committed on a fragment and
the interviewer treated it as a substantive answer. All 11 committed turns across both sessions were
`assemblyai_eot` (punctuation-based). No min-word/min-duration floor rejects a 1-word fragment.
Also `452a2295` turn 11: *"Okay, you built a voicebot. I'm curious—how would you design…"* — replying
to a 6-word fragment as though it were a project walkthrough.

### D5 — NO VERBAL "SECTION" FRAMING
There is no spoken structure: nothing announces "let's start with a walkthrough of your project",
"now the coding round", "last part". The greeting mentions the plan once and never references it
again. Owner ask #3 (label sections) is a real gap, and it is the cheap half of fixing D1.

### D6 — THE INTERVIEWER HAS NO NAME
Candidates cannot address it, invoke it, or ask it something ("hey X, can you repeat that?"). Owner
ask #4. Also relevant to D1: with a name, "ask me anything" becomes usable and the dead-air state
becomes recoverable by the candidate.

### D7 — LATENCY: acceptable first-audio, but total turnaround is long
`voice_turn_telemetry` (843ef70a, 5 turns): `first_audio_ms` **1037–1862ms (good)**; `oracle_ms`
872–1590ms; `tts_ms` 7189–11019ms (this is *full stream duration* for 6–15s of speech, i.e. normal);
`gap_ms` 8061–12558ms. So perceived wait before the interviewer starts talking ≈ oracle + first
audio ≈ **2.0–3.5s** — above the ~1.5s human-masking window but not the cause of the "stopped
talking" complaint (that was D1's dead air).

### Multiple audio: NO duplicate synthesis found
`cost_events` shows 15 grok TTS calls / 1978 chars for `843ef70a` (11 interviewer turns) and 12 calls
/ 1745 chars for `452a2295`. ~130 chars per call = the expected per-sentence chunking of
`/speak-stream` (`splitSentences`), not double-speaking. No evidence of two audio streams. (Not
fully excluded: a room-side double invocation would look identical in the ledger — worth one
browser check with the network panel.)

---

## Fix plan (priority order)

1. **D1/D2 — restructure the coding entry + exit (one change, both bugs).**
   - `handoff` must **not** wait for a candidate utterance: on entering handoff, immediately emit the
     handoff line AND the `ask_code` intro (problem is on screen, one-line gist, invite an approach)
     as a server-driven sequence — no candidate event required.
   - Coding advance must require **work, not words**: a verbal reply during coding that is not a
     SUBMIT/MOVE-ON must not consume the problem budget. Advance on submit/move-on/timer only.
     (`answer` events should feed probes/counter-questions, never `advanceCoding`.)
2. **D3 — apply the cluster cap to every utterance path** (`ask_followup`, clarify replies, coding
   counter-questions), not just the oral effects.
3. **D4 — fragment floor before the oracle sees a turn**: reject/absorb commits under ~3 words or
   ~600ms of speech (extend the existing `_is_filler_only` gate in the voice service) and prefer a
   short "still with you" continuation over answering noise.
4. **D5/D6 — name + sections**: give the interviewer a name in `INTERVIEWER_SYSTEM` (candidate-
   addressable, and teach it to respond when addressed), and add explicit spoken section markers at
   each phase boundary ("walkthrough", "coding round", "wrap-up").
5. **D7 — shave the pre-speech wait**: the oracle call and the first TTS chunk are serial; start
   synthesis on the first sentence as soon as it is available rather than the full utterance.

## Method note
`interview_events.payload` for transitions stores `{from,to,effect}` but `effect` serialised empty in
these rows — the effect kind was not recoverable from the ledger and had to be inferred from
transcript+timing. Fix the payload so future forensics are direct.
