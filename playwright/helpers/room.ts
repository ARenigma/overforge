// Page-object for the candidate interview room. Wraps the *candidate-visible* surface only — the
// consent gate, the interviewer chat, the problem panel, the editor + RUN — so the specs read like
// a candidate's actions. Assertions target the data-testid seams added to the room page.

import { Page, Locator, expect } from '@playwright/test';

const PASTE_MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

export class CandidateRoom {
  constructor(private readonly page: Page) {}

  private aiMessages(): Locator {
    return this.page.getByTestId('ai-message');
  }

  /** Open the invite link, clear the consent gate, and land in the room. Retries the consent
   *  click if the fake-media getUserMedia races (the room falls back to "Retry camera & start"). */
  async enter(link: string): Promise<void> {
    await this.page.goto(link, { waitUntil: 'domcontentloaded' });
    const begin = this.page.getByTestId('consent-begin');
    await begin.waitFor({ state: 'visible', timeout: 30_000 });

    for (let attempt = 0; attempt < 5; attempt++) {
      await begin.click().catch(() => undefined);
      // In the room once the greeting bubble (or the editor) shows. If getUserMedia raced, the
      // consent button re-appears as "Retry camera & start" and we click again.
      const landed = await Promise.race([
        this.aiMessages()
          .first()
          .waitFor({ state: 'visible', timeout: 20_000 })
          .then(() => true)
          .catch(() => false),
        this.page
          .getByPlaceholder('Type your answer…')
          .waitFor({ state: 'visible', timeout: 20_000 })
          .then(() => true)
          .catch(() => false),
      ]);
      if (landed) return;
    }
    throw new Error(
      'Failed to enter the room after 5 consent attempts (camera gate never cleared)'
    );
  }

  /** Wait until the interviewer has finished producing its turn (thinking spinner gone). */
  async waitForSettled(timeout = 60_000): Promise<void> {
    await this.page
      .getByTestId('ai-thinking')
      .waitFor({ state: 'detached', timeout })
      .catch(() => undefined);
  }

  async aiCount(): Promise<number> {
    return this.aiMessages().count();
  }

  async lastAiText(): Promise<string> {
    const n = await this.aiCount();
    if (n === 0) return '';
    return (
      await this.aiMessages()
        .nth(n - 1)
        .innerText()
    ).trim();
  }

  /** Type an answer into the always-on composer and submit (Enter). Waits for the interviewer's
   *  reply (a new ai bubble) so the caller can keep the conversation going. */
  async answer(text: string, timeout = 60_000): Promise<void> {
    const before = await this.aiCount();
    const box = this.page.getByPlaceholder('Type your answer…');
    await box.waitFor({ state: 'visible', timeout: 15_000 });
    await box.click();
    await box.fill(text);
    await box.press('Enter');
    // A new interviewer bubble (or the same-count settle) confirms the turn advanced.
    await this.page
      .waitForFunction(
        (n) => document.querySelectorAll('[data-testid="ai-message"]').length > n,
        before,
        { timeout }
      )
      .catch(() => undefined);
    await this.waitForSettled(timeout);
  }

  /** True once the coding phase has begun (the problem panel is mounted). */
  async isCoding(): Promise<boolean> {
    return (await this.page.getByTestId('problem-panel').count()) > 0;
  }

  /** Poll until the coding phase begins or we run out of oral turns. Answers each interviewer
   *  question with a substantive canned reply (quality doesn't gate FSM progression). */
  async advanceThroughOral(cannedAnswer: string, maxTurns = 6): Promise<number> {
    let turns = 0;
    for (let i = 0; i < maxTurns; i++) {
      if (await this.isCoding()) break;
      if (await this.isDone()) break;
      await this.answer(cannedAnswer);
      turns++;
    }
    return turns;
  }

  async problemTitle(timeout = 30_000): Promise<string> {
    const t = this.page.getByTestId('problem-title');
    await t.waitFor({ state: 'visible', timeout });
    return (await t.innerText()).trim();
  }

  /** Replace the editor contents. Uses the real paste path (devMode allows it → verbatim insert,
   *  so Python indentation survives), with an execCommand('insertText') fallback. */
  async typeCode(source: string): Promise<void> {
    const editor = this.page.locator('.cm-content');
    await editor.waitFor({ state: 'visible', timeout: 20_000 });
    await editor.click();
    await this.page.keyboard.press(`${PASTE_MOD}+a`);

    let ok = false;
    try {
      await this.page.evaluate((code) => navigator.clipboard.writeText(code), source);
      await this.page.keyboard.press(`${PASTE_MOD}+v`);
      ok = await this.editorMatches(source);
    } catch {
      ok = false;
    }

    if (!ok) {
      // Fallback: synthetic insertText (not a paste event, so the guard doesn't touch it).
      await editor.click();
      await this.page.keyboard.press(`${PASTE_MOD}+a`);
      await this.page.evaluate((code) => {
        const el = document.querySelector('.cm-content') as HTMLElement | null;
        if (!el) throw new Error('.cm-content not found');
        el.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand('insertText', false, code);
      }, source);
      ok = await this.editorMatches(source);
    }
    if (!ok) throw new Error('typeCode: editor content did not match the inserted source');
  }

  private async editorMatches(source: string): Promise<boolean> {
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    const got = norm(await this.page.locator('.cm-content').innerText());
    const want = norm(source);
    // Substring match tolerates CodeMirror's zero-width markers / trailing newline handling.
    return got.includes(want.slice(0, Math.min(want.length, 40)));
  }

  /** Click RUN and return the candidate-visible outcome (status + stdout/stderr). */
  async run(timeout = 40_000): Promise<{ status: string; stdout: string }> {
    const before = await this.aiCount();
    await this.page.getByRole('button', { name: 'RUN' }).click();
    const out = this.page.getByTestId('run-output');
    await out.waitFor({ state: 'visible', timeout });
    const status = (await this.page.getByTestId('run-status').innerText()).trim();
    const stdout = (await out.innerText()).trim();
    // A run may trigger an autonomous hint (new ai bubble); let it settle.
    await this.waitForSettled(timeout).catch(() => undefined);
    void before;
    return { status, stdout };
  }

  /** True if any interviewer bubble is an autonomous intervention (probe/hint) — data-assist set. */
  async hintFired(): Promise<boolean> {
    return (await this.page.locator('[data-testid="ai-message"][data-assist]').count()) > 0;
  }

  async isDone(): Promise<boolean> {
    return (await this.page.getByTestId('interview-done').count()) > 0;
  }

  async waitForDone(timeout: number): Promise<void> {
    await this.page.getByTestId('interview-done').waitFor({ state: 'visible', timeout });
  }

  async concludedByTime(): Promise<boolean> {
    const el = this.page.getByTestId('interview-done');
    if ((await el.count()) === 0) return false;
    return (await el.getAttribute('data-concluded-by-time')) === 'true';
  }

  /** Leak invariant: the candidate view must never surface hidden-test pass/fail counts. */
  async assertNoHiddenTestLeak(): Promise<void> {
    const body = (await this.page.locator('body').innerText()).toLowerCase();
    for (const needle of [
      'hidden test',
      'tests passed',
      'tests failed',
      '/ 8 tests',
      'test case 1',
    ]) {
      expect(body, `candidate view leaked "${needle}"`).not.toContain(needle);
    }
  }
}
