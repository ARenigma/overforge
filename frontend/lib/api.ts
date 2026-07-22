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
  /** Interviewer-assigned room language (null = candidate chooses → editor is unlocked). */
  assignedLanguage: string | null;
  /** Total interview length in seconds — the room counts up and hard-stops at this. */
  durationSeconds: number;
  /** Dev/testing interview — the room allows paste (otherwise paste is blocked). */
  devMode: boolean;
}

export interface TranscriptTurn {
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
  /** Set on interviewer turns produced by the autonomous intervention engine — the room styles
   *  these as hints/probes distinct from scripted questions. */
  assist?: { kind: string; strength: number };
}

export interface InterviewState {
  status: string;
  phase: string;
  transcript: TranscriptTurn[];
  codeSnapshot: string;
  /** Interview start (tnc_accepted_at) — used to re-seed the elapsed timer on resume. */
  startedAt: string | null;
  /** Interviewer-assigned room language (null = candidate chooses → editor is unlocked). */
  assignedLanguage: string | null;
  /** Total interview length in seconds — the room counts up and hard-stops at this. */
  durationSeconds: number;
  /** Dev/testing interview — the room allows paste (otherwise paste is blocked). */
  devMode: boolean;
  /** Last editor language persisted server-side; null if no run yet. */
  language: string | null;
  /** Most recent code-run output, so the output panel is restored on resume. */
  lastRunResult: RunResult | null;
}

export interface AnswerResponse {
  utterance: Utterance;
  phase: InterviewPhase;
  state: Record<string, unknown>;
  /** Set when the reply is an autonomous intervention (follow-up probe / accepted-offer hint) —
   *  the room styles it with the assist accent live, matching what a reload restores. */
  assist?: { kind: string; strength: number };
}

export interface RunResult {
  stdout: string;
  stderr: string;
  compileOutput: string;
  status: string;
  exitCode: number | null;
  timeMs: number | null;
  memoryKb: number | null;
  /** An autonomous interviewer hint triggered by this run (USP) — shown immediately in the chat;
   *  also persisted to the transcript, so it survives a reload. */
  intervention?: { text: string; kind: string };
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
  /** True when the interview didn't complete (no-show / dropout) — show "Incomplete", not a verdict. */
  incomplete?: boolean;
  /** True when the interview was cut off by the time limit — a real score, just annotated. */
  timeLimited?: boolean;
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
  /** Per-call timeout in ms. Defaults to 30 s; increase for slow backend routes. */
  timeoutMs?: number;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'POST', body, accessToken, timeoutMs = 30_000 } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Per-call timeout: an AbortController fires after `timeoutMs` so a blackholed
  // connection never leaves the room stuck forever with the composer disabled.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
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
  } catch (err: unknown) {
    // Surface a readable message so existing catch paths show their error UI.
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out — please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Interviewer endpoints ─────────────────────────────────────────────────────

/**
 * POST /api/interviews
 * Creates a new interview session. Requires the interviewer's Supabase access_token.
 */
export async function createInterview(
  accessToken: string,
  body: {
    candidateEmail: string;
    candidateName?: string;
    language?: string;
    level?: string;
    roleBrief?: string;
    devMode?: boolean;
  }
): Promise<CreateInterviewResponse> {
  return apiFetch<CreateInterviewResponse>('/api/interviews', {
    accessToken,
    body,
  });
}

/**
 * GET /api/me — whether the signed-in interviewer is a dev account (gates the dev-mode toggle).
 */
export async function getMe(accessToken: string): Promise<{ isDev: boolean }> {
  return apiFetch<{ isDev: boolean }>('/api/me', { method: 'GET', accessToken });
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
 * POST /api/interviews/:id/regenerate-invite-link
 * Rotates the invite token for a not-yet-started interview, returning a fresh link.
 * The previous token is immediately invalidated.
 */
export async function regenerateInviteLink(
  accessToken: string,
  id: string
): Promise<CreateInterviewResponse> {
  return apiFetch<CreateInterviewResponse>(`/api/interviews/${id}/regenerate-invite-link`, {
    accessToken,
    body: {},
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
/** Coding-phase control intent (mirrors the backend SubmitIntent). 'submit' locks the code and
 *  triggers the mandatory counter-question; 'move_on' is a firm forward skip; 'answer' (default) is
 *  a normal typed/voiced answer. */
export type SubmitIntent = 'answer' | 'submit' | 'move_on';

export async function answerInterview(
  id: string,
  token: string,
  answer: string,
  requestId?: string,
  intent: SubmitIntent = 'answer',
  submittedCode?: string
): Promise<AnswerResponse> {
  return apiFetch<AnswerResponse>(`/api/interviews/${id}/answer`, {
    body: {
      token,
      answer,
      ...(requestId ? { requestId } : {}),
      ...(intent !== 'answer' ? { intent } : {}),
      ...(submittedCode !== undefined ? { submittedCode } : {}),
    },
    // LLM turns legitimately take up to ~60-90 s; a 30 s default would timeout real turns.
    timeoutMs: 90_000,
  });
}

/**
 * POST /api/interviews/:id/run
 * Executes the candidate's code in the gVisor-sandboxed Docker executor.
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
    // Docker cold-starts can take ~30 s; give the executor a generous budget.
    timeoutMs: 60_000,
  });
}

/** The interviewer's response to an idle (stuck-not-running) candidate, or null to stay quiet. */
export interface NudgeResponse {
  intervention: { text: string; kind: string } | null;
}

/**
 * POST /api/interviews/:id/nudge (Path B — stuck-not-running)
 * Reports that the candidate has gone idle during coding (no keystroke + no run + not speaking for
 * a protected window). The server decides whether a gentle check-in is warranted (feature-flagged,
 * capped per question) and returns the utterance, or { intervention: null } to stay quiet.
 * `codeLength` only shapes the wording (blank vs partial) — no source is sent.
 */
export async function nudgeCandidate(
  id: string,
  token: string,
  codeLength: number
): Promise<NudgeResponse> {
  return apiFetch<NudgeResponse>(`/api/interviews/${id}/nudge`, {
    body: { token, codeLength },
  });
}

/**
 * POST /api/interviews/:id/finish
 * Marks the interview as complete. Idempotent.
 * `finalCode`/`finalLanguage` carry the last editor state so the backend can persist
 * it even if the candidate never hit Run or Submit (covers reload/crash/End/time-up).
 */
export async function finishInterview(
  id: string,
  token: string,
  finalCode?: string,
  finalLanguage?: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/interviews/${id}/finish`, {
    body: {
      token,
      ...(finalCode !== undefined ? { finalCode } : {}),
      ...(finalLanguage !== undefined ? { finalLanguage } : {}),
    },
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/interviews/:id/snapshot
 * Persists the current editor code as a lightweight autosave checkpoint.
 * Fire-and-forget (204 expected). Uses keepalive:true so in-flight requests survive
 * page unload (beforeunload / pagehide flush).
 * `seq` is a monotonic per-interview counter so the server can detect stale windows;
 * 429 responses are non-fatal (already swallowed by the raw-fetch .catch).
 */
export function snapshotCode(
  id: string,
  token: string,
  code: string,
  language: string,
  seq: number
): void {
  fetch(`${BASE_URL}/api/interviews/${id}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, code, language, seq }),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * POST /api/interviews/:id/proctor
 * Sends an aggregated proctoring signal window (fire-and-forget; swallows all errors).
 * NO camera frames or images are ever sent — only numeric aggregates.
 */
export function sendProctorSignal(
  id: string,
  token: string,
  signals: {
    windowMs: number;
    samples: number;
    faceAbsentMs: number;
    multiFaceMs: number;
    gazeOffMs: number;
    maxFaces: number;
  }
): void {
  // Fire-and-forget: proctoring must never block or surface errors to the candidate.
  fetch(`${BASE_URL}/api/interviews/${id}/proctor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...signals }),
  }).catch(() => undefined);
}

/**
 * POST /api/interviews/:id/speak (P1 — "the interviewer speaks")
 * Returns WAV audio for one sentence-chunk of the latest interviewer utterance (`source:'turn'`)
 * or the latest run-triggered hint (`source:'run'`), plus the total chunk count (X-Chunk-Count) so
 * the room can prefetch the rest in parallel and start playing fast. Returns null when voice is
 * off (503), there's nothing to say (404), or the chunk is out of range (204) — the room stays
 * silent and never surfaces an error for it.
 */
export async function speakChunk(
  id: string,
  token: string,
  source: 'turn' | 'run',
  chunk: number,
  text?: string
): Promise<{ blob: Blob; count: number } | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/interviews/${id}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, source, chunk, ...(text ? { text } : {}) }),
    });
    if (!res.ok || res.status === 204) return null;
    const count = Number(res.headers.get('X-Chunk-Count') || '1') || 1;
    return { blob: await res.blob(), count };
  } catch {
    return null; // voice is best-effort; never break the interview
  }
}

/**
 * POST /api/interviews/:id/speak-stream (P1-B — streaming TTS)
 * Streams the WHOLE latest interviewer utterance (`source:'turn'`) or run-hint (`source:'run'`)
 * as raw PCM16 mono audio (sample rate in the X-Sample-Rate header), chunked as Cartesia
 * synthesizes it — so the first audio arrives at ~TTFB. Returns the ok-checked Response so the
 * caller can read `response.body` progressively; null on any failure (voice off 503, nothing to
 * say 404, upstream 502, network/abort) — the caller falls back to the chunked speakChunk path.
 */
export async function speakStream(
  id: string,
  token: string,
  source: 'turn' | 'run',
  signal?: AbortSignal,
  text?: string
): Promise<Response | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/interviews/${id}/speak-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, source, ...(text ? { text } : {}) }),
      signal,
    });
    if (!res.ok || !res.body) return null;
    return res;
  } catch {
    return null; // voice is best-effort; never break the interview
  }
}

/** Candidate-safe coding problem (never includes hidden tests or the reference solution). */
export interface PublicProblem {
  slug: string;
  title: string;
  difficulty: string;
  statement: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string;
}

/**
 * POST /api/interviews/:id/coding-problem — the current coding problem for the room's problem panel.
 * Returns null on any failure (the room just hides the panel). `problem` is null outside the coding
 * phase or for legacy interviews with no assigned bank problem.
 */
export async function fetchCodingProblem(
  id: string,
  token: string
): Promise<{ codeIndex: number; total: number; problem: PublicProblem | null } | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/interviews/${id}/coding-problem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      codeIndex: number;
      total: number;
      problem: PublicProblem | null;
    };
  } catch {
    return null;
  }
}
