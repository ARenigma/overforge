// Orchestrator — ties the FSM, oracle, repo, and scoring together.
// Each public function is a complete, transactional step; it persists events and
// updated state before returning. The FSM is the single source of truth for
// control flow; the LLM oracle fills utterance slots only.

import { advance, initialContext } from './machine';
import { DeterministicOracle, Oracle, TranscriptTurn, UtteranceRequest, Utterance } from './oracle';
import { InterviewContext, Effect } from './types';
import { createMinimaxClient, MinimaxOracle, minimaxConfigFromEnv } from './minimax';
import { generateToken, hashToken } from './token';
import {
  createInterview as dbCreateInterview,
  getById,
  updateInterview,
  appendEvent,
  appendCodeRun,
  insertOutbox,
  makeOutboxStore,
  Interview,
} from '../db/interviews';
import { createDockerKernel } from '../execution/docker';
import { RunRequest, RunResult } from '../execution/types';
import { scoreInterview, CodeRunSummary } from '../scoring/scorer';
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

// ─────────────────────── Token TTL ───────────────────────

const TOKEN_TTL_HOURS = 72;

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
  candidateAnswer?: string
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
  });

  return { id: interview.id, token: rawToken, expiresAt };
}

export interface BeginResult {
  utterance: Utterance;
  phase: string;
  state: InterviewContext;
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

  await updateInterview(interviewId, {
    tnc_accepted_at: new Date().toISOString(),
    status: 'in_progress',
  });

  await persistTransition(interview, newCtx, effect, utterance);

  return { utterance, phase: newCtx.phase, state: newCtx };
}

export interface AnswerResult {
  utterance: Utterance;
  phase: string;
  state: InterviewContext;
}

export async function submitAnswer(interviewId: string, answer: string): Promise<AnswerResult> {
  const interview = requireInterview(await getById(interviewId), interviewId);

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
    await persistTransition(interview, newCtx, effect, null, answer);
    await finishAndScore(interviewId);
    // Return an empty utterance — the UI should show a "scoring complete" state.
    return {
      utterance: { text: 'Your interview is complete. Thank you!', expects: 'text' },
      phase: 'done',
      state: { ...newCtx, phase: 'done' },
    };
  }

  if (effect.kind === 'done') {
    await persistTransition(interview, newCtx, effect, null, answer);
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

  await persistTransition(interview, newCtx, effect, utterance, answer);

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

  await appendCodeRun(interviewId, result);
  await updateInterview(interviewId, { code_snapshot: req.source });

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
  const interview = requireInterview(await getById(interviewId), interviewId);

  // Idempotency: scoring runs exactly once. Both the /answer 'score' effect and the
  // explicit /finish route can reach here; the second call is a no-op.
  if (interview.status === 'scored') return;

  const { client: minimaxClient } = (() => {
    if (process.env.MINIMAX_API_KEY) {
      return { client: createMinimaxClient(minimaxConfigFromEnv()) };
    }
    // Fallback — use a stub that forces the fallback scorecard path in scorer.
    return {
      client: {
        complete: async (): Promise<string> => {
          throw new Error('Minimax not configured');
        },
      },
    };
  })();

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
