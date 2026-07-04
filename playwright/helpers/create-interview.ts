// Creates an interview via the real interviewer API and returns its candidate link. Always uses
// devMode:true — the room's paste-guard blocks programmatic editor insertion unless the interview
// is a dev interview (server-authoritative; only honored for a DEV_EMAILS account). devMode also
// picks the short dev duration, which keeps the whole run fast.

import { config } from './env';
import { getAccessToken } from './auth';

export interface CreatedInterview {
  id: string;
  /** The invite token (consumed by /begin). */
  token: string;
  /** Full candidate URL (frontend origin + ?t=token), as the backend builds it. */
  link: string;
}

export interface CreateOpts {
  language?: string;
  level?: string;
  candidateEmail?: string;
  roleBrief?: string;
}

export async function createInterview(opts: CreateOpts = {}): Promise<CreatedInterview> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${config.apiUrl}/api/interviews`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidateEmail: opts.candidateEmail ?? 'mimic@overforge.local',
      language: opts.language ?? 'python',
      level: opts.level ?? 'mid',
      ...(opts.roleBrief ? { roleBrief: opts.roleBrief } : {}),
      devMode: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`createInterview failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as CreatedInterview;
  if (!json.link) throw new Error('createInterview returned no link');
  // Optionally retarget the frontend origin (local next dev / preview deploy) while keeping the
  // path + token the backend issued.
  if (config.frontendUrl) {
    const u = new URL(json.link);
    const override = new URL(config.frontendUrl);
    u.protocol = override.protocol;
    u.host = override.host;
    json.link = u.toString();
  }
  // Clear a Vercel SSO-protected preview: the bypass params make Vercel's edge set a bypass cookie
  // on the first load, so the headless browser reaches the app instead of the login wall. Vercel
  // consumes its own params; the candidate ?t= token survives.
  if (config.vercelBypass) {
    const u = new URL(json.link);
    u.searchParams.set('x-vercel-protection-bypass', config.vercelBypass);
    u.searchParams.set('x-vercel-set-bypass-cookie', 'true');
    json.link = u.toString();
  }
  return json;
}
