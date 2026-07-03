// Orchestrator — ties the FSM, oracle, repo, and scoring together.
// Each public function is a complete, transactional step; it persists events and
// updated state before returning. The FSM is the single source of truth for
// control flow; the LLM oracle fills utterance slots only.

import { advance, initialContext } from './machine';
import { DeterministicOracle, Oracle, TranscriptTurn, UtteranceRequest, Utterance } from './oracle';
import { InterviewContext, Effect, InterventionKind } from './types';
import { deriveRunSignals } from './signals';
import { decideRunIntervention, deriveRunAssistBudget } from './intervention';
import {
  createMinimaxClient,
  MinimaxClient,
  MinimaxOracle,
  minimaxConfigFromEnv,
  groqConfigFromEnv,
} from './minimax';
import { generateToken, hashToken } from './token';
import {
  createInterview as dbCreateInterview,
  getById,
  updateInterview,
  deleteInterview as dbDeleteInterview,
  appendEvent,
  appendCodeRun,
  claimForScoring,
  claimExpire,
  findStaleInvited,
  findInProgressPastDuration,
  insertOutbox,
  makeOutboxStore,
  getProctorSignalsForInterview,
  Interview,
} from '../db/interviews';
import { createDockerKernel } from '../execution/docker';
import { RunRequest, RunResult } from '../execution/types';
import { scoreInterview, CodeRunSummary } from '../scoring/scorer';
import { Scorecard } from '../scoring/types';
import { drainOutbox } from '../notify/outbox';
import { createEmailSender } from '../notify/resend';

// ─────────────────────── Oracle factory ───────────────────────

export function getOracle(): Oracle {
  // Real-time conversational turns want the FASTEST good model. Prefer Groq (GPT-OSS on the LPU,
  // ~0.5s TTFT) when configured; else the MiniMax fast model; else the deterministic stub. The final
  // scorecard grading stays on MiniMax (getScoringClient) — split-brain: fast turns, deep scoring.
  if (process.env.GROQ_API_KEY) {
    return new MinimaxOracle(createMinimaxClient(groqConfigFromEnv()));
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

/** The pinned grader client, or a stub that forces scorer's safe fallback when Minimax isn't
 *  configured. Shared by finishAndScore and closeStaleInterviews. */
function getScoringClient(): MinimaxClient {
  if (process.env.MINIMAX_API_KEY) {
    return createMinimaxClient(minimaxConfigFromEnv());
  }
  return {
    complete: async (): Promise<string> => {
      throw new Error('Minimax not configured');
    },
  } as MinimaxClient;
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
  assist?: { kind: InterventionKind; strength: number }
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

  if (interview.status !== 'invited') {
    throw Object.assign(new Error('Interview already started or not in invited state'), {
      status: 409,
    });
  }

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
  const utterance = await oracle.generateUtterance(req);

  // Rotate the access token: the invite-link token is consumed here and replaced by a
  // fresh session token bound to the candidate's browser. A forwarded invite link can no
  // longer act on the interview once it has begun.
  const sessionToken = generateToken();

  // The interview's authoritative start time. Recorded once here and echoed back so the
  // client can anchor its elapsed timer (survives reloads).
  const startedAt = new Date().toISOString();

  await updateInterview(interviewId, {
    tnc_accepted_at: startedAt,
    tnc_version: TNC_VERSION,
    status: 'in_progress',
    access_token_hash: hashToken(sessionToken),
    token_expires_at: tokenExpiry().toISOString(),
  });

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
  const runs = interview.code_runs ?? [];
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
    lastRunResult: runs.length > 0 ? runs[runs.length - 1] : null,
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
  requestId?: string
): Promise<AnswerResult> {
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

  // Evaluate the candidate's answer in both the oral and coding phases so the machine can
  // decide whether to nudge (oral: 1-nudge cap) or follow up (coding: maxFollowUps cap).
  // The signal is always recorded truthfully — a weak answer that received a nudge still
  // scores low; we never inflate signal or suppress the thin-answer record.
  let decision: import('./types').OracleDecision | undefined;
  if (ctx.phase === 'oral' || ctx.phase === 'coding') {
    decision = await oracle.evaluateAnswer({
      answer,
      code: interview.code_snapshot,
      ctx,
      transcript: interview.transcript ?? [],
    });
  }

  const { ctx: newCtx, effect } = advance(ctx, { type: 'answer', decision });

  // Record the candidate's answer as an event.
  await appendEvent(interviewId, 'answer', { text: answer });

  if (effect.kind === 'score') {
    await persistTransition(interview, newCtx, effect, null, answer, requestId);
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
    await persistTransition(interview, newCtx, effect, null, answer, requestId);
    return {
      utterance: { text: '', expects: 'text' },
      phase: 'done',
      state: newCtx,
    };
  }

  const transcriptWithAnswer: TranscriptTurn[] = [
    ...(interview.transcript ?? []),
    { role: 'candidate', text: answer },
  ];
  const req: UtteranceRequest = {
    effect,
    ctx: newCtx,
    transcript: transcriptWithAnswer,
    code: interview.code_snapshot,
    level: interview.level,
    roleBrief: interview.role_brief,
  };

  // A follow-up is voiced as a typed intervention (counter-question / probe / hint) so it reads
  // like a real interviewer deepening the thread — the FSM still owns whether one happens at all
  // (within maxFollowUps). Any other effect is a plain scripted utterance. The whole resolution
  // is wrapped so a live-LLM failure can NEVER leave a half-applied turn (answer event logged but
  // no transition persisted): the deterministic oracle does no I/O, so it always completes.
  const followUpKind: InterventionKind = decision?.kind ?? 'probe';
  const interventionReq = {
    kind: followUpKind,
    ctx: newCtx,
    transcript: transcriptWithAnswer,
    code: interview.code_snapshot,
    level: interview.level,
    roleBrief: interview.role_brief,
  };
  let utterance: Utterance;
  let assist: { kind: InterventionKind; strength: number } | undefined;
  try {
    utterance =
      effect.kind === 'ask_followup'
        ? await oracle.generateIntervention(interventionReq)
        : await oracle.generateUtterance(req);
  } catch (err) {
    console.error(`[orchestrator] utterance generation failed for ${interviewId}:`, err);
    const fallback = new DeterministicOracle();
    utterance =
      effect.kind === 'ask_followup'
        ? await fallback.generateIntervention(interventionReq)
        : await fallback.generateUtterance(req);
  }
  if (effect.kind === 'ask_followup') assist = { kind: followUpKind, strength: effect.depth };

  await persistTransition(interview, newCtx, effect, utterance, answer, requestId, assist);

  return { utterance, phase: newCtx.phase, state: newCtx };
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
  const kernel = getExecutionKernel();
  const result = await kernel.run(req);
  result.language = req.language;
  result.codeIndex = runCtx.codeIndex; // tag with the question in play, for signal scoping

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
  if (result.intervention) {
    await appendEvent(interviewId, 'utterance', {
      text: result.intervention.text,
      intervention: true,
      kind: result.intervention.kind,
    });
  }

  return result;
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
    const decision = decideRunIntervention(signals, ctx.phase, budget);
    if (!decision.intervene) return;

    const oracle = getOracle();
    const recentRuns = withCurrent
      .filter((r) => r.codeIndex === ctx.codeIndex)
      .slice(-4)
      .map((r) => ({ status: r.status, stderr: r.stderr }));
    const utterance = await oracle.generateIntervention({
      kind: decision.kind,
      ctx,
      transcript: interview.transcript ?? [],
      code: currentSource, // the source that just ran (code_snapshot isn't updated until the append)
      recentRuns,
      level: interview.level,
      roleBrief: interview.role_brief,
    });
    if (utterance.text) {
      result.intervention = { text: utterance.text, kind: decision.kind };
    }
  } catch (err) {
    console.error(`[orchestrator] run-intervention failed for ${interview.id}:`, err);
  }
}

export async function finishAndScore(
  interviewId: string,
  opts: { rescore?: boolean } = {}
): Promise<boolean> {
  // Single-flight idempotency: only the caller that atomically flips in_progress -> completed
  // proceeds to score. claimForScoring matches WHERE status = 'in_progress', so a
  // scored/completed/expired/abandoned/cancelled interview yields claimed=false here — the
  // background (post-answer) path and the explicit /finish route can race; exactly one wins,
  // so there's no double-score / double-email. Returns false on the no-op (lost-claim) path.
  const claimed = await claimForScoring(interviewId);
  if (!claimed) return false;

  // Re-fetch AFTER claiming so scoring sees every code run that landed before the claim — a
  // concurrent /run's atomic append could otherwise slip in between an earlier read and the
  // claim and be missed.
  const interview = requireInterview(await getById(interviewId), interviewId);

  // Capture the time-limit verdict NOW, before the (slow) scoring call — otherwise a finish in
  // the last few seconds could be mislabeled when the LLM call pushes the clock past the cap.
  const timedOut = durationExceeded(interview);
  const engaged = (interview.transcript ?? []).some((t) => t.role === 'candidate');
  const priorTimeLimited = interview.evaluation_score?.timeLimited === true;

  const minimaxClient = getScoringClient();

  const codeRuns: CodeRunSummary[] = (interview.code_runs ?? []).map((r: RunResult) => ({
    language: r.language ?? 'unknown',
    status: r.status,
    stderr: r.stderr,
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

  const scorecard = await scoreInterview(
    {
      transcript: interview.transcript ?? [],
      codeRuns,
      finalCode: interview.code_snapshot || undefined,
      level: interview.level,
      roleBrief: interview.role_brief,
      proctor: proctorData,
    },
    minimaxClient
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

  await updateInterview(interviewId, {
    evaluation_score: scorecard,
    status: 'scored',
    phase: 'done',
  });

  await appendEvent(interviewId, 'score', { scorecard });

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
 * CAS claims (claimExpire / claimForScoring inside finishAndScore) make it single-flight, so it
 * never double-sends and never races a candidate finishing at the wire.
 */
export async function closeStaleInterviews(): Promise<{ noShow: number; concluded: number }> {
  let noShow = 0;
  let concluded = 0;

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

  // finishAndScore drains its own outbox; only the no-show rows need a drain here.
  if (noShow > 0) {
    try {
      await drainOutbox(makeOutboxStore(), createEmailSender());
    } catch {
      // Non-fatal; the scheduled drain retries.
    }
  }
  return { noShow, concluded };
}
