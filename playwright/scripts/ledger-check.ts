// Minimal ledger check: create → begin → 2 speak-stream calls → print id → (caller queries DB → delete)
import { getAccessToken } from '../helpers/auth';
import { config } from '../helpers/env';

const API = config.apiUrl;

async function post(p: string, b: Record<string, unknown>, jwt?: string): Promise<unknown> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: h, body: JSON.stringify(b) });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`${p} ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function main(): Promise<void> {
  const jwt = await getAccessToken();
  const cr = (await post('/api/interviews', {
    candidateEmail: 'ledger-check@overforge.local',
    candidateName: 'Ledger Check',
    language: 'python',
    level: 'mid',
    devMode: true,
  }, jwt)) as { id: string; token: string };
  const { id, token: inv } = cr;

  const br = (await post(`/api/interviews/${id}/begin`, { token: inv, tncAccepted: true })) as {
    sessionToken: string;
    utterance: { text: string };
  };
  const tok = br.sessionToken;
  console.log(`greeting: "${br.utterance.text.slice(0, 80)}"`);

  // Two speak-stream calls to produce cost_events rows
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    const res = await fetch(`${API}/api/interviews/${id}/speak-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok, source: 'turn' }),
    });
    if (!res.ok) { console.log(`speak-stream ${res.status}`); continue; }
    const chunks: Uint8Array[] = [];
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const bytes = chunks.reduce((s, c) => s + c.length, 0);
    console.log(`speak-stream #${i + 1}: ${Date.now() - t0} ms  ${bytes} bytes`);
  }

  // Small pause for async cost writes to flush
  await new Promise((r) => setTimeout(r, 2000));

  // Emit id on its own line so the caller can grep it
  console.log(`INTERVIEW_ID=${id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
