// Orchestrator — ties the FSM, oracle, repo, and scoring together.
// Each public function is a complete, transactional step; it persists events and
// updated state before returning. The FSM is the single source of truth for
// control flow; the LLM oracle fills utterance slots only.

import { advance, initialContext } from './machine';
import { DeterministicOracle, Oracle, TranscriptTurn, UtteranceRequest, Utterance } from './oracle';
import { InterviewContext, Effect } from './types';
import { createMinimaxClient, MinimaxClient, MinimaxOracle, minimaxConfigFromEnv } from './minimax';
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
  claimAbandon,
  findStaleInvited,
  findStaleInProgress,
  insertOutbox,
  makeOutboxStore,
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
  if (process.env.MINIMAX_API_KEY) {
    return new MinimaxOracle(createMinimaxClient(minimaxConfigFromEnv()));
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
  requestId?: string
): Promise<void> {
  const transcript: TranscriptTurn[] = interview.transcript ?? [];

  if (candidateAnswer !== undefined) {
    transcript.push({ role: 'candidate', text: candidateAnswer });
  }

  if (utterance && utterance.text) {
    transcript.push({ role: 'interviewer', text: utterance.text });
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
  const req: UtteranceRequest = { effect, ctx: newCtx, transcript: interview.transcript ?? [] };
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
    language: interview.code_language ?? null,
    lastRunResult: runs.length > 0 ? runs[runs.length - 1] : null,
  };
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
  // Only a finished/stuck interview is re-scorable. Refuse the terminal-incomplete states
  // (abandoned / expired) — re-scoring would reset them to in_progress, drop the `incomplete`
  // flag (presenting a partial transcript as a real verdict), and re-arm the expiry sweep to
  // close + email them a second time.
  const RESCORABLE = new Set(['scored', 'completed', 'in_progress']);
  if (!RESCORABLE.has(interview.status)) {
    throw Object.assign(
      new Error(`This interview was closed as "${interview.status}" and can't be re-scored.`),
      { status: 409 }
    );
  }
  // Reset so finishAndScore's single-flight claim (in_progress -> completed) can run again.
  await updateInterview(interviewId, { status: 'in_progress' });
  await finishAndScore(interviewId);
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

  const ctx = interview.fsm_state as InterviewContext;
  const oracle = getOracle();

  // In the coding phase, ask the oracle whether a follow-up is warranted.
  let decision: import('./types').OracleDecision | undefined;
  if (ctx.phase === 'coding') {
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

  const req: UtteranceRequest = {
    effect,
    ctx: newCtx,
    transcript: [...(interview.transcript ?? []), { role: 'candidate', text: answer }],
    code: interview.code_snapshot,
  };
  const utterance = await oracle.generateUtterance(req);

  await persistTransition(interview, newCtx, effect, utterance, answer, requestId);

  return { utterance, phase: newCtx.phase, state: newCtx };
}

export async function recordRun(interviewId: string, req: RunRequest): Promise<RunResult> {
  const interview = requireInterview(await getById(interviewId), interviewId);

  if (interview.status !== 'in_progress') {
    throw Object.assign(new Error('Interview is not in progress'), { status: 409 });
  }

  const kernel = getExecutionKernel();
  const result = await kernel.run(req);
  result.language = req.language;

  // One atomic write: append the run AND record the snapshot + last-used language together,
  // so code_runs[-1], code_snapshot, and code_language can never describe different runs.
  await appendCodeRun(interviewId, result, req.source, req.language);

  await appendEvent(interviewId, 'code_run', {
    language: req.language,
    status: result.status,
    exitCode: result.exitCode,
    timeMs: result.timeMs,
  });

  // Suppress unused variable lint warning.
  void interview;

  return result;
}

export async function finishAndScore(interviewId: string): Promise<void> {
  // Single-flight idempotency: only the caller that atomically flips in_progress -> completed
  // proceeds to score. claimForScoring matches WHERE status = 'in_progress', so a
  // scored/completed/expired/abandoned/cancelled interview yields claimed=false here — the
  // background (post-answer) path and the explicit /finish route can race; exactly one wins,
  // so there's no double-score / double-email.
  const claimed = await claimForScoring(interviewId);
  if (!claimed) return;

  // Re-fetch AFTER claiming so scoring sees every code run that landed before the claim — a
  // concurrent /run's atomic append could otherwise slip in between an earlier read and the
  // claim and be missed.
  const interview = requireInterview(await getById(interviewId), interviewId);

  const minimaxClient = getScoringClient();

  const codeRuns: CodeRunSummary[] = (interview.code_runs ?? []).map((r: RunResult) => ({
    language: r.language ?? 'unknown',
    status: r.status,
    stderr: r.stderr,
  }));

  const scorecard = await scoreInterview(
    {
      transcript: interview.transcript ?? [],
      codeRuns,
      finalCode: interview.code_snapshot || undefined,
    },
    minimaxClient
  );

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
 * Close out interviews stranded past their TTL so EVERY interview reaches the interviewer —
 * the "fire-and-forget" guarantee. Runs on the periodic sweep:
 *  - no-show  (invited past TTL)     -> notify with an incomplete "didn't start" scorecard.
 *  - dropout  (in_progress past TTL) -> score the partial transcript, flagged incomplete.
 * Both land via the existing scorecard outbox/email. CAS claims make it single-flight, so it
 * never double-sends and never races a candidate who finishes (claimForScoring) at the wire.
 */
export async function closeStaleInterviews(): Promise<{ noShow: number; abandoned: number }> {
  let noShow = 0;
  let abandoned = 0;

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

  for (const iv of await findStaleInProgress()) {
    try {
      if (!(await claimAbandon(iv.id))) continue;
      // Re-fetch AFTER claiming so we score every turn/run that landed before the claim — a
      // concurrent /answer or /run could have written after the findStale snapshot (mirrors
      // finishAndScore).
      const fresh = requireInterview(await getById(iv.id), iv.id);
      const codeRuns: CodeRunSummary[] = (fresh.code_runs ?? []).map((r: RunResult) => ({
        language: r.language ?? 'unknown',
        status: r.status,
        stderr: r.stderr,
      }));
      const scorecard = await scoreInterview(
        {
          transcript: fresh.transcript ?? [],
          codeRuns,
          finalCode: fresh.code_snapshot || undefined,
        },
        getScoringClient()
      );
      scorecard.incomplete = true; // partial transcript — a status note, not a clean grade
      await updateInterview(iv.id, { evaluation_score: scorecard });
      await insertOutbox(iv.id);
      abandoned++;
    } catch (err) {
      console.error(`[sweep] dropout close failed for ${iv.id}:`, err);
    }
  }

  if (noShow + abandoned > 0) {
    try {
      await drainOutbox(makeOutboxStore(), createEmailSender());
    } catch {
      // Non-fatal; the scheduled drain retries.
    }
  }
  return { noShow, abandoned };
}
