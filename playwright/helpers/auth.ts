// Mints an interviewer access token via Supabase password grant — the same flow the dashboard's
// email/password sign-in uses. The resulting JWT authorizes POST /api/interviews.

import { config } from './env';

/** Node's fetch (undici) occasionally throws a transient network-level `TypeError: fetch failed`
 *  (DNS/socket hiccup) that a curl of the same endpoint immediately succeeds on. Retry those a
 *  couple of times with a short backoff; HTTP-level failures (4xx/5xx) still throw immediately. */
async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function getAccessToken(): Promise<string> {
  const res = await fetchWithRetry(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: config.testEmail, password: config.testPassword() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase password grant failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Supabase password grant returned no access_token');
  return json.access_token;
}
