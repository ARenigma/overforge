// Mints an interviewer access token via Supabase password grant — the same flow the dashboard's
// email/password sign-in uses. The resulting JWT authorizes POST /api/interviews.

import { config } from './env';

export async function getAccessToken(): Promise<string> {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
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
