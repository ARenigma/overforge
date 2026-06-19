// HTTP middleware for the interview REST API.

import { Request, Response, NextFunction } from 'express';
import { createServiceClient } from '../db/supabase';
import { getByAccessTokenHash } from '../db/interviews';
import { hashToken } from '../interview/token';

// Extend Express Request with our custom properties.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Validates the interviewer's Supabase Bearer JWT.
 * Attaches req.userId on success; sends 401 on failure.
 */
export async function requireInterviewer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required (Bearer <token>)' });
    return;
  }

  const token = authHeader.slice(7);
  const db = createServiceClient();
  const { data, error } = await db.auth.getUser(token);

  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = data.user.id;
  next();
}

/**
 * Validates a candidate's single-use access token against the stored hash.
 * Throws a structured error that the route handler converts to a 403 response.
 */
export async function validateCandidate(
  interviewId: string,
  rawToken: string,
): Promise<void> {
  if (!rawToken) {
    throw Object.assign(new Error('Token required'), { status: 403 });
  }

  const hash = hashToken(rawToken);
  const interview = await getByAccessTokenHash(hash);

  if (!interview) {
    throw Object.assign(new Error('Invalid token'), { status: 403 });
  }

  if (interview.id !== interviewId) {
    throw Object.assign(new Error('Token does not match this interview'), { status: 403 });
  }

  if (interview.token_expires_at && new Date(interview.token_expires_at) < new Date()) {
    throw Object.assign(new Error('Token expired'), { status: 403 });
  }
}
