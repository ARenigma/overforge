// One-off E2E: a simulated tab-away must land a 'blur' integrity signal on prod.
// Drives consent -> room, dispatches window blur, waits past the 1.5s threshold,
// dispatches focus, then polls the DB via the backend (service creds NOT needed —
// we assert via the deterrence banner instead, and print the interview id so the
// orchestrator can verify the DB row).
import { chromium } from '@playwright/test';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';

async function main() {
  const interview = await createInterview({ language: 'python', level: 'mid' });
  console.log('interview:', interview.id);
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
    ],
  });
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  const room = new CandidateRoom(page);
  await room.enter(interview.link);
  await room.waitForSettled();

  // Simulate tab-away: blur -> 2.5s -> focus. The hook posts kind='blur' with durationMs.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(2500);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/integrity') && r.request().method() === 'POST', { timeout: 10_000 }).catch(() => null),
    page.evaluate(() => window.dispatchEvent(new Event('focus'))),
  ]);
  let req = null;
  if (resp) {
    req = resp.request();
    const body = req.postDataJSON() as { kind?: string; durationMs?: number };
    let respBody = '';
    try { respBody = (await resp.text()).slice(0, 200); } catch { /* ignore */ }
    console.log('INTEGRITY POST:', JSON.stringify({ kind: body.kind, durationMs: body.durationMs, status: resp.status(), respBody }));
  } else {
    console.log('NO INTEGRITY POST OBSERVED');
  }
  // The deterrence banner should be visible.
  const banner = page.getByTestId('integrity-warning');
  const visible = await banner.isVisible().catch(() => false);
  console.log('deterrence banner visible:', visible, visible ? JSON.stringify(await banner.innerText()) : '');

  await browser.close();
  if (!process.env.KEEP) await deleteInterview(interview.id);
  console.log(req && visible ? 'BLUR-CHECK PASS' : 'BLUR-CHECK FAIL');
}
main().catch((e) => { console.error(e); process.exit(1); });
