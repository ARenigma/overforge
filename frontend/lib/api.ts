// API client for the Overforge backend REST API.
// Candidate routes authenticate via token in request body (from URL ?t=).
// Interviewer routes authenticate via Bearer token (Supabase access_token).

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// ── Types ────────────────────────────────────────────────────────────────────

export type InterviewPhase = 'greeting' | 'oral' | 'handoff' | 'coding' | 'wrap_up' | 'done';

export interface Utterance {
  text: string;
  expects: 'voice' | 'text' | 'code';
}

export interface BeginResponse {
  utterance: Utterance;
  phase: InterviewPhase;
  state: Record<string, unknown>;
  /** Fresh session token issued at begin; use it for all subsequent candidate calls. */
  sessionToken: string;
  /** Server-recorded interview start; the client seeds its elapsed timer from this. */
  startedAt: string;
}

export interface TranscriptTurn {
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
}

export interface InterviewState {
  status: string;
  phase: string;
  transcript: TranscriptTurn[];
  codeSnapshot: string;
  /** Interview start (tnc_accepted_at) — used to re-seed the elapsed timer on resume. */
  startedAt: string | null;
  /** Last editor language persisted server-side; null if no run yet. */
  language: string | null;
  /** Most recent code-run output, so the output panel is restored on resume. */
  lastRunResult: RunResult | null;
}

export interface AnswerResponse {
  utterance: Utterance;
  phase: InterviewPhase;
  state: Record<string, unknown>;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  compileOutput: string;
  status: string;
  exitCode: number | null;
  timeMs: number | null;
  memoryKb: number | null;
}

export interface ScorecardDimension {
  name: string;
  score: number;
  notes?: string;
}

export interface Scorecard {
  overall: number;
  recommendation: 'strong_hire' | 'hire' | 'lean_hire' | 'no_hire';
  summary: string;
  dimensions: ScorecardDimension[];
  /** True when automatic scoring failed — show "manual review", never a real no_hire. */
  scoringFailed?: boolean;
}

export interface CreateInterviewResponse {
  id: string;
  token: string;
  link: string;
  expiresAt: string;
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

interface FetchOptions {
  method?: string;
  body?: unknown;
  accessToken?: string;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'POST', body, accessToken } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore parse error; use the status-based message above
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ── Interviewer endpoints ─────────────────────────────────────────────────────

/**
 * POST /api/interviews
 * Creates a new interview session. Requires the interviewer's Supabase access_token.
 */
export async function createInterview(
  accessToken: string,
  body: { candidateEmail: string; candidateName?: string }
): Promise<CreateInterviewResponse> {
  return apiFetch<CreateInterviewResponse>('/api/interviews', {
    accessToken,
    body,
  });
}

/**
 * POST /api/interviews/:id/cancel
 * Soft-cancel an interview (keeps the record; the candidate's link stops working).
 */
export async function cancelInterview(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/interviews/${id}/cancel`, {
    accessToken,
    body: {},
  });
}

/**
 * DELETE /api/interviews/:id
 * Permanently delete an interview and all of its data (erasure).
 */
export async function deleteInterview(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/interviews/${id}`, {
    method: 'DELETE',
    accessToken,
  });
}

/**
 * POST /api/interviews/:id/rescore
 * Re-run scoring (recovers a stuck interview / retries a failed scorecard).
 */
export async function rescoreInterview(accessToken: string, id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/interviews/${id}/rescore`, {
    accessToken,
    body: {},
  });
}

// ── Candidate endpoints ───────────────────────────────────────────────────────

/**
 * POST /api/interviews/:id/begin
 * Starts the interview. Authenticates via candidate token in body.
 */
export async function beginInterview(id: string, token: string): Promise<BeginResponse> {
  return apiFetch<BeginResponse>(`/api/interviews/${id}/begin`, {
    body: { token, tncAccepted: true },
  });
}

/**
 * POST /api/interviews/:id/state
 * Read-only snapshot for rehydrating the candidate UI after a reload.
 */
export async function getInterviewState(id: string, token: string): Promise<InterviewState> {
  return apiFetch<InterviewState>(`/api/interviews/${id}/state`, {
    body: { token },
  });
}

/**
 * POST /api/interviews/:id/answer
 * Submits a candidate answer and returns the next AI utterance.
 */
export async function answerInterview(
  id: string,
  token: string,
  answer: string,
  requestId?: string
): Promise<AnswerResponse> {
  return apiFetch<AnswerResponse>(`/api/interviews/${id}/answer`, {
    body: { token, answer, ...(requestId ? { requestId } : {}) },
  });
}

/**
 * POST /api/interviews/:id/run
 * Executes the candidate's code via Judge0.
 */
export async function runCode(
  id: string,
  token: string,
  language: string,
  source: string,
  stdin?: string
): Promise<RunResult> {
  return apiFetch<RunResult>(`/api/interviews/${id}/run`, {
    body: { token, language, source, ...(stdin !== undefined ? { stdin } : {}) },
  });
}

/**
 * POST /api/interviews/:id/finish
 * Marks the interview as complete. Idempotent.
 */
export async function finishInterview(id: string, token: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/interviews/${id}/finish`, {
    body: { token },
  });
}
