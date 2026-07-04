// REST routes for the interview lifecycle.
// Interviewer routes require a Supabase Bearer JWT.
// Candidate routes are validated via a single-use hashed access token.

import { Router, Request, Response } from 'express';
import { requireInterviewer, validateCandidate, isDevEmail } from './middleware';
import { enforceRateLimit } from './rate-limit';
import { hashToken } from '../interview/token';
import { SUPPORTED_LANGUAGES } from '../execution/docker';
import * as orchestrator from '../interview/orchestrator';
import { recordVoiceTurn, recordProctorSignal } from '../db/interviews';
import {
  synthesize,
  synthesizeStream,
  isCartesiaConfigured,
  splitSentences,
  STREAM_SAMPLE_RATE,
} from '../voice/cartesia';

const router = Router();

const MAX_SOURCE_BYTES = 64 * 1024;

/** Helper: send a structured error response. */
function sendError(res: Response, err: unknown): void {
  const e = err as { status?: number; message?: string; retryAfterSec?: number };
  const status = e?.status ?? 500;
  if (e?.retryAfterSec) res.setHeader('Retry-After', String(e.retryAfterSec));
  // Only surface messages from errors we constructed deliberately (they carry a `status` and a safe
  // message). For unexpected, status-less throws — e.g. an upstream Cartesia error whose message
  // embeds the vendor name + raw response body — log the real error and return a generic message, so
  // infrastructure/vendor detail never leaks to the candidate's browser.
  if (e?.status === undefined) {
    console.error('[interviews] unexpected error:', err);
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
    // Never leak hidden-test correctness to the candidate live — they see only their own
    // stdout/stderr + any interviewer hint. testResults is persisted server-side for grading + hints.
    const candidateSafe = { ...result };
    delete candidateSafe.testResults;
    res.json(candidateSafe);
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

    if (!isCartesiaConfigured()) {
      res.status(503).json({ error: 'Voice is not enabled for this interview.' });
      return;
    }

    // Prefer the exact utterance the turn cue carried (authoritative for THIS turn — and the only
    // way to voice the voice-service-only idle probe, which is never persisted). Fall back to the
    // latest interviewer turn / run-hint when no text is supplied (e.g. the run-hint path).
    const text =
      typeof providedText === 'string' && providedText.trim()
        ? providedText.slice(0, 2000)
        : await orchestrator.latestSpeakable(id, source === 'run' ? 'run' : 'turn');
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

    if (!isCartesiaConfigured()) {
      res.status(503).json({ error: 'Voice is not enabled for this interview.' });
      return;
    }

    // Prefer the exact utterance the turn cue carried (authoritative for THIS turn — and the only
    // way to voice the voice-service-only idle probe, which is never persisted). Fall back to the
    // latest interviewer turn / run-hint when no text is supplied.
    const text =
      typeof providedText === 'string' && providedText.trim()
        ? providedText.slice(0, 2000)
        : await orchestrator.latestSpeakable(id, source === 'run' ? 'run' : 'turn');
    if (!text) {
      res.status(404).json({ error: 'Nothing to speak yet.' });
      return;
    }

    const stream = synthesizeStream(text);
    // If the candidate disconnects mid-stream, stop pulling from Cartesia (releases the upstream
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
    const { token } = req.body as { token?: string };

    await validateCandidate(id, token ?? '');

    await orchestrator.finishAndScore(id);
    res.json({ ok: true });
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
const VALID_COMMITS = new Set(['smartturn', 'backstop', 'maxlen', 'assemblyai_eot', 'soniox_eot']);

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
    });

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

export { router as interviewsRouter };
