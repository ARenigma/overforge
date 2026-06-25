// REST routes for the interview lifecycle.
// Interviewer routes require a Supabase Bearer JWT.
// Candidate routes are validated via a single-use hashed access token.

import { Router, Request, Response } from 'express';
import { requireInterviewer, validateCandidate, isDevEmail } from './middleware';
import { enforceRateLimit } from './rate-limit';
import { hashToken } from '../interview/token';
import { SUPPORTED_LANGUAGES } from '../execution/docker';
import * as orchestrator from '../interview/orchestrator';
import { synthesize, isCartesiaConfigured } from '../voice/cartesia';

const router = Router();

const MAX_SOURCE_BYTES = 64 * 1024;

/** Helper: send a structured error response. */
function sendError(res: Response, err: unknown): void {
  const e = err as { status?: number; message?: string; retryAfterSec?: number };
  const status = e?.status ?? 500;
  if (e?.retryAfterSec) res.setHeader('Retry-After', String(e.retryAfterSec));
  const message = e?.message ?? 'Internal server error';
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

// ─────────────────────── POST /api/interviews/:id/cancel ───────────────────────
// Interviewer soft-cancel — keeps the row + transcript; the candidate's link stops working.

router.post(
  '/:id/cancel',
  requireInterviewer,
  async (req: Request, res: Response): Promise<void> => {
    try {
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
    const { token, answer, requestId } = req.body as {
      token?: string;
      answer?: string;
      requestId?: string;
    };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`answer:${hashToken(token ?? '')}`, { limit: 60, windowMs: 600_000 });

    if (typeof answer !== 'string' || answer.trim() === '') {
      res.status(400).json({ error: 'answer is required' });
      return;
    }

    const result = await orchestrator.submitAnswer(
      id,
      answer,
      typeof requestId === 'string' ? requestId : undefined
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
    const { token, language, source, stdin } = req.body as {
      token?: string;
      language?: string;
      source?: string;
      stdin?: string;
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

    const result = await orchestrator.recordRun(id, { language, source, stdin });
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
    const { token, source } = req.body as { token?: string; source?: 'turn' | 'run' };

    await validateCandidate(id, token ?? '');
    await enforceRateLimit(`speak:${hashToken(token ?? '')}`, {
      limit: 80,
      windowMs: 600_000,
      message: 'Too many speech requests; please slow down.',
    });

    if (!isCartesiaConfigured()) {
      res.status(503).json({ error: 'Voice is not enabled for this interview.' });
      return;
    }

    const text = await orchestrator.latestSpeakable(id, source === 'run' ? 'run' : 'turn');
    if (!text) {
      res.status(404).json({ error: 'Nothing to speak yet.' });
      return;
    }

    const audio = await synthesize(text);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/finish ───────────────────────

router.post('/:id/finish', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token } = req.body as { token?: string };

    await validateCandidate(id, token ?? '');

    await orchestrator.finishAndScore(id);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

export { router as interviewsRouter };
