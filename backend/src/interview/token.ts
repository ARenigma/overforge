// Candidate access token utilities.
// generateToken() produces a URL-safe random string; hashToken() produces the
// sha256 hex that gets stored in the DB. Only the hash is persisted; the raw
// token is returned once to the interviewer and embedded in the invite link.

import { randomBytes, createHash } from 'crypto';

/** Returns a 32-byte base64url-encoded random token. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Returns the sha256 hex digest of the raw token. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}
