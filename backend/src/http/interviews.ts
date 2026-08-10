// REST routes for the interview lifecycle.
// Interviewer routes require a Supabase Bearer JWT.
// Candidate routes are validated via a single-use hashed access token.

import { Router, Request, Response } from 'express';
import { requireInterviewer, validateCandidate, isDevEmail } from './middleware';
import { enforceRateLimit } from './rate-limit';
import { hashToken } from '../interview/token';
import type { SubmitIntent, InterviewContext } from '../interview/types';
import { ingestSnapshot } from '../interview/engagement';
import { SUPPORTED_LANGUAGES } from '../execution/docker';
import * as orchestrator from '../interview/orchestrator';
import {
  getById,
  recordVoiceTurn,
  recordProctorSignal,
  recordIntegritySignal,
  INTEGRITY_SIGNAL_KINDS,
  updateInterview,
} from '../db/interviews';
import { validateSpeakText, GOODBYE_LINE } from './speak-validation';
import { captureException } from '../observability/sentry';
import { recordTtsCost } from '../cost/ledger';
import {
  synthesize,
  synthesizeStream,
  synthesizeStreamSentences,
  isTtsConfigured,
  splitSentences,
  STREAM_SAMPLE_RATE,
  prewarmTts,
  hasPriorWarmSocket,
  activeTtsProvider,
} from '../voice/tts';
import type { RunResult } from '../execution/types';

const router = Router();

const MAX_SOURCE_BYTES = 64 * 1024;

// Maximum code size for the snapshot route (generous; typical submissions are well under 64 KB).
const MAX_SNAPSHOT_BYTES = 100_000;

// Module-level LRU cache for /run deduplication. Maps interviewId → {requestId, result} so
// a client retry (lost response) gets the exact same run result without re-executing. Capped
// at 1000 entries; oldest entry is evicted when the cap is reached.
const runDedupeCache = new Map<string, { requestId: string; result: RunResult }>();
const RUN_DEDUPE_MAX = 1000;

/**
 * Resolve the text to synthesise for /speak and /speak-stream.
 *
 * When the client supplies a `providedText`, it is accepted ONLY when it exactly matches
 * (trimmed) one of:
 *   (a) the latest interviewer transcript turn,
 *   (b) the latest run-hint intervention text, or
 *   (c) one of the voice idle-probe lines (voice-only, never persisted).
 *
 * This prevents the route from being used as a free TTS oracle (Cartesia credit abuse) and
 * enforces the server-authoritative invariant that only the server can decide what gets spoken.
 *
 * When no `providedText` is supplied, falls back to the server's latest speakable utterance
 * (original behaviour).
 *
 * Throws 409 for cancelled/expired interviews; 422 on a text mismatch.
 */
async function resolveSpeakText(
  id: string,
  providedText: unknown,
  source: 'turn' | 'run'
): Promise<string | null> {
  if (typeof providedText !== 'string' || !providedText.trim()) {
    // No client text — fall back to the server-side latest speakable (original behaviour).
    return orchestrator.latestSpeakable(id, source);
  }

  const trimmed = providedText.trim();

  // Fetch the interview to verify status and extract the server-authoritative reference texts.
  const interview = await getById(id);
  if (!interview) {
    throw Object.assign(new Error(`Interview ${id} not found`), { status: 404 });
  }

  const turnText =
    [...(interview.transcript ?? [])]
      .reverse()
      .find((t) => t.role === 'interviewer')
      ?.text?.trim() ?? null;
  const runText =
    [...(interview.code_runs ?? [])]
      .reverse()
      .find((r) => r.intervention?.text?.trim())
      ?.intervention?.text?.trim() ?? null;

  // Throws 409 / 422 on rejection; logs length (never the text itself — candidate-influenced).
  validateSpeakText(trimmed, interview.status, turnText, runText);
  return trimmed;
}

/** Helper: send a structured error response. */
function sendError(res: Response, err: unknown): void {
  const e = err as { status?: number; message?: string; retryAfterSec?: number };
  const status = e?.status ?? 500;
  if (e?.retryAfterSec) res.setHeader('Retry-After', String(e.retryAfterSec));
  // Only surface messages from errors we constructed deliberately (they carry a `status` and a safe
  // message). For unexpected, status-less throws — e.g. an upstream Cartesia error whose message
  // embeds the vendor name + raw response body — log the real error and return a generic message, so
  // infrastructure/vendor detail never leaks to the candidate's browser. Capture to Sentry so these
  // unexpected errors are observable even when DSN is unset (captureException is a no-op then).
  if (e?.status === undefined) {
    console.error('[interviews] unexpected error:', err);
    captureException(err);
  }
  const message = e?.status !== undefined && e?.message ? e.message : 'Internal server error';
  res.status(status).json({ error: message });
}

// ─────────────────────── POST /api/interviews ───────────────────────

router.post('/', requireInterviewer, async (req: Request, res: Response): Promise<void> => {
  try {
    const { candidateEmail, candidateName, language, level, roleBrief, devMode } = req.body as {
      candidateEmail?: string;
      candidateName?: string;
      language?: string;
      level?: string;
      roleBrief?: string;
      devMode?: boolean;
    };

    if (!candidateEmail || !candidateEmail.includes('@')) {
      res.status(400).json({ error: 'candidateEmail is required and must be a valid email' });
      return;
    }

    // Optional assigned language: a supported language locks the room to it; anything else
    // (omitted / 'any' / unknown) means "candidate chooses".
    const assignedLanguage =
      typeof language === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(language)
        ? language
        : null;

    // Optional seniority level (calibrates questions + grading); unknown/omitted → DB default 'mid'.
    const INTERVIEW_LEVELS = ['junior', 'mid', 'senior', 'staff'];
    const interviewLevel =
      typeof level === 'string' && INTERVIEW_LEVELS.includes(level) ? level : undefined;

    // Optional role/JD context (free text), capped. Tailors questions + grading.
    const trimmedBrief =
      typeof roleBrief === 'string' && roleBrief.trim() ? roleBrief.trim().slice(0, 4000) : null;

    // Dev mode is server-authoritative: only honored for a DEV_EMAILS account, never the client's
    // say-so — so a real interview can never enable paste / the short test duration.
    const isDevInterview = devMode === true && isDevEmail(req.userEmail);

    await enforceRateLimit(`create:${req.userId}`, {
      limit: 30,
      windowMs: 3_600_000,
      message: 'Interview creation limit reached. Please try again later.',
    });

    const result = await orchestrator.createInterview({
      interviewerId: req.userId!,
      candidateEmail,
      candidateName,
      assignedLanguage,
      level: interviewLevel,
      roleBrief: trimmedBrief,
      devMode: isDevInterview,
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/interview/${result.id}?t=${result.token}`;

    res.status(201).json({ id: result.id, token: result.token, link, expiresAt: result.expiresAt });
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/regenerate-invite-link ───────────────────────
// Interviewer-only: rotate the invite token for an 'invited' (not-yet-started) interview.
// Returns a fresh link; the previous token is immediately invalidated.

router.post(
  '/:id/regenerate-invite-link',
  requireInterviewer,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await enforceRateLimit(`regen:${req.userId}`, { limit: 10, windowMs: 3_600_000 });
      const result = await orchestrator.regenerateInvite(req.params.id, req.userId!);
      res.json({
        id: result.id,
        token: result.token,
        link: result.link,
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────── POST /api/interviews/:id/cancel ───────────────────────
// Interviewer soft-cancel — keeps the row + transcript; the candidate's link stops working.

router.post(
  '/:id/cancel',
  requireInterviewer,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await enforceRateLimit(`cancel:${req.userId}`, { limit: 30, windowMs: 3_600_000 });
      await orchestrator.cancelInterview(req.params.id, req.userId!);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────── DELETE /api/interviews/:id ───────────────────────
// Interviewer hard-delete (erasure) — removes the interview and all of its data.

router.delete('/:id', requireInterviewer, async (req: Request, res: Response): Promise<void> => {
  try {
    await enforceRateLimit(`delete:${req.userId}`, { limit: 30, windowMs: 3_600_000 });
    await orchestrator.deleteInterview(req.params.id, req.userId!);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/rescore ───────────────────────
// Interviewer re-runs scoring (recovers a stuck 'completed' / retries a failed scorecard).

router.post(
  '/:id/rescore',
  requireInterviewer,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await enforceRateLimit(`rescore:${req.userId}`, { limit: 10, windowMs: 3_600_000 });
      await orchestrator.rescore(req.params.id, req.userId!);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────── POST /api/interviews/:id/begin ───────────────────────

router.post('/:id/begin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, tncAccepted } = req.body as { token?: string; tncAccepted?: boolean };

    await enforceRateLimit(`begin:${req.ip}`, { limit: 20, windowMs: 600_000 });
    await validateCandidate(id, token ?? '');

    // Pre-warm the TTS WebSocket before the brain generates the greeting (~1–2 s LLM call).
    // Fire-and-forget: never throws, never blocks the response.
    prewarmTts();

    const result = await orchestrator.begin(id, { tncAccepted: tncAccepted === true });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/state ───────────────────────
// Candidate UI rehydration after a reload — read-only snapshot, token-authenticated.

router.post('/:id/state', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token } = req.body as { token?: string };

    await enforceRateLimit(`state:${req.ip}`, { limit: 120, windowMs: 600_000 });
    await validateCandidate(id, token ?? '');

    const state = await orchestrator.getCandidateState(id);
    res.json(state);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/answer ───────────────────────

router.post('/:id/answer', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, answer, requestId, intent, submittedCode } = req.body as {
      token?: string;
      answer?: string;
      requestId?: string;
      intent?: string;
      submittedCode?: string;
    };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`answer:${hashToken(token ?? '')}`, { limit: 60, windowMs: 600_000 });

    // Validate the coding-control intent. Unknown/absent ⇒ 'answer' (a normal typed/voiced answer).
    const validIntent: SubmitIntent =
      intent === 'submit' || intent === 'move_on' ? intent : 'answer';
    const explicit = validIntent !== 'answer';

    // M4: SUBMIT / MOVE-ON are button actions with no required free-text — accept an empty body (the
    // orchestrator synthesizes a neutral transcript line + anchors on submittedCode). A normal answer
    // still requires text.
    if (!explicit && (typeof answer !== 'string' || answer.trim() === '')) {
      res.status(400).json({ error: 'answer is required' });
      return;
    }

    // Extra rate limit on MOVE-ON so a candidate can't machine-gun-skip every problem.
    if (validIntent === 'move_on') {
      await enforceRateLimit(`moveon:${hashToken(token ?? '')}`, { limit: 4, windowMs: 600_000 });
    }

    // Pre-warm the TTS WebSocket while the brain processes the answer (oracle_ms ≈ 872–1590 ms
    // measured in prod). By the time /speak-stream is called, the socket should be warm.
    // Fire-and-forget: never throws, never blocks the response.
    prewarmTts();

    const result = await orchestrator.submitAnswer(
      id,
      typeof answer === 'string' ? answer : '',
      typeof requestId === 'string' ? requestId : undefined,
      validIntent,
      typeof submittedCode === 'string' ? submittedCode : undefined
    );
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/run ───────────────────────

router.post('/:id/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, language, source, stdin, requestId } = req.body as {
      token?: string;
      language?: string;
      source?: string;
      stdin?: string;
      requestId?: string;
    };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`run:${hashToken(token ?? '')}`, {
      limit: 30,
      windowMs: 600_000,
      message: 'Too many code runs; please slow down.',
    });

    if (!language || !source) {
      res.status(400).json({ error: 'language and source are required' });
      return;
    }

    if (source.length > MAX_SOURCE_BYTES) {
      res.status(413).json({ error: 'Source is too large (max 64 KB).' });
      return;
    }

    // Idempotency: if this exact requestId was already processed (lost response + client retry),
    // return the cached result without re-executing. Single-slot per interviewId; safe for the
    // single-process backend. The cache is module-level, not interview-locked, because a
    // duplicate /run never changes DB state — it's purely a response-replay.
    if (typeof requestId === 'string' && requestId) {
      const cached = runDedupeCache.get(id);
      if (cached?.requestId === requestId) {
        res.json(orchestrator.stripHiddenTests(cached.result));
        return;
      }
    }

    const result = await orchestrator.recordRun(id, { language, source, stdin });

    // Cache the result for dedup. Evict the oldest entry when the cap is reached.
    if (typeof requestId === 'string' && requestId) {
      if (runDedupeCache.size >= RUN_DEDUPE_MAX) {
        const firstKey = runDedupeCache.keys().next().value;
        if (firstKey !== undefined) runDedupeCache.delete(firstKey);
      }
      runDedupeCache.set(id, { requestId, result });
    }

    // Never leak hidden-test correctness to the candidate live — they see only their own
    // stdout/stderr + any interviewer hint. testResults is persisted server-side for grading + hints.
    res.json(orchestrator.stripHiddenTests(result));
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/snapshot ───────────────────────
// Candidate keepalive — persists the current editor code (and optionally language) without
// triggering a code run or touching the FSM. Used by the room to save in-progress code so
// a reload doesn't lose work. Auth: validateCandidate. Rate-limited (30/min per interview).
// Only open during an in_progress interview in the coding phase. Responds 204 on success.
// Accepts normal JSON (also works for beacon/keepalive — no custom headers required).

router.post('/:id/snapshot', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      token,
      code,
      language,
      seq: seqBody,
    } = req.body as {
      token?: string;
      code?: unknown;
      language?: unknown;
      seq?: unknown;
    };

    await validateCandidate(id, token ?? '');
    // Rate limit raised 30→60/min per §6.1 (leading-edge throttle sends up to ~20/min normally;
    // 60/min is the burst ceiling so a 429-dropped window counts as unknown activity, not quiescence).
    await enforceRateLimit(`snapshot:${id}`, { limit: 60, windowMs: 60_000 });

    // Validate `code` — required, must be a string, and within the size limit.
    // Empty code is accepted (§6.1): the candidate may have cleared their editor.
    if (typeof code !== 'string') {
      res.status(400).json({ error: 'code is required and must be a string' });
      return;
    }
    if (code.length > MAX_SNAPSHOT_BYTES) {
      res.status(413).json({ error: 'code is too large (max 100 KB).' });
      return;
    }

    // Guard: only open during an active in_progress interview in the coding phase.
    const interview = await getById(id);
    if (!interview) {
      res.status(404).json({ error: 'Interview not found' });
      return;
    }
    if (interview.status !== 'in_progress') {
      res.status(409).json({ error: 'Interview is not in progress' });
      return;
    }
    const ctx = interview.fsm_state as InterviewContext;
    if (ctx.phase !== 'coding') {
      res.status(409).json({ error: 'Code snapshots are only accepted during the coding phase' });
      return;
    }

    // Monotonic seq: reject stale snapshots silently (§6.1). A stale seq also guards against
    // a late-arriving client snapshot clobbering a newer run-written code_snapshot.
    const seq =
      typeof seqBody === 'number' && Number.isInteger(seqBody) && seqBody >= 0
        ? seqBody
        : undefined;

    // Feed the engagement engine. Returns { accepted: false } for a stale seq — respond 204
    // without writing to the DB so the run-written snapshot is never overwritten by an
    // out-of-order client flush. milestoneCrossed signals the first structural-code milestone.
    const { accepted, milestoneCrossed } = ingestSnapshot(id, { seq, codeIndex: ctx.codeIndex, code });
    if (!accepted) {
      res.status(204).end();
      return;
    }

    // Persist — same column /run uses (code_snapshot). Language is optional; only written when
    // provided and is a string (no migration needed — code_language already exists).
    const patch: Parameters<typeof updateInterview>[1] = { code_snapshot: code };
    if (typeof language === 'string' && language) {
      patch.code_language = language;
    }
    await updateInterview(id, patch);

    // Milestone probe (ENGAGEMENT_INTERVENTIONS): fire-and-forget when the candidate first
    // writes substantive structure (function/loop/data-structure) for this coding problem.
    // Never awaited — failure is logged; the response is already returning 204.
    if (milestoneCrossed) {
      void orchestrator.nudgeMilestoneProbe(id).catch((err: unknown) => {
        console.error(`[milestone] probe failed for ${id}:`, err);
      });
    }

    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/nudge ───────────────────────
// Path B (stuck-not-running): the room's compound-idle detector reports that the candidate has
// gone idle during coding (no keystroke + no run + not speaking for a protected window). The
// server decides whether a gentle check-in is warranted (feature flag + per-question cap + gates)
// and returns the utterance, or { intervention: null } to stay quiet. Candidate-token auth,
// bounded rate limit. `codeLength` only shapes the wording (blank vs partial) — no source is sent.

router.post('/:id/nudge', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, codeLength, reason } = req.body as {
      token?: string;
      codeLength?: number;
      reason?: string;
    };

    await validateCandidate(id, token ?? '');
    // Bounded: the client throttles to one poll per idle window; the server caps at one nudge per
    // question. This limit is a generous backstop against a misbehaving client, never the real gate.
    await enforceRateLimit(`nudge:${hashToken(token ?? '')}`, {
      limit: 8,
      windowMs: 600_000,
      message: 'Too many check-in requests; please slow down.',
    });

    const validReason: 'idle' | 'quiescent' = reason === 'quiescent' ? 'quiescent' : 'idle';
    const result = await orchestrator.nudgeInterview(
      id,
      typeof codeLength === 'number' ? codeLength : 0,
      validReason
    );
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/run-intervention ───────────────────────
// Async run-wording poll (§6 item 5). The /run response carries interventionPending:true when the
// async path is active; the frontend polls here until pending:false. Rate-limited 30/10min.
// Response: { intervention: {text, kind} | null, pending: boolean }
// pending:true  = wording still in-flight (retry)
// pending:false = server decided (intervention present or null = no intervention)

router.post('/:id/run-intervention', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token } = req.body as { token?: string };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`runiv:${hashToken(token ?? '')}`, {
      limit: 30,
      windowMs: 600_000,
      message: 'Too many run-intervention requests; please slow down.',
    });

    const pending = orchestrator.getPendingRunIntervention(id);
    if (!pending || pending.status === 'none') {
      res.json({ intervention: null, pending: false });
      return;
    }
    if (pending.status === 'pending') {
      res.json({ intervention: null, pending: true });
      return;
    }
    // status === 'ready'
    res.json({ intervention: pending.intervention ?? null, pending: false });
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/coding-problem ───────────────────────
// The candidate's room fetches the CURRENT coding problem (statement/examples/constraints — NEVER
// hidden tests or the reference solution) to render the problem panel. Candidate-token auth.

router.post('/:id/coding-problem', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token } = req.body as { token?: string };
    await validateCandidate(id, token ?? '');
    const result = await orchestrator.currentCodingProblem(id);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/speak ───────────────────────
// Candidate TTS for P1 ("the interviewer speaks"). Server-authoritative: voices the LATEST
// interviewer transcript turn (never client-supplied text), so it can't be used as a free TTS
// oracle. Returns WAV audio; the room plays it. Voice OFF (503) when Cartesia isn't configured —
// the room silently stays text-only.

router.post('/:id/speak', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      token,
      source,
      chunk,
      text: providedText,
    } = req.body as {
      token?: string;
      source?: 'turn' | 'run';
      chunk?: number;
      text?: unknown;
    };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`speak:${hashToken(token ?? '')}`, {
      limit: 160, // chunked mode makes several small requests per turn
      windowMs: 600_000,
      message: 'Too many speech requests; please slow down.',
    });

    if (!isTtsConfigured()) {
      res.status(503).json({ error: 'Voice is not enabled for this interview.' });
      return;
    }

    // Resolve + validate the text to speak. `resolveSpeakText` accepts the client-supplied text
    // only when it exactly matches a server-authoritative utterance (latest transcript turn, run
    // hint, or a voice idle-probe line); otherwise it falls back to the server's latest speakable.
    // Throws 409 for cancelled/expired or 422 on a text mismatch — preventing this route from
    // being used as a free Cartesia TTS oracle.
    const text = await resolveSpeakText(id, providedText, source === 'run' ? 'run' : 'turn');
    if (!text) {
      res.status(404).json({ error: 'Nothing to speak yet.' });
      return;
    }

    // Chunked mode: synthesize ONE sentence so the room can start playing in ~1–2s. The room
    // reads the total from X-Chunk-Count (CORS-exposed) and prefetches the rest in parallel.
    let toSpeak = text;
    if (typeof chunk === 'number' && Number.isInteger(chunk) && chunk >= 0) {
      const parts = splitSentences(text);
      if (chunk >= parts.length) {
        res.status(204).end();
        return;
      }
      res.setHeader('X-Chunk-Count', String(parts.length));
      res.setHeader('Access-Control-Expose-Headers', 'X-Chunk-Count');
      toSpeak = parts[chunk];
    }

    const audio = await synthesize(toSpeak);
    recordTtsCost(id, toSpeak.length);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/speak-stream ───────────────────────
// Streaming TTS (P1-B): synthesizes the utterance the turn cue carried (`text`, authoritative for
// this turn — required for the voice-service-only idle probe that is never persisted), else falls
// back to the latest interviewer turn / run-hint. Audio is PROXIED CHUNK-BY-CHUNK from
// Cartesia's SSE endpoint as raw pcm_s16le mono @ STREAM_SAMPLE_RATE, so the room's first audio
// lands at ~TTFB instead of after full-sentence synthesis. One request per utterance.
// Upstream failure BEFORE the first byte → 502 JSON (the room falls back to the chunked /speak
// path); after the first byte → the response just ends (the room plays what it got).

router.post('/:id/speak-stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      token,
      source,
      text: providedText,
    } = req.body as { token?: string; source?: 'turn' | 'run'; text?: unknown };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`speakstream:${hashToken(token ?? '')}`, {
      limit: 60, // one request per interviewer turn
      windowMs: 600_000,
      message: 'Too many speech requests; please slow down.',
    });

    if (!isTtsConfigured()) {
      res.status(503).json({ error: 'Voice is not enabled for this interview.' });
      return;
    }

    // Resolve + validate the text to speak — same validation as /speak: accepts client text only
    // when it matches a server utterance or a voice idle-probe line; falls back to the server's
    // latest speakable when no text is provided. Throws 409/422 on rejection.
    const text = await resolveSpeakText(id, providedText, source === 'run' ? 'run' : 'turn');
    if (!text) {
      res.status(404).json({ error: 'Nothing to speak yet.' });
      return;
    }

    recordTtsCost(id, text.length);

    // Task 3: record pre-warm hit/miss BEFORE acquiring the socket so the check is accurate.
    const prewarmHit = hasPriorWarmSocket();

    // Task 2: sentence streaming for Grok — send each sentence as a separate text.delta/text.done
    // pair on one pooled socket so the first sentence's audio arrives before Grok finishes
    // synthesising the full utterance. Controlled by GROK_SENTENCE_STREAMING (default ON).
    // Non-Grok providers fall back to synthesizeStreamSentences' Cartesia path (unchanged).
    const useSentenceStreaming = process.env.GROK_SENTENCE_STREAMING !== '0';
    const sentences = splitSentences(text);
    const stream: AsyncGenerator<Buffer, void, void> =
      useSentenceStreaming && activeTtsProvider() === 'grok' && sentences.length > 1
        ? synthesizeStreamSentences(sentences)
        : synthesizeStream(text);

    // If the candidate disconnects mid-stream, stop pulling from TTS (releases the upstream
    // connection via the generator's finally).
    res.on('close', () => {
      if (!res.writableEnded) void stream.return(undefined);
    });

    let started = false;
    try {
      for await (const chunk of stream) {
        if (res.destroyed || res.writableEnded) break;
        if (!started) {
          started = true;
          // Task 3: log pre-warm hit/miss + sentence count on first audio byte for prod telemetry.
          console.info(
            JSON.stringify({
              event: 'tts.prewarm',
              interviewId: id,
              prewarmHit,
              sentenceStreaming: useSentenceStreaming && activeTtsProvider() === 'grok',
              sentenceCount: sentences.length,
              ts: Date.now(),
            })
          );
          res.status(200);
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('X-Sample-Rate', String(STREAM_SAMPLE_RATE));
          res.setHeader('Access-Control-Expose-Headers', 'X-Sample-Rate');
          res.setHeader('Cache-Control', 'no-store');
        }
        if (!res.write(chunk)) {
          // Respect backpressure; also wake on close so a vanished client can't wedge the loop.
          await new Promise<void>((resolve) => {
            const onDrain = (): void => {
              res.off('close', onClose);
              resolve();
            };
            const onClose = (): void => {
              res.off('drain', onDrain);
              resolve();
            };
            res.once('drain', onDrain);
            res.once('close', onClose);
          });
        }
      }
      res.end();
    } catch (err) {
      if (!started) {
        // Nothing sent yet — a clean JSON error the room can react to (it falls back to /speak).
        // Never leak the vendor error body to the candidate's browser.
        console.error('[interviews] speak-stream upstream error:', err);
        res.status(502).json({ error: 'Voice synthesis failed.' });
      } else {
        // Headers + audio already flowing — just end; the room plays what arrived.
        console.error('[interviews] speak-stream ended mid-stream:', err);
        res.end();
      }
    }
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/finish ───────────────────────

router.post('/:id/finish', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, finalCode, finalLanguage } = req.body as {
      token?: string;
      finalCode?: unknown;
      finalLanguage?: unknown;
    };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`finish:${hashToken(token ?? '')}`, { limit: 10, windowMs: 600_000 });

    // Optional final code snapshot — persisted before scoring so the scorer and dashboard see
    // the candidate's terminal code (not a potentially stale /run snapshot).
    let validatedCode: string | undefined;
    let validatedLanguage: string | undefined;
    if (typeof finalCode === 'string' && finalCode.length > 0) {
      if (finalCode.length > MAX_SNAPSHOT_BYTES) {
        res.status(413).json({ error: 'finalCode is too large (max 100 KB).' });
        return;
      }
      validatedCode = finalCode;
    }
    if (typeof finalLanguage === 'string' && finalLanguage) {
      validatedLanguage = finalLanguage;
    }

    await orchestrator.finishAndScore(id, {
      ...(validatedCode !== undefined ? { finalCode: validatedCode } : {}),
      ...(validatedLanguage !== undefined ? { finalLanguage: validatedLanguage } : {}),
      endReason: 'candidate_ended',
    });
    res.json({ ok: true, goodbye: GOODBYE_LINE });
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/voice-turn ───────────────────────
// Durable sink for per-turn voice pipeline telemetry emitted by the Python voice service.
// The voice service has no Supabase credentials; it POSTs here and the backend (which owns
// the service-role client) writes the row.  Best-effort: the voice side fires-and-forgets,
// so a 500 here is harmless.  Rate-limited to 120 req/10 min per token (≈ one per turn).

// The EOT "commit kind" the voice service reports per turn. These are the endpointer/stream
// reasons a turn was committed — NOT the phase (false-fire / hallucination / done are phases).
// assemblyai_eot MUST be here or the AAI streaming path's telemetry is silently 400-rejected;
// soniox_eot covers the dev-only alternate-primary shadow path.
const VALID_COMMITS = new Set([
  'smartturn',
  'backstop',
  'maxlen',
  'assemblyai_eot',
  'soniox_eot',
  'idle_probe',
]);

// Candidate speech can be long; cap stored transcripts so a runaway turn can't bloat a telemetry
// row. Generous — a normal spoken answer is well under this.
const MAX_TRANSCRIPT_CHARS = 4000;

router.post('/:id/voice-turn', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      token,
      requestId,
      commit,
      audioS,
      sttMs,
      oracleMs,
      ttsMs,
      gapMs,
      phase,
      empty,
      terminal,
      primaryTranscript,
      shadowEngine,
      shadowTranscript,
      shadowSttMs,
      shadowEndpointMs,
      shadowEndpointCount,
      firstAudioMs,
      speakerCount,
      nonPrimarySpeakerMs,
    } = req.body as {
      token?: string;
      requestId?: string;
      commit?: string;
      audioS?: unknown;
      sttMs?: unknown;
      oracleMs?: unknown;
      ttsMs?: unknown;
      gapMs?: unknown;
      phase?: string;
      empty?: unknown;
      terminal?: unknown;
      primaryTranscript?: unknown;
      shadowEngine?: unknown;
      shadowTranscript?: unknown;
      shadowSttMs?: unknown;
      shadowEndpointMs?: unknown;
      shadowEndpointCount?: unknown;
      firstAudioMs?: unknown;
      speakerCount?: unknown;
      nonPrimarySpeakerMs?: unknown;
    };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`voiceturn:${hashToken(token ?? '')}`, {
      limit: 120,
      windowMs: 600_000,
    });

    if (typeof commit !== 'string' || !VALID_COMMITS.has(commit)) {
      res.status(400).json({ error: `commit must be one of: ${[...VALID_COMMITS].join(', ')}` });
      return;
    }

    // Coerce numeric fields: accept number or null/undefined; reject non-finite values → null.
    const toNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isFinite(n) ? Math.max(0, n) : null;
    };
    // firstAudioMs extra bounds: must be strictly > 0 and < 120 000 ms (finite already via toNum).
    const toFirstAudioMs = (v: unknown): number | null => {
      const n = toNum(v);
      if (n == null || n === 0 || n >= 120_000) return null;
      return n;
    };
    // Transcript fields: accept strings only, length-capped; anything else → null.
    const toText = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      return v.slice(0, MAX_TRANSCRIPT_CHARS);
    };

    await recordVoiceTurn(id, {
      requestId: typeof requestId === 'string' ? requestId : null,
      commit,
      audioS: toNum(audioS),
      sttMs: toNum(sttMs),
      oracleMs: toNum(oracleMs),
      ttsMs: toNum(ttsMs),
      gapMs: toNum(gapMs),
      phase: typeof phase === 'string' ? phase : null,
      empty: empty === true,
      terminal: terminal === true,
      primaryTranscript: toText(primaryTranscript),
      shadowEngine: typeof shadowEngine === 'string' ? shadowEngine.slice(0, 32) : null,
      shadowTranscript: toText(shadowTranscript),
      shadowSttMs: toNum(shadowSttMs),
      shadowEndpointMs: toNum(shadowEndpointMs),
      shadowEndpointCount: (() => {
        const n = toNum(shadowEndpointCount);
        return n == null ? null : Math.round(n);
      })(),
      firstAudioMs: toFirstAudioMs(firstAudioMs),
    });

    // Second-voice integrity signal: when shadow diarization detected >1 speaker in this turn,
    // write an advisory integrity_signals row. Best-effort — a write failure must never break
    // the turn (the voice service fires-and-forgets the telemetry POST).
    const speakerCountNum = toNum(speakerCount);
    if (speakerCountNum !== null && speakerCountNum > 1) {
      try {
        await recordIntegritySignal(id, {
          kind: 'second_voice',
          durationMs: toNum(nonPrimarySpeakerMs),
          detail: { speaker_count: Math.round(speakerCountNum) },
        });
      } catch (integrityErr) {
        console.error(
          '[voice-turn] second_voice integrity signal write failed (non-fatal):',
          integrityErr
        );
      }
    }

    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/proctor ───────────────────────
// Durable sink for per-window camera proctoring signals emitted by the frontend.
// The frontend proctoring module has no Supabase credentials; it POSTs here and
// the backend (which owns the service-role client) writes the row.  Best-effort:
// the frontend fires-and-forgets, so a 500 here is harmless.  Rate-limited to
// 240 req/10 min per token (≈ one per 2.5-second window over a 60-min session).

router.post('/:id/proctor', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, windowMs, samples, faceAbsentMs, multiFaceMs, gazeOffMs, maxFaces } =
      req.body as {
        token?: string;
        windowMs?: unknown;
        samples?: unknown;
        faceAbsentMs?: unknown;
        multiFaceMs?: unknown;
        gazeOffMs?: unknown;
        maxFaces?: unknown;
      };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`proctor:${hashToken(token ?? '')}`, {
      limit: 240,
      windowMs: 600_000,
    });

    // Coerce numeric fields: accept number or null/undefined; clamp negatives to 0.
    const toInt = (v: unknown): number => {
      if (v == null) return 0;
      const n = Number(v);
      return isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    };

    await recordProctorSignal(id, {
      windowMs: toInt(windowMs),
      samples: toInt(samples),
      faceAbsentMs: toInt(faceAbsentMs),
      multiFaceMs: toInt(multiFaceMs),
      gazeOffMs: toInt(gazeOffMs),
      maxFaces: toInt(maxFaces),
    });

    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/integrity-signal ───────────────────────
// Durable sink for discrete integrity signals emitted by the browser proctoring module.
// The frontend has no Supabase credentials; it POSTs here and the backend writes the row.
// Best-effort: fires-and-forgets, so a 500 is harmless. Rate-limited 60 req/10 min per token
// (conservative — these are discrete events, not per-window aggregates like /proctor).
// Currently only 'second_voice' is wired (from the /voice-turn path). This route is the
// future entry-point for browser-side signals: blur, hidden, fullscreen_exit, paste_blocked,
// multi_monitor — none of those are wired to a client yet (see docs/GATED_FEATURES.md).

router.post('/:id/integrity-signal', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, kind, durationMs, detail } = req.body as {
      token?: string;
      kind?: unknown;
      durationMs?: unknown;
      detail?: unknown;
    };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`integrity:${hashToken(token ?? '')}`, {
      limit: 60,
      windowMs: 600_000,
    });

    // Validate kind against the allowed enum (same set as the DB CHECK constraint).
    if (typeof kind !== 'string' || !INTEGRITY_SIGNAL_KINDS.has(kind as never)) {
      res.status(400).json({
        error: `kind must be one of: ${[...INTEGRITY_SIGNAL_KINDS].join(', ')}`,
      });
      return;
    }

    // Coerce numeric durationMs.
    const toNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isFinite(n) ? Math.max(0, n) : null;
    };

    // Validate detail: must be a plain object if present; reject oversized payloads.
    let safeDetail: Record<string, unknown> | undefined;
    if (detail != null) {
      if (typeof detail !== 'object' || Array.isArray(detail)) {
        res.status(400).json({ error: 'detail must be a plain object' });
        return;
      }
      if (JSON.stringify(detail).length > 2048) {
        res.status(413).json({ error: 'detail is too large (max 2 KB)' });
        return;
      }
      safeDetail = detail as Record<string, unknown>;
    }

    await recordIntegritySignal(id, {
      kind,
      durationMs: toNum(durationMs),
      detail: safeDetail,
    });

    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── GET /api/interviews/:id/spectate ───────────────────────
// Interviewer read-only spectate view. The owning interviewer (interviewer_id must match
// req.userId) can poll this while a candidate's interview is live: it returns phase/status,
// the tag-stripped transcript, the current coding problem (public fields only — never hidden
// tests or the reference solution), the latest code snapshot + language, elapsed/remaining time,
// and the last run's status. Strictly read-only: no FSM mutation, no token issuance, no side
// effects. Rate-limited to 120 per 10 min per user (safe polling cadence of ~3s). Returns 409
// when the interview is still 'invited' (not started yet) so the UI can say "not started yet".

router.get('/:id/spectate', requireInterviewer, async (req: Request, res: Response): Promise<void> => {
  try {
    await enforceRateLimit(`spectate:${req.userId}`, { limit: 120, windowMs: 600_000 });
    const view = await orchestrator.getSpectateView(req.params.id, req.userId!);
    res.json(view);
  } catch (err) {
    sendError(res, err);
  }
});

export { router as interviewsRouter };
