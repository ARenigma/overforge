// Central config for the mimic harness. Everything is env-driven so the same specs run against
// prod, a Vercel preview, or a local stack. For convenience, the two PUBLIC Supabase values
// (URL + anon key) fall back to frontend/.env.local when not passed via env — the secret
// (OF_TEST_PASSWORD) never has a default and must come from the environment / CI secret store.

import { readFileSync } from 'fs';
import { resolve } from 'path';

function readDotEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(__dirname, '../../frontend/.env.local'), 'utf8');
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const local = readDotEnvLocal();

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required config: ${name}. Set it via env (or CI secret). ` +
        `See playwright/README.md for the full list.`
    );
  }
  return value;
}

export const config = {
  /** Backend REST base (candidate + interviewer API). */
  apiUrl: process.env.OF_API_URL ?? 'https://140.245.14.50.sslip.io',
  /** Optional override for the candidate frontend origin. When set, the invite link's origin is
   *  rewritten to this — e.g. point a `next dev` on http://localhost:3000 (or a Vercel preview) at
   *  the prod backend. Unset → use the link as the backend built it (its FRONTEND_URL). */
  frontendUrl: process.env.OF_FRONTEND_URL,
  /** Vercel "Protection Bypass for Automation" secret. When set, the invite link gets the
   *  x-vercel-protection-bypass params so the headless browser clears SSO-walled preview deploys
   *  (Vercel sets a bypass cookie on first load). Only needed when targeting a protected preview. */
  vercelBypass: process.env.OF_VERCEL_BYPASS,
  /** Supabase project — public URL + anon key (fall back to frontend/.env.local). */
  supabaseUrl: required(
    'OF_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL',
    process.env.OF_SUPABASE_URL ?? local.NEXT_PUBLIC_SUPABASE_URL
  ),
  supabaseAnonKey: required(
    'OF_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.OF_SUPABASE_ANON_KEY ?? local.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  /** Dev interviewer account (must be in the backend's DEV_EMAILS to create devMode interviews). */
  testEmail: process.env.OF_TEST_EMAIL ?? 'dev@overforge.local',
  /** Password for the dev account — REQUIRED, no default. Provide via OF_TEST_PASSWORD. */
  testPassword: () => required('OF_TEST_PASSWORD', process.env.OF_TEST_PASSWORD),
} as const;
