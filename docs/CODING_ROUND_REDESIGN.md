# Coding-Round Redesign — Build Spec (plan-to-the-teeth)

**Status:** LOCKED design, pre-build. Author: principal-eng synthesis of a 12-agent enterprise
research + code-audit + adversarial-critique pass (2026-07-12). Build from THIS file — it folds the
adversarial critique's 5 blockers back into the spec as hard requirements. Do not build from the raw
synthesis snippets; several were defective (see §BLOCKERS).

Related: [[overforge-coding-flow-design]] (the earlier locked UX calls), [[overforge-coding-pipeline]],
[[overforge-interviewer-quality]], [[overforge-launch-readiness-audit]].

---

## THESIS
The counter-question on SUBMIT is not a feature — it is Finite's anti-cheat architecture and its only
defensible moat. It must be **structurally impossible to skip**, must **survive oracle failure**, must
be **code-anchored** (cite a real token in the submitted code — a generic "explain your approach" is
answerable by an overlay tool and defeats the moat), stay **bounded/terminating**, and never race the
hint ladder. Enforcement lives in the PURE MACHINE, not the oracle and not the frontend.

## THREE-VERB CONTROL MODEL
| Verb | FSM effect | Oracle? | Advances? | Counter-question? |
|---|---|---|---|---|
| **Run Code** | none (never touches FSM) | no | no | no — grades vs hidden tests, expected output stripped |
| **Submit & Continue** | `answer` + `intent:'submit'` | yes (signal + depth-2 family) | only AFTER the mandatory CQ is answered | **ALWAYS ≥1, machine-enforced, code-anchored** |
| **Move On** | `answer` + `intent:'move_on'` | no (skipped) | immediately | never (forward-only firm skip) |

Locked product calls (from Amit): 3 controls; Move-on = firm skip (no probe); per-problem 15m SOFT +
overall 60m HARD; no auto-advance on all-tests-pass; forward-only. **NEW mandate:** submitting code
ALWAYS fires ≥1 counter-question before advancing (this is the change from "followUp optional").

---

## ⛔ THE 5 BLOCKERS — mandatory fixes, each with its own regression test (build-gating)

**B1 — Code-anchoring on the SUBMITTED code, not `code_snapshot`.**
`interventionReq.code` reads `interview.code_snapshot`, which is written ONLY by `/run` (appendCodeRun).
A type-then-submit-without-running candidate anchors the CQ on stale/empty code → moat silently
defeated for the common path. FIX: `/answer` with `intent:'submit'` MUST carry the current editor code
and the orchestrator MUST persist it to `code_snapshot` (or pass it directly into the intervention
prompt) BEFORE generating the CQ. TEST: type-then-submit (no prior /run) → CQ cites a token from the
submitted code.

**B2 — Reserve time for the mandated interaction vs the 60-min hard cap.**
`durationExceeded()` 409s any `/answer`/`/run` past the cap. So a SUBMIT at 59:xx either 409s (no CQ
ever) or fires a CQ the candidate then can't answer (409). The "ALWAYS ≥1 CQ" invariant is false at
the boundary. FIX: reserve a CQ window — e.g. block *new* SUBMITs in the final N minutes (surface
"not enough time for a full submission — Move On to finish") AND allow the CQ-answer turn to complete
even if it crosses the cap (grace for an in-flight mandated CQ). Decide N (~3–5 min). TEST: SUBMIT at
T-≈0 → deterministic, documented behavior (CQ completes OR submit is refused with guidance), never a
dangling CQ.

**B3 — Backward-compat read guard for `codeMaxFollowUps`.**
Legacy/in-flight `fsm_state.config` lacks the new field → `ctx.followUps < undefined` is `false` →
mandate silently OFF for every interview live at deploy. FIX: read `config.codeMaxFollowUps ?? 2`
EVERYWHERE (machine + orchestrator), or re-hydrate config from DEFAULT_CONFIG on load. TEST: a
persisted context WITHOUT `codeMaxFollowUps` still fires the mandatory CQ.

**B4 — Skip the clarify path on `intent:'submit'`.**
`looksLikeQuestion()` returns true on any '?' → submitted code with a ternary (`a ? b : c`) or a '?'
in a comment/string trips `maybeAnswerClarification`, which can classify the SUBMIT as a question,
answer it, and return WITHOUT advancing or firing the CQ. FIX: for `intent:'submit'` AND `'move_on'`,
SKIP `maybeAnswerClarification` and `maybeResolveHintOffer` entirely. TEST: SUBMIT of code containing
a ternary still fires the mandatory CQ.

**B5 — Code-anchoring survives oracle failure.**
On a 429/timeout, `evaluateAnswer` returns `{followUp:false}` and the CQ falls back to
DeterministicOracle, which cannot cite the candidate's code → CQ fires but is GENERIC (moat lost under
exactly the load that triggers the fallback). FIX: a deterministic **code-anchored** fallback probe —
statically extract a token from the submitted code (a data structure / loop / function name) and
template a probe around it, so even without the LLM the CQ references real code. TEST: inject an
oracle-429 on submit → the CQ still cites a real code token (not "explain your approach").

---

## MAJOR fixes (fold in, not separately gated but required for "flawless")
- **M1 Scoring discriminant:** exclude the mandatory CQ from assist-penalty keyed on
  `effect.mandatory === true`, NOT `wantsFollowUp` (else a submission the oracle independently found
  probe-worthy gets penalized). scorer.ts weighs all `assist` turns down today.
- **M2 Empty/near-empty submit:** fork to an approach-level probe or a Move-On suggestion; never let
  the taxonomy hallucinate references to nonexistent code.
- **M3 Voice control surface:** `intent` is button-only. Voice transcripts MUST default to
  `intent:'answer'` — a spoken "I'm done" must never auto-submit. The voice service (separate) is
  untouched; enforce that a straggler voice turn cannot consume the CQ slot (mutex + phase/turn guard).
- **M4 Empty-answer 400:** `/answer` rejects empty bodies; a SUBMIT button has none → relax for
  submit/move_on with a synthetic answer string, else the feature never fires.
- **M5 Pending hint-OFFER + SUBMIT collision:** auto-decline any open offer before `advance()` on
  submit/move_on (else double-bubble: unresolved offer + CQ).
- **M6 Legal/AEDT:** an autonomous no-human-in-loop hire-recommender is NYC LL144 + EU-AI-Act
  high-risk. The FSM audit log is NOT the bias audit. Needs: published bias audit, candidate AEDT
  notice, human-oversight story, BIPA posture for camera/behavioral signals. LEGAL, not code — flag to
  Amit (already on the launch-audit operator TODO).

## FSM CHANGE (machine.ts coding case) — corrected
```ts
case 'coding': {
  if (event.intent === 'move_on') return advanceCoding(ctx, config); // firm skip, no oracle/probe
  const cap = config.codeMaxFollowUps ?? 2;                          // B3 backward-compat
  const wantsFollowUp  = event.decision?.followUp === true;
  const mandatoryProbe = event.intent === 'submit' && ctx.followUps === 0;
  if ((wantsFollowUp || mandatoryProbe) && ctx.followUps < cap) {
    const depth = ctx.followUps + 1;
    return { ctx: { ...ctx, followUps: depth },
             effect: { kind: 'ask_followup', codeIndex: ctx.codeIndex, depth, mandatory: mandatoryProbe } };
  }
  return advanceCoding(ctx, config);
}
```
Extract `advanceCoding(ctx,config)` (single-source the codeIndex++ / wrap_up). Add `mandatory?:boolean`
to the `ask_followup` effect. Invariants (assert + property-test): mandatory fires iff
`intent==='submit' && followUps===0 && phase==='coding'`; at most once/problem; `followUps ≤ cap`
always; MOVE-ON never emits ask_followup; codeIndex non-decreasing; advance() stays pure.

## COUNTER-QUESTION TAXONOMY (oracle selects family; machine fires) — all MUST cite real code
complexity · edge_case · trade_off · constraint_change · conceptual_ownership. Add `probeFamily` to the
intervention request + `probeHints: string[]` per problem in bank.json (strip in toPublicProblem).
Never tight-cap maxTokens on this call (past cause of ~50% scoring failures).

## CHANGE SURFACE
Server: types.ts (intent, mandatory, codeMaxFollowUps=2, CodingProblem.probeHints), machine.ts (above),
orchestrator.ts (submitAnswer(intent); B1/B4/M5 paths; B5 fallback; M1 assist guard; audit-log append;
server-derived 15m nudge from ask_code ts), http/interviews.ts (intent validate+phase-gate; B2 window;
M4 empty relax; rate-limit move_on), scorer.ts (no change if M1 done in orchestrator), minimax.ts
(taxonomy in EVALUATOR_SYSTEM + code-anchor instruction).
Frontend: lib/api.ts (intent), app/interview/[id]/page.tsx (3-control bar, submitting state,
handleSubmit/handleMoveOn, confirm modals, no-auto-advance banner, Problem N/M, run AbortController+15s
watchdog, autosave indicator, aria-live run/thinking, CodeMirror Tab-trap escape, voice-mode guards,
mobile), problem-dock.tsx (Problem N/M).
Tests: machine.test.ts (unit), NEW property suite via fast-check (MANDATORY_COUNTER, CAP, TERMINATION,
FORWARD_ONLY, NO_AUTO_ADVANCE — at ORCHESTRATOR layer too, not just pure machine — critique's #1 test
gap), orchestrator.test.ts (B1-B5 + M1 + offer-collision + concurrency), playwright/helpers/room.ts
(submit/moveOn/waitForCounterQuestion/currentProblemIndex + assert data-assist='counter_question'),
NEW playwright/tests/submit-controls.spec.ts, update mimic-full-e2e + behavior-matrix.

## PHASES (dependency-ordered, acceptance-gated)
0. Contracts+guards (intent, mandatory, codeMaxFollowUps, advanceCoding) — tsc + existing green, no
   behavior change (intent absent == today).
1. FSM mandate + property tests (incl. B3) — mutation `===0`→`<0` must FAIL a property.
2. Orchestrator+HTTP (B1,B2,B4,B5,M1,M4,M5, move_on, audit log, rate-limit) — integration tests incl.
   oracle-429-still-anchors, ternary-submit-fires, type-then-submit-anchors, scoring-not-penalized.
3. Frontend controls+intents+modals+banner+abort+autosave.
4. Timers (server-derived nudge + T-N cap window), a11y (2.1.2/1.3.1/4.1.3), voice guards (M3), mobile.
5. E2E (submit-controls asserts CQ on every submit incl. ternary/type-then-submit/429; behavior-matrix
   run-ladder×submit independence; hidden-test-leak still green), taxonomy+probeHints+telemetry.
6. DEFERRED/flagged: difficulty routing from oral signal; proactive idle nudges (already OFF).

## WIREFRAME STATUS (answer to "is it comprehensive + production-tested?")
NO. The wireframe is a chat-rendered design mock: never built, never rendered in the real room, never
E2E-driven, zero executed tests. This spec + its tests are what make it real. Unproven until Phases
0–5 land with green CI (unit + property-at-orchestrator + E2E asserting a code-anchored CQ on every
submit path incl. the B1/B4/B5 failure modes).
