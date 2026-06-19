// REST routes for the interview lifecycle.
// Interviewer routes require a Supabase Bearer JWT.
// Candidate routes are validated via a single-use hashed access token.

import { Router, Request, Response } from 'express';
import { requireInterviewer, validateCandidate } from './middleware';
import * as orchestrator from '../interview/orchestrator';

const router = Router();

/** Helper: send a structured error response. */
function sendError(res: Response, err: unknown): void {
  const e = err as { status?: number; message?: string };
  const status = e?.status ?? 500;
  const message = e?.message ?? 'Internal server error';
  res.status(status).json({ error: message });
}

// ─────────────────────── POST /api/interviews ───────────────────────

router.post('/', requireInterviewer, async (req: Request, res: Response): Promise<void> => {
  try {
    const { candidateEmail, candidateName } = req.body as {
      candidateEmail?: string;
      candidateName?: string;
    };

    if (!candidateEmail || !candidateEmail.includes('@')) {
      res.status(400).json({ error: 'candidateEmail is required and must be a valid email' });
      return;
    }

    const result = await orchestrator.createInterview({
      interviewerId: req.userId!,
      candidateEmail,
      candidateName,
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/interview/${result.id}?t=${result.token}`;

    res.status(201).json({ id: result.id, token: result.token, link, expiresAt: result.expiresAt });
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/begin ───────────────────────

router.post('/:id/begin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, tncAccepted } = req.body as { token?: string; tncAccepted?: boolean };

    await validateCandidate(id, token ?? '');

    const result = await orchestrator.begin(id, { tncAccepted: tncAccepted === true });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ─────────────────────── POST /api/interviews/:id/answer ───────────────────────

router.post('/:id/answer', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { token, answer } = req.body as { token?: string; answer?: string };

    await validateCandidate(id, token ?? '');

    if (typeof answer !== 'string' || answer.trim() === '') {
      res.status(400).json({ error: 'answer is required' });
      return;
    }

    const result = await orchestrator.submitAnswer(id, answer);
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

    if (!language || !source) {
      res.status(400).json({ error: 'language and source are required' });
      return;
    }

    const result = await orchestrator.recordRun(id, { language, source, stdin });
    res.json(result);
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
