# The Attentive Interviewer — Real-Time Adaptive Intervention Design

**Status: BUILD AUTHORIZED (Amit, 2026-07-22) — cost-unbound ($1–3/interview acceptable), indistinguishability is the bar. FSM + reliability stay non-negotiable.**
**Vision (owner):** "The interviewer should know when to provide hints, probe, ask counter-questions, or support the candidate *while the candidate is writing code* — not anchor on submission. Real humans adapt in real time. Lean, indistinguishable from a human, eradicates the need for human interviewers."

---

## 0. Grounding

Three research streams (expert-interviewer practice: interviewing.io/Karat/Google guides; industry state-of-art: Mercor Monty, CodeSignal, Copilot/Cursor triggering stacks; learning science: contingent scaffolding, the assistance dilemma, wheel-spinning, productive failure) converge on six principles:

1. **Silence is the default action.** Great interviewers gate speech on the candidate's *trajectory*, not elapsed time. An unhelpful interruption costs more than a missed opportunity (asymmetric utility). The single most-hated behavior: pointing out a mistake the instant it's typed.
2. **Distinguish productive struggle from degradation.** Productive = novel edits, varied attempts, forward motion → leave alone (this is where hiring signal comes from). Degrading = near-identical failing runs, deletion bursts, long stalls after failures → intervene at the confusion-to-frustration boundary.
3. **Deliver only at natural seams.** After a run, after typing quiesces, after the candidate speaks — never mid-typing, never mid-thought. Queue observations; flush at boundaries. (Codellaborator: mid-implementation interjections caused 32.7% of all disruptions; time-based triggers are the weakest class, semantic-boundary triggers the strongest.)
4. **Contingent ladder, one rung at a time.** Pump → orienting question → targeted hint → partial reveal. Escalate one level on failure, fade one level on success. Never jump from silence to telling. First touch on a stall is a *declinable offer* ("Want a nudge, or are you good?") — consent preserves agency. Exception: candidate ~90% done and blocked on a triviality → just give it (struggling on a one-liner destroys signal).
5. **Validate before probing.** "Your hash-map idea is right — the issue is only in the window update." A rattled candidate produces no signal. Tone: collaborative peer.
6. **The cheap tier decides IF; the LLM only words.** Copilot gates its model behind an 11-feature client-side logistic regression; ITS research says data-driven need predictors beat timers. A periodic LLM tick / LLM-as-event-filter is a documented anti-pattern.

**Industry white space (mid-2026): no shipped AI interviewer adapts to the code stream between runs.** Everyone reacts to speech turns, runs, and submits. This design is the differentiator — and our current event-driven architecture is already at the frontier, so this is an extension, not a rebuild.

**The key enabling fact:** the `/snapshot` autosave (shipped 2026-07-20) already delivers the candidate's code to the server every ~3s of active typing. Today it is a *silent* signal — nothing reads it as activity. This design makes it speak.

---

## 1. Architecture (one new concept, zero new write paths)

```
signals (existing)                    NEW: engagement engine                delivery (existing, unchanged)
──────────────────                    ─────────────────────                 ──────────────────────────────
/snapshot writes  ──┐                 ┌──────────────────────┐
/run results      ──┤   deterministic │ feature extractor    │   state +    Path A (run ladder)    ──► code-run channel
/nudge reports    ──┼──►              │ ring buffer (memory) │──► rung ──►  Path B (idle nudge)    ──► code-run channel
transcript turns  ──┤                 │ engagement classifier│              Path C (quiescence)NEW ──► code-run channel
timers            ──┘                 └──────────────────────┘              mandatory submit CQ     ──► answer path (untouched)
                                       100% deterministic, unit-testable    LLM words the decided kind (existing oracle seam)
```

### 1.1 Feature extractor + ring buffer (`backend/src/interview/engagement.ts`, new)
On every `/snapshot` write and `/run`, compute vs the previous snapshot (kept in an in-memory per-interview ring buffer — single-process, like `lock.ts`; capped ~200 entries of ~10 numbers each; rebuilt lazily after restart, cold state degrades to today's behavior):

- `bytesAdded / bytesDeleted / linesTouched` per window
- `deletionBurst` (deleted > 30% of buffer in one window = approach abandonment)
- `churn` (repeated edits to the same region without net growth)
- `runDiffNovelty` (edit distance between consecutive run sources — near-identical failing runs = wheel-spinning; the run source is captured from the snapshot column at run time)
- `quiescentSinceMs` (last snapshot write), `lastSpeechMs`, `timeOnProblemMs`

No keystrokes, no new tables, no code history stored — features only. (The `code_runs` rows never stored source; the ring buffer closes that gap in memory without a migration.)

### 1.2 Engagement classifier (pure function, same file)
`classifyEngagement(features, runLog, transcriptTail) → state`:

| State | Signature | Interviewer stance |
|---|---|---|
| `FLOWING` | net code growth, varied edits | **silent** |
| `THINKING` | quiet but recent progress, or early planning window (blank-editor floor stays) | **silent** |
| `STRUGGLING_PRODUCTIVE` | attempts varied between runs, edits novel | **silent** (this is the signal-rich zone) |
| `DEGRADING` | ≥2 near-identical failing runs, or deletion burst + stall ≥90s, or stall ≥3–4 min post-failure | offer → ladder |
| `WHEEL_SPINNING` | rapid runs (≥4 in 5 min) with trivial diffs | accountability probe, **not** a hint |
| `NEARLY_DONE` | high hidden-pass rate + small failing surface | direct fix allowed (rung jump, logged) |

Every classification is loggable and explainable: *"intervened because DEGRADING: 3 near-identical failing runs over 4m10s."* Enterprise-defensible by construction.

### 1.3 Decision layer v2 (extends `intervention.ts` — Paths A/B re-grounded, Path C added)
- **Path A (run-triggered)** keeps its trigger but consults the engagement state: a failing run during `STRUGGLING_PRODUCTIVE` stays quiet longer than during `DEGRADING`. The existing derived budget becomes a **per-problem contingent ladder pointer** (rung persisted by derivation from the run/event log, as today — never a stored counter).
- **Path B (idle)** is re-scoped: idle-with-no-context remains a rung-0 check-in, but idle is demoted from primary trigger to tie-breaker (research: idle time is the *weakest* proactivity signal).
- **Path C (quiescence boundary — NEW):** when typing quiesces ≥45s AND state is `DEGRADING`/`WHEEL_SPINNING` AND ladder budget allows AND no run in flight AND candidate not speaking → emit the rung-appropriate intervention, starting with the consent-first `offer`. Client-triggered through the **existing `/nudge` endpoint** with a generalized `reason: 'idle' | 'quiescent'` field — the server recomputes state from its own record (client reports are hints, never authority).
- **Mandatory submit counter-question: untouched.** It remains the anti-cheat moat. Adaptivity is additive.
- **New intervention kind: `encourage`** — the validate-what's-right supportive move ("the two-pointer idea is right — keep going"), fired sparingly on recovery moments (first pass after failures, big forward step after a stall). Excluded from the scorer's assist penalty like `offer`. All other kinds reused as-is.
- **Skill modulation:** a running 3-bucket estimate (oral follow-up depth, run pass trajectory, hint uptake) scales ladder aggressiveness — `support` buckets get earlier/concreter help, `stretch` buckets get silence and ambiguity. Same policy table, three parameter rows.

### 1.4 Delivery + visible agency
- All Path C interventions ride the **existing code-run channel** (synthetic rows, like idle nudges) — race-free by the same invariant; every consumer already filters synthetic rows.
- **Presence cue (frontend):** ~1.5s before an intervention bubble lands, the chat pane shows the subtle "interviewer is reading your code…" indicator. Research: invisible attention → sudden speech reads robotic; ambient-cue-then-speech reads human. Also honest signaling: the candidate knows the interviewer watches.
- Voice: intervention cue text flows through the existing `/speak-stream` cue path; voice gate (candidate not speaking) already enforced by the room.

### 1.5 Scorecard integration
The engagement timeline becomes scorecard evidence: *"stalled at the window-update edge case 4m; declined first offer; recovered independently after one orienting question."* This narrative is the enterprise trust artifact — the reason a hiring manager believes the no-human claim.

---

## 2. Cost & latency — REVISED under the cost-unbound mandate

The deterministic core stays (it's the reliability + auditability spine, and research says LLM-as-trigger is an anti-pattern regardless of budget). The freed budget goes where LLM spend buys *humanness*, never where it decides:

1. **Observer notes (context ledger).** On each semantic boundary that already exists (run completed, intervention fired, submit), one LLM call produces a 2–3 sentence "interviewer's inner note": what the candidate is attempting, what changed since last note, what's promising/broken — from the code diff + run result. Stored in the ring buffer, never shown to the candidate. Wording calls then receive the note history, so an intervention says "you switched from the dict approach to two pointers — what did that buy you?" instead of generic phrasing. This is the single biggest indistinguishability lever: humans remember the journey, and now so do we. (~10–20 calls × ~800 tokens/interview.)
2. **Wording quality upgrade.** Intervention wording (probe/offer/hint/encourage/CQ) moves from reasoning-effort-low to a quality-first chain (env: `INTERVENTION_WORDING_EFFORT=high`), with the observer-note history in context. Deterministic canned fallback stays.
3. **Voice humanness (separate track, same mandate):** Grok TTS `sirius` + `speed≈0.9` + conversational utterance style, inherited across Grok's 20+ languages when we localize. Interviewer utterance prompts adopt the conversational register (interjections, ellipses) that measured identical to the VAPI-Elliot prosody profile.

Realistic total: ~$0.05–0.15/interview LLM + ~$0.08 TTS at Grok prices — far inside the $1–3 envelope, with headroom reserved for future per-turn quality escalation rather than spent speculatively.
- Memory: ring buffer ≈ 10–25KB per active interview (notes included); trivial at 50 concurrent.
- No new rate-limit surface: `/nudge` backstop (8/10min) already caps Path C triggers; observer notes are bounded by run/intervention counts.

## 3. Build phases (each independently shippable + testable)

- **P1 — Shadow mode:** feature extractor + classifier + `engagement` events logged only (no behavior change). Playwright matrix rows replayed to validate state labels against known scenarios; tune thresholds on real prod interviews.
- **P2 — Path C live behind `ENGAGEMENT_INTERVENTIONS` env flag:** consent-first offer + `encourage`, client detector generalization (`reason` field), presence cue. Behavior-matrix rows for: DEGRADING→offer, decline honored, WHEEL_SPINNING→accountability probe, FLOWING→silence.
- **P3 — Ladder unification:** Paths A/B/C share the contingent ladder pointer + skill modulation + NEARLY_DONE exception.
- **P4 — Telemetry feedback:** per-intervention uptake logging (did the candidate act on it?) feeds threshold tuning — the assistance-dilemma control loop.

## 4. Invariants (unchanged, enforced by tests)
FSM stays the only state-owner · LLM never decides IF/WHICH, only words · transcript/fsm_state written solely by the answer path · synthetic rows filtered everywhere (existing foot-gun, now with a shared helper) · mandatory submit CQ untouched · all budgets derived, never stored counters · deterministic wording fallback on every LLM call · no test/solution content in any intervention (existing leak guards apply).

## 5. Known risks (for the adversarial pass)
Restart cold-state (ring buffer lost mid-interview); client `reason` reports as a gaming vector (server-side recomputation is the mitigation to verify); over-fire on slow thinkers who type in bursts (threshold tuning, P1 shadow data); fairness — different candidates receive different help levels (mitigation: ladder position is derived from behavior + logged + scorer-visible; this mirrors human interviewing but needs a defensible write-up); voice/text mode asymmetry.

---

## 6. CRITIQUE AMENDMENTS (v2 — BINDING; 3-lens adversarial panel 2026-07-22, 7 fatals + 15 majors confirmed)

These amendments override §1–§3 wherever they conflict. Build from §6.

### 6.1 Snapshot contract (fatal — the §0 premise was false: the client is a TRAILING debounce, it goes silent while typing continues)
- Client: leading-edge throttle — snapshot every ~3s WHILE typing, plus the trailing flush. Allow empty-code snapshots (drop the trim guard, keep size guard). Send a **monotonic client `seq`** + let the server tag entries with `ctx.codeIndex` at ingest; hard-reset the feature stream on codeIndex change. Server rejects stale `seq` (also fixes the pre-existing snapshot-vs-run clobber).
- `/snapshot` rate limit 30→60/min; a 429-dropped window counts as *unknown activity*, never as quiescence.

### 6.2 Unified intervention timeline (fatal — synthetic-row offers are invisible to the ladder)
- Two DISTINCT filters replace the scattered `status !== 'Idle'` checks: `isSyntheticRow()` (excluded from run-failure signals) and `ladderInterventions()` (interventions on ANY row, counted by every budget). `deriveRunAssistBudget` counts Path C interventions; Paths A/B/C share one ladder + one cross-path cooldown (~2–3 min, jittered).
- Path C **offers** get first-class state (the existing `hintOffer` pattern in fsm_state, written under `withInterviewLock`) so `maybeResolveHintOffer` honors a "yes please" to a Path C offer.
- Nudge/Path C commit is **recheck-then-commit under the lock** (word outside; re-derive gates + append inside; drop if stale) — same shape as finishAndScore.

### 6.3 Run-in-flight registry (fatal — quiescence crosses threshold while a run executes)
In-memory per-interview registry (same single-process pattern as lock.ts) set/cleared by recordRun and submitAnswer. Path C never fires while set; a run *submission* resets quiescence. Client-side delivery gate too: if a keystroke/run/speech happened after the /nudge request was sent, the room silently drops the returned intervention (server budget recheck makes the drop safe).

### 6.4 Observer notes are strictly off-path (fatal — an awaited note under the lock wedges the interview)
- **Invariant: no awaited LLM call ever runs under withInterviewLock or inside a candidate-blocking response.** Notes fire-and-forget after appendCodeRun (the `void finishAndScore` pattern), 5s abort timeout, droppable; sequence-tagged into slots; wording consumes only the contiguous prefix (no reordered narratives).
- Run-path intervention wording moves OUT of the /run response: /run returns results immediately; the intervention is delivered out-of-band (Path C channel) with the presence cue covering the wording latency. This also removes the wording call from the run path entirely.
- `reasoningEffort` becomes per-call in `CompleteOptions`; `high` only on async note calls, never on latency-critical wording.
- Notes are typed `{approach, transition, diagnosis}`; rungs 0–1 wording receives only approach/transition; `diagnosis` unlocks at rung 2+. No-solution/no-test-content guards apply to note GENERATION input too.
- Diff features: line-hash diff (O(lines)), content capped at 16KB, computed off the response path.

### 6.5 Evidence rules (fatal — snapshot-only escalation is spoofable; also fixes slow-thinker false positives)
- **No rung above the content-free rung-0 check-in without server-EXECUTED evidence** (failing runs / stagnant failure signatures). Snapshot features may DELAY or SOFTEN interventions, never escalate them.
- DEGRADING-by-stall requires negative snapshot evidence (churn/deletion burst), never elapsed time alone; quiescence floor stays ≥90s.
- `encourage` that asserts correctness fires only on server-verified progress (first pass after ≥2 failures, or increased hidden-pass count); snapshot-triggered encourage is content-free morale only, budget 1/question, and is EXCLUDED from the scorer penalty by an explicit kind allowlist: penalize {probe, hint, non-mandatory counter_question}; advisory-only {offer, nudge, encourage}.
- WHEEL_SPINNING requires the failure signature UNCHANGED across rapid runs AND diffs that aren't just logging/print statements (printf-debugging is legitimate).

### 6.6 Persistence + audit (majors — memory-only contradicted the scorecard promise)
Every engagement-state transition and observer note is persisted as an `interview_events` row via the existing appendEvent (no migration). Ring buffer stays the hot cache; scoring/rescoring/restart read from events. Buffer evicts on terminal transition + TTL sweep (lock.ts discipline).

### 6.7 Indistinguishability hardening (majors)
- All timing thresholds get **per-interview seeded jitter bands** (e.g. quiescence 40–75s), seed logged for replayability.
- Presence cue is ambient + stochastic: also fires 1–3×/problem during silent FLOWING periods; pre-speech lead jittered 0.8–3s. Never a perfect predictor.
- Engagement-channel suppression (no snapshots while runs show big deltas; /nudge never polled) → advisory integrity flag on the scorecard, mirroring proctor signals.
- Skill modulation ships OFF behind a per-org flag; enabling gated on P1 shadow data showing bucket assignment uncorrelated with typing cadence (fairness defensibility first).

### 6.8 Launch preconditions
Paid Groq tier (TPM headroom for notes at concurrency) — hard dependency, not a footnote. Note calls capped (last 5 notes + capped diff in; notes them­selves ≤400 tokens out).
