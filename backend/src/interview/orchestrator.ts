// Orchestrator — ties the FSM, oracle, repo, and scoring together.
// Each public function is a complete, transactional step; it persists events and
// updated state before returning. The FSM is the single source of truth for
// control flow; the LLM oracle fills utterance slots only.

import { advance, initialContext } from './machine';
import { withInterviewLock } from './lock';
import { DeterministicOracle, Oracle, TranscriptTurn, UtteranceRequest, Utterance } from './oracle';
import {
  InterviewContext,
  Effect,
  InterventionKind,
  CodingProblem,
  TestResults,
  SubmitIntent,
} from './types';
import { deriveRunSignals, idleNudgesGiven } from './signals';
import {
  decideRunIntervention,
  deriveRunAssistBudget,
  classifyOfferResponse,
  decideIdleIntervention,
} from './intervention';
import { selectProblems, getProblemBySlug, toPublicProblem, PublicProblem } from './problems';
import {
  createMinimaxClient,
  MinimaxClient,
  MinimaxOracle,
  minimaxConfigFromEnv,
  groqChainConfigs,
  cerebrasConfig,
  createFailoverClient,
} from './minimax';
import { generateToken, hashToken } from './token';
import {
  createInterview as dbCreateInterview,
  getById,
  updateInterview,
  deleteInterview as dbDeleteInterview,
  deleteInterviewsOlderThan,
  appendEvent,
  appendCodeRun,
  appendCodeRunOnly,
  claimForScoring,
  claimBegin,
  claimExpire,
  findStaleInvited,
  findInProgressPastDuration,
  findStuckCompleted,
  claimCompletedForRescore,
  insertOutbox,
  makeOutboxStore,
  getProctorSignalsForInterview,
  Interview,
  InterviewStatus,
} from '../db/interviews';
import { createDockerKernel } from '../execution/docker';
import { RunRequest, RunResult } from '../execution/types';
import { withCostContext } from '../cost/context';
import { recordExecCost, rollupInterview } from '../cost/ledger';
import { scoreInterview, CodeRunSummary } from '../scoring/scorer';
import { Scorecard } from '../scoring/types';
import { drainOutbox } from '../notify/outbox';
import { createEmailSender } from '../notify/resend';

// ─────────────────────── Oracle factory ───────────────────────

export function getOracle(): Oracle {
  // Real-time conversational turns want the FASTEST good model. Prefer Groq (GPT-OSS on the LPU,
  // ~0.5s TTFT) when configured; else the MiniMax fast model; else the deterministic stub. The final
  // scorecard grading stays on MiniMax (getScoringClient) — split-brain: fast turns, deep scoring.
  //
  // Failover chain (Groq rate-limits are PER-MODEL): primary gpt-oss-120b → a DIFFERENT Groq model
  // (qwen3-32b, its own bucket) → MiniMax fast (different provider) → the caller's DeterministicOracle
  // catch. So a per-model 429 under load degrades to another real model, not to canned lines — the
  // autonomous-interviewer USP (clarify / hint / counter-question) stays crisp.
  if (process.env.GROQ_API_KEY) {
    // Ordered chain: gpt-oss-120b (Groq primary) → [Cerebras gpt-oss-120b, if CEREBRAS_API_KEY] →
    // qwen3-32b → qwen3.6-27b → llama-3.3-70b → llama-4-scout (each a separate Groq bucket) →
    // MiniMax (different provider) → the caller's DeterministicOracle catch. Cerebras sits FIRST in
    // the fallbacks: same top-tier model, different provider, ~2x faster — so a Groq 429 degrades to
    // the best available model, not a lesser one. GROQ_FALLBACK_CHAIN_JSON overrides the Groq list.
    const groq = groqChainConfigs().map((cfg, i) => ({
      name: i === 0 ? 'groq:primary' : `groq:${cfg.model}`,
      client: createMinimaxClient(cfg),
    }));
    const chain = [groq[0]];
    if (process.env.CEREBRAS_API_KEY) {
      chain.push({ name: 'cerebras:gpt-oss-120b', client: createMinimaxClient(cerebrasConfig()) });
    }
    chain.push(...groq.slice(1));
    if (process.env.MINIMAX_API_KEY) {
      chain.push({
        name: 'minimax',
        client: createMinimaxClient(minimaxConfigFromEnv({ fast: true })),
      });
    }
    return new MinimaxOracle(createFailoverClient(chain));
  }
  if (process.env.MINIMAX_API_KEY) {
    return new MinimaxOracle(createMinimaxClient(minimaxConfigFromEnv({ fast: true })));
  }
  return new DeterministicOracle();
}

// ─────────────────────── Execution kernel factory (Docker-per-run) ───────────────────────

function getExecutionKernel() {
  return createDockerKernel();
}

// ─────────────────────── Scoring client factory ───────────────────────

/**
 * Failover grader client for finishAndScore. Mirrors the oracle's provider chain so a single
 * 429 or transient outage doesn't permanently produce a fallback scorecard. Chain: MiniMax
 * (reasoning model, preferred for deep grading) → Groq models (if configured, as backups).
 * When nothing is configured, returns a stub that forces scorer.ts' safe fallbackScorecard path.
 * The SCORING maxTokens caps (2048/4096 in scorer.ts) are applied per-call by scoreInterview,
 * not here — they pass through the client's complete() opts unchanged.
 */
function getScoringClient(): MinimaxClient {
  const entries: { name: string; client: MinimaxClient }[] = [];

  if (process.env.MINIMAX_API_KEY) {
    entries.push({ name: 'minimax', client: createMinimaxClient(minimaxConfigFromEnv()) });
  }

  if (process.env.GROQ_API_KEY) {
    const groqConfigs = groqChainConfigs();
    for (let i = 0; i < groqConfigs.length; i++) {
      entries.push({
        name: i === 0 ? 'groq:primary' : `groq:${groqConfigs[i].model}`,
        client: createMinimaxClient(groqConfigs[i]),
      });
    }
  }

  if (entries.length === 0) {
    return {
      complete: async (): Promise<string> => {
        throw new Error('No LLM configured for scoring');
      },
    } as MinimaxClient;
  }

  return createFailoverClient(entries);
}

// ─────────────────────── Token TTL ───────────────────────

const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS ?? 72);
const TNC_VERSION = 'v1';

function tokenExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + TOKEN_TTL_HOURS);
  return d;
}

// Wall-clock length of an interview once it starts (separate from the 72h invite TTL). At this
// limit the room hard-stops + concludes; the sweep concludes an absent candidate. Env-tunable.
// Dev/testing interviews use a short duration so the time-up flow can be exercised in seconds.
const INTERVIEW_DURATION_MIN = Number(process.env.INTERVIEW_DURATION_MIN ?? 60);
const INTERVIEW_DURATION_MS = INTERVIEW_DURATION_MIN * 60_000;
const DEV_INTERVIEW_DURATION_MIN = Number(process.env.DEV_INTERVIEW_DURATION_MIN ?? 2);

/** This interview's length in ms — short for dev-mode (testing), full otherwise. */
function interviewDurationMs(interview: Interview): number {
  const min = interview.dev_mode ? DEV_INTERVIEW_DURATION_MIN : INTERVIEW_DURATION_MIN;
  return min * 60_000;
}

/** Whether an interview has run past its duration cap (measured from tnc_accepted_at = begin). */
function durationExceeded(interview: Interview): boolean {
  if (!interview.tnc_accepted_at) return false;
  return (
    Date.now() - new Date(interview.tnc_accepted_at).getTime() >= interviewDurationMs(interview)
  );
}

// ─────────────────────── Helpers ───────────────────────

function requireInterview(interview: Interview | null, id: string): Interview {
  if (!interview) throw Object.assign(new Error(`Interview ${id} not found`), { status: 404 });
  return interview;
}

async function persistTransition(
  interview: Interview,
  newCtx: InterviewContext,
  effect: Effect,
  utterance: Utterance | null,
  candidateAnswer?: string,
  requestId?: string,
  /** Tags the interviewer turn as an autonomous intervention (USP) so the scorer + room see it. */
  assist?: { kind: InterventionKind; strength: number; mandatory?: boolean },
  /** B1: the exact editor code carried by a SUBMIT. Persisted atomically with the transition so the
   *  mandatory counter-question anchors on the SUBMITTED code, not a stale /run snapshot. */
  codeSnapshot?: string
): Promise<void> {
  const transcript: TranscriptTurn[] = interview.transcript ?? [];

  if (candidateAnswer !== undefined) {
    transcript.push({ role: 'candidate', text: candidateAnswer });
  }

  if (utterance && utterance.text) {
    transcript.push({ role: 'interviewer', text: utterance.text, ...(assist ? { assist } : {}) });
  }

  await updateInterview(interview.id, {
    fsm_state: newCtx,
    phase: newCtx.phase,
    transcript,
    ...(codeSnapshot !== undefined ? { code_snapshot: codeSnapshot } : {}),
    ...(requestId ? { last_request_id: requestId } : {}),
  });

  await appendEvent(interview.id, 'transition', {
    from: interview.phase,
    to: newCtx.phase,
    effect: effect.kind,
  });

  if (utterance && utterance.text) {
    await appendEvent(interview.id, 'utterance', {
      text: utterance.text,
      expects: utterance.expects,
      ...(assist ? { intervention: true, kind: assist.kind, strength: assist.strength } : {}),
    });
  }
}

// Max clarifying questions answered on one question before the next utterance is treated as a real
// answer (advances) — bounds abuse and guarantees the interview always progresses.
const CLARIFY_CAP = 3;

// B2: reserve window before the hard cap for a SUBMIT's mandatory counter-question + its answer, so
// "every submit earns a counter-question" holds at the time boundary. Scaled down (×0.15) for short
// dev interviews so a 2-minute dev run can still submit.
const SUBMIT_RESERVE_MS = 90_000;

// Cheap pre-filter so the clarify LLM call only runs on utterances that plausibly ARE questions —
// the vast majority of answers (no "?", no leading question word) skip it and pay zero extra cost.
function looksLikeQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return (
    t.includes('?') ||
    /^(who|what|when|where|why|how|can|could|should|is|are|am|do|does|did|will|would|may|might|which|if)\b/i.test(
      t
    ) ||
    /\b(clarif|assume|assumption|confirm|do you mean|should i|can i|am i allowed)\b/i.test(t)
  );
}

/** Persist a clarifying-question turn: append the candidate's question + the interviewer's reply to
 *  the transcript, but keep the FSM state UNCHANGED (only clarifyCount bumps). No transition event —
 *  the reply is logged as an utterance tagged clarify:true. Retry-safe via last_request_id. */
async function persistClarify(
  interview: Interview,
  newCtx: InterviewContext,
  candidateQuestion: string,
  reply: Utterance,
  requestId?: string
): Promise<void> {
  const transcript: TranscriptTurn[] = interview.transcript ?? [];
  transcript.push({ role: 'candidate', text: candidateQuestion });
  transcript.push({ role: 'interviewer', text: reply.text });
  await updateInterview(interview.id, {
    fsm_state: newCtx, // phase unchanged; only clarifyCount differs
    phase: newCtx.phase,
    transcript,
    ...(requestId ? { last_request_id: requestId } : {}),
  });
  await appendEvent(interview.id, 'utterance', {
    text: reply.text,
    expects: reply.expects,
    clarify: true,
    question: candidateQuestion.slice(0, 500),
  });
}

/** If the candidate's utterance is a clarifying QUESTION, answer it (grounded, no spoilers) without
 *  advancing the FSM, and return the AnswerResult. Returns null when it's a real answer (or the cap
 *  is hit, or the classifier fails) so the caller falls through to the normal advancing path. */
async function maybeAnswerClarification(
  interview: Interview,
  ctx: InterviewContext,
  text: string,
  oracle: Oracle,
  requestId?: string
): Promise<AnswerResult | null> {
  if ((ctx.clarifyCount ?? 0) >= CLARIFY_CAP) return null; // bounded → treat as an answer
  if (!looksLikeQuestion(text)) return null; // cheap gate: obvious answers skip the LLM classify
  const problem = ctx.phase === 'coding' ? assignedProblem(interview, ctx.codeIndex) : null;
  const clarifyReq = {
    text,
    ctx,
    transcript: interview.transcript ?? [],
    problemStatement: problem?.statement ?? null,
    level: interview.level,
    roleBrief: interview.role_brief,
  };
  let result;
  try {
    result = await withCostContext(
      { interviewId: interview.id, kind: 'brain', phase: ctx.phase },
      () => oracle.classifyAndAnswer(clarifyReq)
    );
  } catch (err) {
    console.error(`[orchestrator] clarify classification failed for ${interview.id}:`, err);
    try {
      result = await new DeterministicOracle().classifyAndAnswer(clarifyReq);
    } catch {
      return null; // never block the interview on a classifier failure
    }
  }
  if (result.intent !== 'question' || !result.reply?.text) return null; // real answer → normal path
  const newCtx: InterviewContext = { ...ctx, clarifyCount: (ctx.clarifyCount ?? 0) + 1 };
  await persistClarify(interview, newCtx, text, result.reply, requestId);
  return { utterance: result.reply, phase: ctx.phase, state: newCtx };
}

/** Persist a non-advancing deep-hint offer resolution (accept → hint, decline → ack): append the
 *  candidate's reply + the interviewer turn, keep the phase unchanged (only hintOffer differs),
 *  retry-safe. `assist` tags a delivered hint so the scorer discounts the hinted solve. */
async function persistOfferResolution(
  interview: Interview,
  newCtx: InterviewContext,
  candidateAnswer: string,
  utterance: Utterance,
  assist: { kind: InterventionKind; strength: number } | undefined,
  requestId?: string
): Promise<void> {
  const transcript: TranscriptTurn[] = interview.transcript ?? [];
  transcript.push({ role: 'candidate', text: candidateAnswer });
  transcript.push({ role: 'interviewer', text: utterance.text, ...(assist ? { assist } : {}) });
  await updateInterview(interview.id, {
    fsm_state: newCtx,
    phase: newCtx.phase,
    transcript,
    ...(requestId ? { last_request_id: requestId } : {}),
  });
  await appendEvent(interview.id, 'utterance', {
    text: utterance.text,
    expects: utterance.expects,
    ...(assist
      ? { intervention: true, kind: assist.kind, strength: assist.strength }
      : { offer_ack: true }),
  });
}

/** If a deep-hint OFFER is pending for the current coding question, resolve the candidate's reply:
 *  accept → deliver the deep hint; decline → warm ack (no hint, no penalty). Either returns WITHOUT
 *  advancing the FSM. 'other' (a clarifying question / unrelated attempt) → null, so the offer stays
 *  open and the caller processes the utterance normally. The offer state is written ONLY here (the
 *  answer path owns fsm_state) — the run path only reads it, so there's no cross-path write race. */
async function maybeResolveHintOffer(
  interview: Interview,
  ctx: InterviewContext,
  answer: string,
  oracle: Oracle,
  requestId?: string
): Promise<AnswerResult | null> {
  if (ctx.phase !== 'coding') return null;
  if (ctx.hintOffer?.codeIndex === ctx.codeIndex) return null; // already resolved for this question
  // REAL runs only: a synthetic Idle marker (Path B check-in) appended after the offer must not
  // hide it — the offer lives on the last real run, and Idle rows must never reach the hint prompt
  // or count as failures.
  const runs = (interview.code_runs ?? []).filter(
    (r) => r.codeIndex === ctx.codeIndex && r.status !== 'Idle'
  );
  const latest = runs[runs.length - 1];
  if (latest?.intervention?.kind !== 'offer') return null; // no pending offer
  const resp = classifyOfferResponse(answer);
  if (resp === 'other') return null; // ignore → process normally; the offer stays open

  if (resp === 'decline') {
    const ack: Utterance = {
      text: "No problem — take your time. I'm here if you'd like a pointer later.",
      expects: 'code',
    };
    const newCtx: InterviewContext = {
      ...ctx,
      hintOffer: { codeIndex: ctx.codeIndex, status: 'declined' },
    };
    await persistOfferResolution(interview, newCtx, answer, ack, undefined, requestId);
    return { utterance: ack, phase: ctx.phase, state: newCtx };
  }

  // accept → deliver the deep hint (grounded, still no spoiler)
  const problem = assignedProblem(interview, ctx.codeIndex);
  const recentRuns = runs.slice(-4).map((r) => ({ status: r.status, stderr: r.stderr }));
  const tr = latest.testResults;
  const testSummary = tr
    ? tr.passed === tr.total
      ? `ran clean and passed all ${tr.total} hidden tests`
      : `passed ${tr.passed}/${tr.total} hidden tests${tr.incomplete ? ' (stopped early on an error/timeout)' : ' — wrong output on some cases'}`
    : null;
  const req = {
    kind: 'hint' as const,
    ctx,
    transcript: interview.transcript ?? [],
    code: interview.code_snapshot,
    recentRuns,
    level: interview.level,
    roleBrief: interview.role_brief,
    problemStatement: problem?.statement ?? null,
    testSummary,
    strength: 2,
    consecutiveFailures: recentRuns.filter((r) => r.status !== 'Accepted').length,
  };
  let hint: Utterance;
  try {
    hint = await withCostContext(
      { interviewId: interview.id, kind: 'brain', phase: 'coding' },
      () => oracle.generateIntervention(req)
    );
  } catch (err) {
    console.error(`[orchestrator] offer-hint generation failed for ${interview.id}:`, err);
    hint = await new DeterministicOracle().generateIntervention(req);
  }
  const newCtx: InterviewContext = {
    ...ctx,
    hintOffer: { codeIndex: ctx.codeIndex, status: 'hinted' },
  };
  await persistOfferResolution(
    interview,
    newCtx,
    answer,
    hint,
    { kind: 'hint', strength: 2 },
    requestId
  );
  return {
    utterance: hint,
    phase: ctx.phase,
    state: newCtx,
    assist: { kind: 'hint', strength: 2 },
  };
}

// ─────────────────────── Public orchestrator functions ───────────────────────

export interface CreateInterviewResult {
  id: string;
  token: string;
  expiresAt: Date;
}

export async function createInterview(input: {
  interviewerId: string;
  candidateEmail: string;
  candidateName?: string;
  /** Interviewer's chosen room language; omit/null for "candidate chooses". */
  assignedLanguage?: string | null;
  /** Interviewer-chosen seniority level; defaults to 'mid'. */
  level?: string;
  /** Free-text role/JD context; tailors questions + grading. */
  roleBrief?: string | null;
  /** Dev/testing interview (the caller must already have verified the creator is a dev). */
  devMode?: boolean;
}): Promise<CreateInterviewResult> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = tokenExpiry();
  const fsmState = initialContext();

  // Assign the coding problems NOW (deterministic selection by level; no LLM), so every candidate
  // on a given problem gets the identical, gradeable question. One per core coding question.
  const codingProblemIds = selectProblems(input.level, fsmState.config.coreQuestions).map(
    (p) => p.slug
  );

  const interview = await dbCreateInterview({
    interviewerId: input.interviewerId,
    candidateEmail: input.candidateEmail,
    candidateName: input.candidateName,
    accessTokenHash: tokenHash,
    tokenExpiresAt: expiresAt,
    fsmState,
    assignedLanguage: input.assignedLanguage ?? null,
    level: input.level,
    roleBrief: input.roleBrief ?? null,
    devMode: input.devMode ?? false,
    codingProblemIds,
  });

  return { id: interview.id, token: rawToken, expiresAt };
}

export interface BeginResult {
  utterance: Utterance;
  phase: string;
  state: InterviewContext;
  /** Fresh session token issued at begin — the invite-link token is now dead. */
  sessionToken: string;
  /** Server-recorded interview start (tnc_accepted_at). The client seeds its timer from
   *  this so elapsed time is correct across reloads. */
  startedAt: string;
  /** Interviewer's chosen room language (null = candidate chooses). When set, the room
   *  locks the editor to it. */
  assignedLanguage: string | null;
  /** Total interview length in seconds — the room counts up and hard-stops at this. */
  durationSeconds: number;
  /** Dev/testing interview — the room allows paste (otherwise paste is blocked). */
  devMode: boolean;
}

export async function begin(
  interviewId: string,
  opts: { tncAccepted: boolean }
): Promise<BeginResult> {
  if (!opts.tncAccepted) {
    throw Object.assign(new Error('T&C must be accepted to begin'), { status: 400 });
  }

  const interview = requireInterview(await getById(interviewId), interviewId);

  const ctx = interview.fsm_state as InterviewContext;
  const { ctx: newCtx, effect } = advance(ctx, { type: 'start' });

  const oracle = getOracle();
  const req: UtteranceRequest = {
    effect,
    ctx: newCtx,
    transcript: interview.transcript ?? [],
    level: interview.level,
    roleBrief: interview.role_brief,
  };
  // Greeting must never hard-fail: a fast-oracle hiccup (e.g. Groq 429 under load) at the
  // coldest token path would 500 /begin and block the candidate from ever starting. Fall back
  // to the deterministic greeting — same pattern as submitAnswer.
  let utterance: Utterance;
  try {
    utterance = await withCostContext({ interviewId, kind: 'brain', phase: newCtx.phase }, () =>
      oracle.generateUtterance(req)
    );
  } catch (err) {
    console.error(`[orchestrator] greeting generation failed for ${interviewId}:`, err);
    utterance = await new DeterministicOracle().generateUtterance(req);
  }

  // Rotate the access token: the invite-link token is consumed here and replaced by a
  // fresh session token bound to the candidate's browser. A forwarded invite link can no
  // longer act on the interview once it has begun.
  const sessionToken = generateToken();

  // The interview's authoritative start time. Recorded once here and echoed back so the
  // client can anchor its elapsed timer (survives reloads).
  const startedAt = new Date().toISOString();

  // CAS: atomically flip status invited → in_progress AND write the rotated session token +
  // T&C timestamp in one WHERE status='invited' UPDATE. Only the first concurrent /begin
  // caller wins; the loser gets false → 409, closing the session-theft window where a
  // forwarded invite link could race a legitimate begin and overwrite the session token.
  const claimed = await claimBegin(interviewId, {
    tnc_accepted_at: startedAt,
    tnc_version: TNC_VERSION,
    access_token_hash: hashToken(sessionToken),
    token_expires_at: tokenExpiry().toISOString(),
  });
  if (!claimed) {
    throw Object.assign(new Error('Interview already begun'), { status: 409 });
  }

  await persistTransition(interview, newCtx, effect, utterance);

  return {
    utterance,
    phase: newCtx.phase,
    state: newCtx,
    sessionToken,
    startedAt,
    assignedLanguage: interview.assigned_language,
    durationSeconds: Math.round(interviewDurationMs(interview) / 1000),
    devMode: interview.dev_mode,
  };
}

export interface CandidateState {
  status: string;
  phase: string;
  transcript: TranscriptTurn[];
  codeSnapshot: string;
  /** Interview start (tnc_accepted_at) so the client can re-seed its elapsed timer. */
  startedAt: string | null;
  /** Interviewer's chosen room language (null = candidate chooses → room is unlocked). */
  assignedLanguage: string | null;
  /** Total interview length in seconds — the room counts up and hard-stops at this. */
  durationSeconds: number;
  /** Dev/testing interview — the room allows paste (otherwise paste is blocked). */
  devMode: boolean;
  /** Last editor language, persisted on /run; null if no run yet (client falls back). */
  language: string | null;
  /** Most recent code-run output so the candidate's output panel survives a reload. */
  lastRunResult: RunResult | null;
}

/** Read-only snapshot for the candidate UI to rehydrate after a reload. */
export async function getCandidateState(interviewId: string): Promise<CandidateState> {
  const interview = requireInterview(await getById(interviewId), interviewId);
  const allRuns = interview.code_runs ?? [];
  // Console restore = the last REAL execution (a synthetic Idle marker has no output and would
  // render an empty "Idle" run). But if a trailing Idle check-in exists, graft its intervention
  // onto the restored run so the check-in bubble still survives a reload.
  const runs = allRuns.filter((r) => r.status !== 'Idle');
  const trailing = allRuns[allRuns.length - 1];
  const lastReal = runs.length > 0 ? stripHiddenTests(runs[runs.length - 1]) : null;
  const lastRunResult =
    lastReal && trailing && trailing.status === 'Idle' && trailing.intervention
      ? { ...lastReal, intervention: trailing.intervention }
      : lastReal;
  return {
    status: interview.status,
    phase: interview.phase,
    transcript: interview.transcript ?? [],
    codeSnapshot: interview.code_snapshot ?? '',
    startedAt: interview.tnc_accepted_at,
    assignedLanguage: interview.assigned_language,
    durationSeconds: Math.round(interviewDurationMs(interview) / 1000),
    devMode: interview.dev_mode,
    language: interview.code_language ?? null,
    // Hidden-test correctness already stripped — a reload must not leak what /run withholds.
    lastRunResult,
  };
}

/** Server-authoritative text for TTS (P1 "interviewer speaks"). Reading server-side state — not
 *  client-supplied text — keeps /speak from being a free TTS oracle. `turn` = the latest
 *  interviewer transcript turn (greeting / question / follow-up); `run` = the latest code-run
 *  hint (run-triggered interventions ride on code_runs, not the transcript). Null when nothing
 *  is voiceable yet. */
export async function latestSpeakable(
  interviewId: string,
  source: 'turn' | 'run' = 'turn'
): Promise<string | null> {
  const interview = requireInterview(await getById(interviewId), interviewId);
  if (source === 'run') {
    const last = [...(interview.code_runs ?? [])]
      .reverse()
      .find((r) => r.intervention?.text?.trim());
    return last?.intervention?.text ?? null;
  }
  const last = [...(interview.transcript ?? [])].reverse().find((t) => t.role === 'interviewer');
  return last?.text?.trim() ? last.text : null;
}

function assertOwner(interview: Interview, interviewerId: string): void {
  if (interview.interviewer_id !== interviewerId) {
    throw Object.assign(new Error('You are not authorized for this interview'), { status: 403 });
  }
}

/** Soft-cancel — keeps the row + transcript; the candidate's invite link stops working. */
export async function cancelInterview(interviewId: string, interviewerId: string): Promise<void> {
  const interview = requireInterview(await getById(interviewId), interviewId);
  assertOwner(interview, interviewerId);
  if (interview.status === 'scored') {
    throw Object.assign(new Error('A scored interview cannot be cancelled'), { status: 409 });
  }
  await updateInterview(interviewId, { status: 'cancelled' });
  await appendEvent(interviewId, 'transition', { from: interview.status, to: 'cancelled' });
}

export interface RegenerateInviteResult {
  id: string;
  token: string;
  link: string;
  expiresAt: Date;
}

/**
 * Rotate the invite token for an interview that has NOT yet started.
 * Only the owning interviewer may call this, and only while the interview is
 * still in 'invited' status. Returns a fresh link; the previous token is
 * immediately invalidated.
 */
export async function regenerateInvite(
  interviewId: string,
  interviewerId: string
): Promise<RegenerateInviteResult> {
  const interview = requireInterview(await getById(interviewId), interviewId);
  assertOwner(interview, interviewerId);

  if (interview.status !== 'invited') {
    throw Object.assign(
      new Error(
        `Cannot regenerate invite — interview has already started (status: ${interview.status}).`
      ),
      { status: 409 }
    );
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = tokenExpiry();

  await updateInterview(interviewId, {
    access_token_hash: tokenHash,
    token_expires_at: expiresAt.toISOString(),
  });

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const link = `${frontendUrl}/interview/${interviewId}?t=${rawToken}`;

  return { id: interviewId, token: rawToken, link, expiresAt };
}

/** Hard-delete (erasure) — removes the interview and all of its data. */
export async function deleteInterview(interviewId: string, interviewerId: string): Promise<void> {
  const interview = requireInterview(await getById(interviewId), interviewId);
  assertOwner(interview, interviewerId);
  await dbDeleteInterview(interviewId);
}

/**
 * Re-score an interview: reset to a scorable state and run scoring again. Recovers a stuck
 * 'completed' (process died mid-score) and regenerates a failed/again scorecard.
 */
export async function rescore(interviewId: string, interviewerId: string): Promise<void> {
  const interview = requireInterview(await getById(interviewId), interviewId);
  assertOwner(interview, interviewerId);
  if ((interview.transcript ?? []).length === 0) {
    throw Object.assign(new Error('This interview has no transcript to score yet'), {
      status: 409,
    });
  }
  // Only a finished interview (scored) or one stuck mid-score (completed) is re-scorable.
  // NOT in_progress — re-scoring a live session would claim it out from under the candidate.
  // NOT abandoned/expired — re-scoring would drop the `incomplete` flag (presenting a partial as
  // a real verdict) and re-arm the sweep. A truly-stuck in_progress self-heals via the sweep.
  const RESCORABLE = new Set(['scored', 'completed']);
  if (!RESCORABLE.has(interview.status)) {
    throw Object.assign(
      new Error(`This interview can't be re-scored (status: ${interview.status}).`),
      { status: 409 }
    );
  }
  // Reset so finishAndScore's single-flight claim (in_progress -> completed) can run again.
  // rescore:true preserves the original timeLimited verdict instead of re-deriving it from the
  // (now stale) wall clock.
  await updateInterview(interviewId, { status: 'in_progress' });
  await finishAndScore(interviewId, { rescore: true });
}

export interface AnswerResult {
  utterance: Utterance;
  phase: string;
  state: InterviewContext;
  /** Set when this reply is an autonomous intervention (a follow-up probe/counter-question, or the
   *  deep hint after an accepted offer) — the room styles it as the interviewer stepping in. The
   *  same tag is persisted on the transcript turn, so a reload shows it identically; without this,
   *  the live bubble lacked the hint styling until a refresh. */
  assist?: { kind: InterventionKind; strength: number; mandatory?: boolean };
}

/** Replay the last processed answer's result without advancing (idempotent retry path). */
function replayLastAnswer(interview: Interview): AnswerResult {
  const transcript = interview.transcript ?? [];
  const lastAi = [...transcript].reverse().find((t) => t.role === 'interviewer');
  const ctx = interview.fsm_state as InterviewContext;
  if (interview.status === 'scored' || ctx.phase === 'scoring' || ctx.phase === 'done') {
    return {
      utterance: {
        text: lastAi?.text ?? 'Your interview is complete. Thank you!',
        expects: 'text',
      },
      phase: 'done',
      state: { ...ctx, phase: 'done' },
    };
  }
  return { utterance: { text: lastAi?.text ?? '', expects: 'text' }, phase: ctx.phase, state: ctx };
}

export async function submitAnswer(
  interviewId: string,
  answer: string,
  requestId?: string,
  /** Coding-phase control intent. 'submit' = lock code + fire the mandatory counter-question;
   *  'move_on' = firm forward skip (no probe); 'answer' (default) = a normal answer/clarify. */
  intent: SubmitIntent = 'answer',
  /** The exact editor code that accompanied a SUBMIT (B1) — anchors the counter-question. */
  submittedCode?: string
): Promise<AnswerResult> {
  // Serialise concurrent submissions for the same interview. In voice mode a streamed voice
  // turn and a typed answer can arrive simultaneously; without this lock the second writer
  // reads stale fsm_state and silently drops the first caller's candidate turn + FSM
  // transition. Single-process invariant — see backend/src/interview/lock.ts.
  return withInterviewLock(interviewId, async () => {
    const interview = requireInterview(await getById(interviewId), interviewId);

    // Idempotency: if this exact submission was already processed (lost response + client
    // retry), replay the prior result instead of advancing the FSM a second time.
    if (requestId && interview.last_request_id === requestId) {
      return replayLastAnswer(interview);
    }

    if (interview.status !== 'in_progress') {
      throw Object.assign(new Error('Interview is not in progress'), { status: 409 });
    }

    // Hard time limit: a late answer is NOT accepted (not persisted, not graded) — conclude +
    // score what's there. Reject with 409 so the client rolls back its optimistic bubble rather
    // than showing the answer as if it counted. The room normally concludes itself at 0:00; this
    // is the server-side backstop.
    if (durationExceeded(interview)) {
      void finishAndScore(interviewId).catch((err: unknown) => {
        console.error(`[orchestrator] time-limit scoring failed for ${interviewId}:`, err);
      });
      throw Object.assign(new Error('Your interview has concluded — the time limit was reached.'), {
        status: 409,
      });
    }

    const ctx = interview.fsm_state as InterviewContext;
    const oracle = getOracle();
    // SUBMIT / MOVE-ON are explicit coding controls: they carry code, not free-text conversation,
    // so they skip the hint-offer + clarify paths (B4) — a ternary '?' in code must never be read
    // as a clarifying question, and code must never be read as a yes/no to a pending offer.
    const explicit = intent === 'submit' || intent === 'move_on';

    // B2: never START a mandatory counter-question that can't be answered before the hard cap. If a
    // fresh SUBMIT lands inside the reserve window, refuse it and steer to MOVE-ON (instant) so the
    // "every submit earns a counter-question" invariant holds at the time boundary.
    if (
      intent === 'submit' &&
      ctx.phase === 'coding' &&
      ctx.followUps === 0 &&
      interview.tnc_accepted_at
    ) {
      const totalMs = interviewDurationMs(interview);
      const remaining = totalMs - (Date.now() - new Date(interview.tnc_accepted_at).getTime());
      const reserve = Math.min(SUBMIT_RESERVE_MS, totalMs * 0.15); // scaled for short dev interviews
      if (remaining < reserve) {
        throw Object.assign(
          new Error(
            'Not enough time left to submit and discuss — use “Move on” to finish this problem.'
          ),
          { status: 409, code: 'submit_window_closed' }
        );
      }
    }

    // B1: a SUBMIT carries the current editor code; anchor evaluation + the counter-question on it
    // (and persist it), so the CQ cites the SUBMITTED code even if the candidate never hit Run.
    const effectiveCode =
      intent === 'submit' && typeof submittedCode === 'string' && submittedCode.trim()
        ? submittedCode
        : interview.code_snapshot;
    const snapshotToPersist =
      intent === 'submit' && effectiveCode !== interview.code_snapshot ? effectiveCode : undefined;
    // M4: submit/move-on carry no free-text — synthesize a neutral transcript line.
    const answerText = answer.trim()
      ? answer
      : intent === 'submit'
        ? '[Candidate submitted their solution.]'
        : intent === 'move_on'
          ? '[Candidate chose to move on to the next problem.]'
          : answer;

    // Conversational paths run ONLY for a normal answer. MOVE-ON/SUBMIT skip them (B4).
    if (!explicit) {
      // Deep-hint OFFER resolution: a yes/no reply to a pending offer — deliver the deep hint (accept)
      // or a warm no-penalty ack (decline), WITHOUT advancing. Runs BEFORE clarify.
      const offerResolved = await maybeResolveHintOffer(interview, ctx, answer, oracle, requestId);
      if (offerResolved) return offerResolved;
      // Clarifying-question handling: a candidate may ASK rather than answer; answer it (no spoilers)
      // and return WITHOUT advancing. Bounded by CLARIFY_CAP.
      if (ctx.phase === 'oral' || ctx.phase === 'coding') {
        const clarify = await maybeAnswerClarification(interview, ctx, answer, oracle, requestId);
        if (clarify) return clarify;
      }
    }

    // Evaluate the answer (oral + coding) for the nudge/follow-up signal. MOVE-ON skips the oracle
    // entirely (firm skip). A SUBMIT still evaluates (records signal + a deeper probe family), but the
    // machine fires the mandatory counter-question regardless of the oracle's followUp.
    let decision: import('./types').OracleDecision | undefined;
    if (intent !== 'move_on' && (ctx.phase === 'oral' || ctx.phase === 'coding')) {
      decision = await withCostContext({ interviewId, kind: 'brain', phase: ctx.phase }, () =>
        oracle.evaluateAnswer({
          answer: answerText,
          code: effectiveCode,
          ctx,
          transcript: interview.transcript ?? [],
        })
      );
    }

    const { ctx: newCtx, effect } = advance(ctx, { type: 'answer', decision, intent });
    // A real answer advanced the FSM → reset the per-question clarify budget + hint-offer state so the
    // next question starts fresh.
    newCtx.clarifyCount = 0;
    newCtx.hintOffer = undefined;

    // Record the candidate's answer as an event.
    await appendEvent(interviewId, 'answer', { text: answerText, ...(explicit ? { intent } : {}) });

    if (effect.kind === 'score') {
      await persistTransition(
        interview,
        newCtx,
        effect,
        null,
        answerText,
        requestId,
        undefined,
        snapshotToPersist
      );
      // Score in the background so the candidate's final response returns immediately. The
      // explicit /finish path also calls finishAndScore; the single-flight claim makes it safe.
      void finishAndScore(interviewId).catch((err: unknown) => {
        console.error(`[orchestrator] background scoring failed for ${interviewId}:`, err);
      });
      // Return an empty utterance — the UI should show a "scoring complete" state.
      return {
        utterance: { text: 'Your interview is complete. Thank you!', expects: 'text' },
        phase: 'done',
        state: { ...newCtx, phase: 'done' },
      };
    }

    if (effect.kind === 'done') {
      await persistTransition(
        interview,
        newCtx,
        effect,
        null,
        answerText,
        requestId,
        undefined,
        snapshotToPersist
      );
      return {
        utterance: { text: '', expects: 'text' },
        phase: 'done',
        state: newCtx,
      };
    }

    const transcriptWithAnswer: TranscriptTurn[] = [
      ...(interview.transcript ?? []),
      { role: 'candidate', text: answerText },
    ];
    // For a coding question, the assigned problem (shown on the candidate's screen) grounds the
    // interviewer's intro + any follow-up hint. codeIndex identifies which question is in play.
    const codingProblem =
      effect.kind === 'ask_code'
        ? assignedProblem(interview, effect.index)
        : effect.kind === 'ask_followup'
          ? assignedProblem(interview, effect.codeIndex)
          : null;
    const req: UtteranceRequest = {
      effect,
      ctx: newCtx,
      transcript: transcriptWithAnswer,
      code: effectiveCode,
      level: interview.level,
      roleBrief: interview.role_brief,
      problemStatement: codingProblem?.statement ?? null,
    };

    // A follow-up is voiced as a typed intervention so it reads like a real interviewer deepening the
    // thread — the FSM owns WHETHER one happens (mandatory on submit, else within the cap). The whole
    // resolution is wrapped so a live-LLM failure can NEVER leave a half-applied turn: the
    // deterministic oracle does no I/O, so it always completes (and stays code-anchored — B5).
    const isMandatory = effect.kind === 'ask_followup' && effect.mandatory === true;
    const followUpKind: InterventionKind = isMandatory
      ? 'counter_question'
      : (decision?.kind ?? 'probe');
    const interventionReq = {
      kind: followUpKind,
      ctx: newCtx,
      transcript: transcriptWithAnswer,
      code: effectiveCode,
      level: interview.level,
      roleBrief: interview.role_brief,
      problemStatement: codingProblem?.statement ?? null,
      mandatory: isMandatory, // B5: keeps the fallback + LLM prompt code-anchored
      probeHints: codingProblem?.probeHints ?? null,
    };
    let utterance: Utterance;
    let assist: { kind: InterventionKind; strength: number; mandatory?: boolean } | undefined;
    try {
      utterance = await withCostContext({ interviewId, kind: 'brain', phase: newCtx.phase }, () =>
        effect.kind === 'ask_followup'
          ? oracle.generateIntervention(interventionReq)
          : oracle.generateUtterance(req)
      );
    } catch (err) {
      console.error(`[orchestrator] utterance generation failed for ${interviewId}:`, err);
      const fallback = new DeterministicOracle();
      utterance =
        effect.kind === 'ask_followup'
          ? await fallback.generateIntervention(interventionReq)
          : await fallback.generateUtterance(req);
    }
    if (effect.kind === 'ask_followup') {
      // M1: the mandatory CQ is labeled for the room (counter_question) but flagged `mandatory` so the
      // scorer excludes it from the assistance penalty. A NON-mandatory follow-up is oracle-chosen
      // help and IS penalized.
      assist = isMandatory
        ? { kind: 'counter_question', strength: effect.depth, mandatory: true }
        : { kind: followUpKind, strength: effect.depth };
    }

    await persistTransition(
      interview,
      newCtx,
      effect,
      utterance,
      answerText,
      requestId,
      assist,
      snapshotToPersist
    );

    return { utterance, phase: newCtx.phase, state: newCtx, ...(assist ? { assist } : {}) };
  }); // end withInterviewLock
}

/** Cap hidden tests executed per Run — bounds container spend on the shared box (bank problems
 *  have ≤10; this is the ceiling regardless). */
const MAX_HIDDEN_TESTS = 12;

/** The coding problem assigned to a given coding question (codeIndex), or null (legacy/no bank). */
function assignedProblem(interview: Interview, codeIndex: number): CodingProblem | null {
  const slug = interview.coding_problem_ids?.[codeIndex];
  return slug ? getProblemBySlug(slug) : null;
}

/** A candidate-safe copy of a run: hidden-test correctness is NEVER exposed to the candidate (they
 *  see only their own stdout/stderr + any interviewer hint). Used on every candidate-facing run. */
export function stripHiddenTests(run: RunResult): RunResult {
  const safe = { ...run };
  delete safe.testResults;
  return safe;
}

/** The candidate-safe problem for the CURRENT coding question (no hidden tests / reference). The
 *  room fetches this to render the problem panel; null outside coding / for legacy interviews. */
export async function currentCodingProblem(
  interviewId: string
): Promise<{ codeIndex: number; total: number; problem: PublicProblem | null }> {
  const interview = requireInterview(await getById(interviewId), interviewId);
  const ctx = interview.fsm_state as InterviewContext;
  const p = assignedProblem(interview, ctx.codeIndex);
  // Total coding problems this candidate will see (assigned bank size, or the machine's target) —
  // powers the "Problem N of M" indicator + the forward-only framing.
  const total = interview.coding_problem_ids?.length || ctx.config.coreQuestions;
  return { codeIndex: ctx.codeIndex, total, problem: p ? toPublicProblem(p) : null };
}

/**
 * Run the assigned problem's HIDDEN tests against the candidate's code (server-injected stdin —
 * never the candidate's). Sequential with short-circuit on a non-'Accepted' status (crash / timeout /
 * compile error — they repeat across inputs, so we don't burn N containers on broken code).
 * `incomplete` marks an early stop. The caller invokes this only when a problem with tests exists.
 */
async function runHiddenTests(
  problem: CodingProblem,
  language: string,
  source: string
): Promise<TestResults> {
  const kernel = getExecutionKernel();
  const tests = problem.hiddenTests.slice(0, MAX_HIDDEN_TESTS);
  const cases: { index: number; passed: boolean }[] = [];
  let passed = 0;
  let incomplete = false;
  for (let i = 0; i < tests.length; i++) {
    let r: RunResult;
    try {
      r = await kernel.run({ language, source, stdin: tests[i].input });
    } catch {
      incomplete = true; // executor error — stop; don't hammer the box
      break;
    }
    // The kernel returns 'Accepted' for ANY clean run; correctness is our own stdout comparison.
    const ok = r.status === 'Accepted' && r.stdout.trim() === tests[i].expected.trim();
    if (ok) passed++;
    cases.push({ index: i, passed: ok });
    // A non-clean status (crash / timeout / compile error) repeats across inputs — stop early so
    // broken code can't burn N containers (a wrong-but-clean 'Accepted' run continues normally).
    if (r.status !== 'Accepted') {
      incomplete = true;
      break;
    }
  }
  return { passed, total: tests.length, ...(incomplete ? { incomplete: true } : {}), cases };
}

export async function recordRun(interviewId: string, req: RunRequest): Promise<RunResult> {
  const interview = requireInterview(await getById(interviewId), interviewId);

  if (interview.status !== 'in_progress') {
    throw Object.assign(new Error('Interview is not in progress'), { status: 409 });
  }

  // Hard time limit: don't execute a run past the cap — conclude + score instead.
  if (durationExceeded(interview)) {
    void finishAndScore(interviewId).catch((err: unknown) => {
      console.error(`[orchestrator] time-limit scoring failed for ${interviewId}:`, err);
    });
    throw Object.assign(new Error('Your interview has concluded — the time limit was reached.'), {
      status: 409,
    });
  }

  const runCtx = interview.fsm_state as InterviewContext;
  // Phase gate: code execution is only open during the coding round. A run during greeting or
  // oral would spin up real Docker containers without a question in play and pollute the
  // run-signal history that intervention + scoring read — both of which scope to codeIndex.
  if (runCtx.phase !== 'coding') {
    throw Object.assign(new Error('Code runs open in the coding round.'), { status: 409 });
  }

  const kernel = getExecutionKernel();
  const result = await kernel.run(req);
  result.language = req.language;
  result.codeIndex = runCtx.codeIndex; // tag with the question in play, for signal scoping

  // Grade against the assigned problem's HIDDEN tests (server-injected stdin). Server-side only:
  // persisted on the run + used by the intervention engine + scorer, but STRIPPED from the /run
  // response so correctness is never leaked to the candidate live. Best-effort — never fail the run.
  const problem = assignedProblem(interview, runCtx.codeIndex);
  if (problem && problem.hiddenTests.length > 0) {
    try {
      result.testResults = await runHiddenTests(problem, req.language, req.source);
    } catch (err) {
      console.error(`[orchestrator] hidden-test grading failed for ${interviewId}:`, err);
    }
  }

  // ── Autonomous intervention (USP): a balanced interviewer notices repeated failing runs and
  // steps in. We decide + word the hint BEFORE persisting, so it rides along ON the run in the
  // SAME atomic append_code_run write — recordRun never touches transcript/fsm_state, so it can
  // never race a concurrent submitAnswer (no clobbered FSM transition, no dropped transcript turn).
  await attachRunIntervention(interview, runCtx, result, req.source);

  // One atomic write: append the run AND record the snapshot + last-used language together,
  // so code_runs[-1], code_snapshot, and code_language can never describe different runs.
  await appendCodeRun(interviewId, result, req.source, req.language);

  await appendEvent(interviewId, 'code_run', {
    language: req.language,
    status: result.status,
    exitCode: result.exitCode,
    timeMs: result.timeMs,
  });
  // Ledger: sandbox execution time (candidate run; hidden-test containers are additional but
  // exec cost is ~0 on the self-hosted VPS — the metric value is the run count + ms).
  if (result.timeMs != null) recordExecCost(interviewId, result.timeMs);
  if (result.intervention) {
    await appendEvent(interviewId, 'utterance', {
      text: result.intervention.text,
      intervention: true,
      kind: result.intervention.kind,
    });
  }

  return result;
}

export interface NudgeResult {
  /** The idle check-in utterance, or null when the interviewer stays quiet (disabled, capped, not
   *  coding, already resolved, or already solved). */
  intervention: { text: string; kind: InterventionKind } | null;
}

/** Whether Path B (stuck-not-running idle check-ins) is enabled. Default OFF — flip only after the
 *  Playwright matrix + prod telemetry clear it. Server-authoritative: the frontend detector may
 *  fire, but the server no-ops here when disabled, so the flag can never be bypassed from a stale client. */
function idleNudgeEnabled(): boolean {
  const v = (process.env.IDLE_NUDGE_ENABLED ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/**
 * Path B — respond to a candidate who has gone idle during coding (frozen on a blank editor, or
 * paused mid-code) WITHOUT a failing run to react to. The frontend's compound-idle detector (no
 * keystroke + no run + not speaking for a protected window) calls this; the server owns the fairness
 * gates and the oracle words a gentle, content-free check-in. The nudge is persisted as a synthetic
 * 'Idle' run on the code-run channel (via appendCodeRunOnly) so it is race-free and touches neither
 * fsm_state nor the transcript — the same invariant the run path relies on. Best-effort throughout;
 * a failure here must never break the room. `codeLength` is the candidate's current editor length,
 * used only to pick the check-in's wording (blank vs partial).
 */
export async function nudgeInterview(
  interviewId: string,
  codeLength: number
): Promise<NudgeResult> {
  // Server-authoritative gate — cheapest possible no-op when the feature is off (no DB, no oracle).
  if (!idleNudgeEnabled()) return { intervention: null };

  const interview = requireInterview(await getById(interviewId), interviewId);
  if (interview.status !== 'in_progress') return { intervention: null };
  // Past the hard time limit → let the normal conclude/score path handle it; never nudge.
  if (durationExceeded(interview)) return { intervention: null };

  const ctx = interview.fsm_state as InterviewContext;
  if (ctx.phase !== 'coding') return { intervention: null };

  const runs = interview.code_runs ?? [];
  // Real-run signals (idle markers already excluded inside deriveRunSignals) tell us if they've
  // already solved it; the idle-nudge count + prior offer resolution bound how much we step in.
  const signals = deriveRunSignals(runs, ctx.codeIndex);
  const offerResolution =
    ctx.hintOffer?.codeIndex === ctx.codeIndex ? ctx.hintOffer.status : 'none';
  // An unresolved OFFER on the last real run means our own question is still on the table —
  // the check-in must wait (and an interleaved Idle marker would hide the offer from the answer path).
  const realRuns = runs.filter((r) => r.codeIndex === ctx.codeIndex && r.status !== 'Idle');
  const pendingOffer =
    realRuns[realRuns.length - 1]?.intervention?.kind === 'offer' && offerResolution === 'none';
  const decision = decideIdleIntervention({
    phase: ctx.phase,
    codeLength: Number.isFinite(codeLength) ? Math.max(0, Math.floor(codeLength)) : 0,
    idleNudgesGiven: idleNudgesGiven(runs, ctx.codeIndex),
    offerResolution,
    lastRealRunPassed: signals.lastRunPassed,
    pendingOffer,
  });
  if (!decision.intervene) return { intervention: null };

  const problem = assignedProblem(interview, ctx.codeIndex);
  const interventionReq = {
    kind: decision.kind,
    idleMode: decision.mode,
    ctx,
    transcript: interview.transcript ?? [],
    code: interview.code_snapshot,
    level: interview.level,
    roleBrief: interview.role_brief,
    problemStatement: problem?.statement ?? null,
  };
  // Word it via the fast oracle; fall back to the deterministic check-in so an idle candidate is
  // never left hanging by a rate-limited/ down oracle (same guarantee as run hints).
  let utterance: Utterance;
  try {
    utterance = await withCostContext({ interviewId, kind: 'brain', phase: 'coding' }, () =>
      getOracle().generateIntervention(interventionReq)
    );
  } catch (err) {
    console.error(`[orchestrator] idle-nudge generation failed for ${interviewId}:`, err);
    utterance = await new DeterministicOracle().generateIntervention(interventionReq);
  }
  if (!utterance.text) return { intervention: null };

  // Persist as a synthetic idle marker on the code-run channel — append-only (never overwrites the
  // real code_snapshot), race-free, invisible to the scorer + run-failure signals.
  const idleRun: RunResult = {
    stdout: '',
    stderr: '',
    compileOutput: '',
    status: 'Idle',
    exitCode: null,
    timeMs: null,
    memoryKb: null,
    codeIndex: ctx.codeIndex,
    intervention: { text: utterance.text, kind: decision.kind },
  };
  try {
    await appendCodeRunOnly(interviewId, idleRun);
    await appendEvent(interviewId, 'utterance', {
      text: utterance.text,
      intervention: true,
      kind: decision.kind,
      idle: true,
    });
  } catch (err) {
    // If the marker didn't persist, still return the utterance (best-effort). The per-question cap
    // is derived from persisted markers, so a failed persist just means the next idle poll may retry.
    console.error(`[orchestrator] idle-nudge persist failed for ${interviewId} (non-fatal):`, err);
  }

  return { intervention: { text: utterance.text, kind: decision.kind } };
}

/** Decide + (maybe) word an interviewer hint for a struggling run, attaching it to `result` so it
 *  persists atomically ON the run (and shows immediately in the room). Best-effort: any failure
 *  here — including the LLM call — must never fail the candidate's run. Writes nothing itself. */
async function attachRunIntervention(
  interview: Interview,
  ctx: InterviewContext,
  result: RunResult,
  currentSource: string
): Promise<void> {
  try {
    if (ctx.phase !== 'coding') return;
    const prior = interview.code_runs ?? [];
    const withCurrent = [...prior, result];
    const signals = deriveRunSignals(withCurrent, ctx.codeIndex);
    const budget = deriveRunAssistBudget(prior, ctx.codeIndex); // prior only — current has no hint yet
    // How the candidate answered a prior deep-hint offer (read-only from fsm_state, which only the
    // answer path writes — no cross-path race). 'declined'/'hinted' stop the run path from re-hinting.
    const offerResolution =
      ctx.hintOffer?.codeIndex === ctx.codeIndex ? ctx.hintOffer.status : 'none';
    const decision = decideRunIntervention(signals, ctx.phase, budget, offerResolution);
    if (!decision.intervene) return;

    const oracle = getOracle();
    // Real runs only — a synthetic Idle marker is not an execution and must not appear in the
    // oracle's run history (it would read as a mysterious failed run).
    const recentRuns = withCurrent
      .filter((r) => r.codeIndex === ctx.codeIndex && r.status !== 'Idle')
      .slice(-4)
      .map((r) => ({ status: r.status, stderr: r.stderr }));
    const problem = assignedProblem(interview, ctx.codeIndex);
    // Tell the oracle the REAL failure mode so the hint targets it — never the raw test I/O.
    const tr = result.testResults;
    const testSummary = tr
      ? tr.passed === tr.total
        ? `ran clean and passed all ${tr.total} hidden tests`
        : `passed ${tr.passed}/${tr.total} hidden tests${tr.incomplete ? ' (stopped early on an error/timeout)' : ' — wrong output on some cases'}`
      : null;
    const interventionReq = {
      kind: decision.kind,
      ctx,
      transcript: interview.transcript ?? [],
      code: currentSource, // the source that just ran (code_snapshot isn't updated until the append)
      recentRuns,
      level: interview.level,
      roleBrief: interview.role_brief,
      problemStatement: problem?.statement ?? null,
      testSummary,
      strength: decision.strength,
      consecutiveFailures: signals.consecutiveFailures,
    };
    // A decided hint should reach a stuck candidate even if the fast oracle is rate-limited —
    // fall back to the deterministic hint rather than staying silent this run.
    let utterance: Utterance;
    try {
      utterance = await withCostContext(
        { interviewId: interview.id, kind: 'brain', phase: 'coding' },
        () => oracle.generateIntervention(interventionReq)
      );
    } catch (err) {
      console.error(`[orchestrator] run-hint generation failed for ${interview.id}:`, err);
      utterance = await new DeterministicOracle().generateIntervention(interventionReq);
    }
    if (utterance.text) {
      result.intervention = { text: utterance.text, kind: decision.kind };
    }
  } catch (err) {
    console.error(`[orchestrator] run-intervention failed for ${interview.id}:`, err);
  }
}

export async function finishAndScore(
  interviewId: string,
  opts: { rescore?: boolean; finalCode?: string; finalLanguage?: string } = {}
): Promise<boolean> {
  // ── Phase 1: claim + capture snapshot (under lock) ──────────────────────────────────────────
  // withInterviewLock serialises this against concurrent submitAnswer calls so a late /answer
  // cannot observe a stale fsm_state while we are committing the scoring transition.
  // The lock is held only for the cheap DB round-trips; the slow LLM scoring call runs outside.
  type SetupData = {
    interview: Interview;
    timedOut: boolean;
    engaged: boolean;
    priorTimeLimited: boolean;
  };

  const setup = await withInterviewLock(interviewId, async (): Promise<SetupData | null> => {
    // Single-flight idempotency: only the caller that atomically flips in_progress -> completed
    // proceeds to score. claimForScoring matches WHERE status = 'in_progress', so a
    // scored/completed/expired/abandoned/cancelled interview yields claimed=false here — the
    // background (post-answer) path and the explicit /finish route can race; exactly one wins,
    // so there's no double-score / double-email. Returns null on the no-op (lost-claim) path.
    const claimed = await claimForScoring(interviewId);
    if (!claimed) return null;

    // Persist the candidate's final code snapshot BEFORE scoring so the scorer and dashboard
    // see the code as it was at the moment of finish (not a stale /run snapshot).
    if (typeof opts.finalCode === 'string' && opts.finalCode.length > 0) {
      const patch: Parameters<typeof updateInterview>[1] = {
        code_snapshot: opts.finalCode,
        ...(typeof opts.finalLanguage === 'string' && opts.finalLanguage
          ? { code_language: opts.finalLanguage }
          : {}),
      };
      await updateInterview(interviewId, patch);
    }

    // Re-fetch AFTER claiming (and after persisting finalCode) so scoring sees every code run
    // that landed before the claim — a concurrent /run's atomic append could otherwise slip in
    // between an earlier read and the claim and be missed.
    const interview = requireInterview(await getById(interviewId), interviewId);

    // Capture the time-limit verdict NOW, before the (slow) scoring call — otherwise a finish
    // in the last few seconds could be mislabeled when the LLM call pushes the clock past cap.
    const timedOut = durationExceeded(interview);
    const engaged = (interview.transcript ?? []).some((t) => t.role === 'candidate');
    const priorTimeLimited = interview.evaluation_score?.timeLimited === true;

    return { interview, timedOut, engaged, priorTimeLimited };
  });

  if (!setup) return false;

  const { interview, timedOut, engaged, priorTimeLimited } = setup;

  // ── Phase 2: score OUTSIDE the lock (long LLM call) ─────────────────────────────────────────
  // A slow scorer must not starve concurrent /answer calls for the same interview.

  const minimaxClient = getScoringClient();

  // Exclude synthetic idle-nudge markers (Path B): they are interviewer check-ins on a stalled
  // candidate, not code runs — grading them as failed executions would unfairly tank the score.
  const codeRuns: CodeRunSummary[] = (interview.code_runs ?? [])
    .filter((r: RunResult) => r.status !== 'Idle')
    .map((r: RunResult) => ({
      language: r.language ?? 'unknown',
      status: r.status,
      stderr: r.stderr,
      ...(r.testResults
        ? { testResults: { passed: r.testResults.passed, total: r.testResults.total } }
        : {}),
      ...(r.intervention
        ? { intervention: { kind: r.intervention.kind, text: r.intervention.text } }
        : {}),
    }));

  // Best-effort: a proctor-fetch failure must never block scoring.
  let proctorData: import('../db/interviews').ProctorAggregate | undefined;
  try {
    proctorData = await getProctorSignalsForInterview(interviewId);
    // Omit the aggregate when there are no windows recorded (monitoredMs === 0).
    if (proctorData.monitoredMs === 0) proctorData = undefined;
  } catch (err) {
    console.error(`[orchestrator] proctor fetch failed for ${interviewId} (non-fatal):`, err);
  }

  const scorecard = await withCostContext({ interviewId, kind: 'scorer', phase: 'scoring' }, () =>
    scoreInterview(
      {
        transcript: interview.transcript ?? [],
        codeRuns,
        finalCode: interview.code_snapshot || undefined,
        level: interview.level,
        roleBrief: interview.role_brief,
        proctor: proctorData,
      },
      minimaxClient
    )
  );

  // Mutually-exclusive outcome flags: a candidate who never produced an answer is "incomplete"
  // (a status, excluded from averages); otherwise, if the timer cut them off it's a real but
  // "time-limited" score. A re-score must NOT re-derive timeLimited from the (now stale) clock —
  // it preserves the original verdict instead.
  if (!engaged) {
    scorecard.incomplete = true;
  } else if (opts.rescore ? priorTimeLimited : timedOut) {
    scorecard.timeLimited = true;
  }

  // ── Phase 3: persist results (under lock) ───────────────────────────────────────────────────
  await withInterviewLock(interviewId, async () => {
    await updateInterview(interviewId, {
      evaluation_score: scorecard,
      status: 'scored',
      phase: 'done',
      // Keep fsm_state.phase in sync with the `phase` column. Without this, every scored
      // interview permanently has phase='done' in the column but phase='scoring' in fsm_state,
      // causing the two sources of truth to diverge for every reader that inspects fsm_state.
      fsm_state: { ...(interview.fsm_state as InterviewContext), phase: 'done' },
    });
    await appendEvent(interviewId, 'score', { scorecard });
  });

  // Roll up cost + metrics now that every cost_event (incl. the scorer's own) is recorded.
  // Best-effort inside — never blocks scorecard delivery.
  await rollupInterview(interviewId);

  await insertOutbox(interviewId);

  // Best-effort drain.
  try {
    await drainOutbox(makeOutboxStore(), createEmailSender());
  } catch {
    // Drain failure is non-fatal; the scheduled interval will retry.
  }
  return true;
}

/** Scorecard for a candidate who never started before the link expired (no-show). Carries the
 *  `incomplete` flag so the email/UI frame it as a status, not a hire judgement. */
function noShowScorecard(): Scorecard {
  return {
    overall: 0,
    recommendation: 'no_hire',
    dimensions: [],
    summary: 'The candidate did not start the interview before the invite link expired.',
    incomplete: true,
  };
}

/**
 * Close out interviews so EVERY interview reaches the interviewer — the "fire-and-forget"
 * guarantee. Runs on the periodic sweep:
 *  - no-show (invited past the invite TTL)        -> notify with an incomplete "didn't start" card.
 *  - time-up (in_progress past the 60-min cap)    -> conclude + score via finishAndScore (which
 *      flags timeLimited / incomplete and emails). An actively-answering candidate is held out by
 *      the grace window and concludes itself client-side at 0:00; this catches the absent ones.
 *  - stuck-completed (status='completed' > 30 min) -> scoring process crashed; re-run scoring.
 * CAS claims (claimExpire / claimForScoring inside finishAndScore) make it single-flight, so it
 * never double-sends and never races a candidate finishing at the wire.
 */
export async function closeStaleInterviews(): Promise<{
  noShow: number;
  concluded: number;
  rescored: number;
}> {
  let noShow = 0;
  let concluded = 0;
  let rescored = 0;

  // Per-row try/catch: one failed row (a DB hiccup) must not abort the rest of the sweep.
  for (const iv of await findStaleInvited()) {
    try {
      if (!(await claimExpire(iv.id))) continue; // someone else closed it
      await updateInterview(iv.id, { evaluation_score: noShowScorecard() });
      await insertOutbox(iv.id);
      noShow++;
    } catch (err) {
      console.error(`[sweep] no-show close failed for ${iv.id}:`, err);
    }
  }

  // Conclude in-progress interviews past THEIR duration cap. Prod (60 min) and dev (2 min)
  // interviews have different caps, and the cutoff is a DB-side timestamp filter, so we run one
  // query per tier — disjoint on dev_mode, so no dedup is needed. Using the single 60-min cutoff
  // would leave an abandoned 2-min dev interview in_progress for ~58 extra minutes.
  const prodCutoff = new Date(Date.now() - INTERVIEW_DURATION_MS).toISOString();
  const devCutoff = new Date(Date.now() - DEV_INTERVIEW_DURATION_MIN * 60_000).toISOString();
  const pastDuration = [
    ...(await findInProgressPastDuration(prodCutoff, false)),
    ...(await findInProgressPastDuration(devCutoff, true)),
  ];
  for (const iv of pastDuration) {
    try {
      // claims, scores (with level), flags timeLimited/incomplete, emails. Returns false if a
      // concurrent /finish or sweep already claimed it — don't count that as our conclusion.
      if (await finishAndScore(iv.id)) concluded++;
    } catch (err) {
      console.error(`[sweep] time-up conclude failed for ${iv.id}:`, err);
    }
  }

  // Recover interviews stranded at status='completed' (claimForScoring flipped in_progress →
  // completed but the scoring process crashed before writing the scorecard). A row stuck here
  // for >30 minutes is safe to re-score: CAS flips it back to in_progress so finishAndScore's
  // normal claimForScoring path proceeds, and scoreInterview's fallbackScorecard guarantees
  // termination even on repeated LLM failures.
  const stuckCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  for (const iv of await findStuckCompleted(stuckCutoff)) {
    try {
      if (!(await claimCompletedForRescore(iv.id))) continue; // another sweep already claimed it
      if (await finishAndScore(iv.id)) rescored++;
    } catch (err) {
      console.error(`[sweep] stuck-completed rescore failed for ${iv.id}:`, err);
    }
  }

  // finishAndScore drains its own outbox; only the no-show rows need a drain here.
  if (noShow > 0) {
    try {
      await drainOutbox(makeOutboxStore(), createEmailSender());
    } catch {
      // Non-fatal; the scheduled drain retries.
    }
  }
  return { noShow, concluded, rescored };
}

// ─────────────────────── Data-retention purge ───────────────────────

/**
 * Terminal statuses eligible for hard-deletion.  'in_progress' and 'invited' are
 * explicitly excluded — they belong to active or imminent candidate sessions.
 * 'completed' is a transitional state (in_progress → scored); leaving it out is
 * a safety net in case a scoring job is mid-flight on a very slow scorer.
 */
const PURGEABLE_STATUSES: InterviewStatus[] = [
  'scored',
  'cancelled',
  'expired',
  'abandoned',
  // 'completed' is a transitional state (in_progress → scored); the 30-min sweep re-scores any
  // row that has been stuck here, so by the time retention runs a 'completed' row is a stale
  // artefact from an old crash and safe to purge.
  'completed',
];

/**
 * Hard-delete interviews that are both (a) in a terminal status and (b) older than
 * retentionDays (measured from created_at, the safe lower-bound timestamp that is
 * always non-null).
 *
 * All child rows are covered by ON DELETE CASCADE (confirmed in migrations 0001,
 * 0010, 0011): interview_events, notify_outbox, voice_turn_telemetry, and
 * proctor_signals are all deleted automatically by the single interview DELETE.
 *
 * Env vars consumed:
 *   RETENTION_DAYS — integer number of days to retain (default: 90)
 *
 * Called by the scheduled purge job in server.ts; also exported for ad-hoc use.
 */
export async function purgeExpiredData(
  retentionDays = Number(process.env.RETENTION_DAYS ?? 90)
): Promise<{ interviews: number }> {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const interviews = await deleteInterviewsOlderThan(cutoffIso, PURGEABLE_STATUSES);
  return { interviews };
}
