// Acceptance for the visual stage guidance feature. Asserts that system-initiated blocking
// modals fire at the right phase transitions, cannot be bypassed, do not reappear after a
// reload at the same phase, and that the persistent stage chip reads correctly.
// Runs in the 'mimic' project (headed Chromium through the camera+mic-gated room).
//
// NOTE: Do not run this suite directly — it requires prod credentials (BACKEND_URL, DEV_EMAIL,
// DEV_PASSWORD set in playwright/.env). Use the CI job e2e-mimic instead.

import { test, expect } from '@playwright/test';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';

const ORAL = [
  'I built a payments reconciliation service in Python on FastAPI with an idempotency-key table.',
  'Out-of-order webhooks were the hard part; a per-payment state machine reordered them safely.',
  'A hash map gives O(1) average lookups; load factor and resizing govern collisions.',
  'Happy to move on to the coding part.',
];

let createdId: string | null = null;
test.afterEach(async () => {
  if (createdId && !process.env.KEEP_INTERVIEW) await deleteInterview(createdId);
  createdId = null;
});

test.describe('stage cues: blocking modals + chip', () => {
  test('coding modal appears when data-phase flips to coding and blocks interaction', async ({
    page,
  }) => {
    const interview = await createInterview({ language: 'python', level: 'mid' });
    createdId = interview.id;
    const room = new CandidateRoom(page);
    await room.enter(interview.link);
    await room.waitForSettled();
    await room.advanceThroughOral(ORAL);
    await room.waitForCoding(60_000);

    // The coding modal must be visible.
    const modal = page.getByTestId('stage-modal');
    await modal.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(modal).toBeVisible();

    // The data-phase attribute on the root confirms we ARE in the coding phase.
    const root = page.getByTestId('interview-root');
    await expect(root).toHaveAttribute('data-phase', 'coding');

    // While the modal is open the acknowledge button should be focused.
    const ackBtn = page.getByTestId('stage-modal-ack');
    await expect(ackBtn).toBeFocused();

    // The transcript textarea and editor must not be interactable (overlay covers them).
    // The simplest check: clicking the composer doesn't move focus away from the modal overlay.
    await page.getByPlaceholder('Type your answer…').click({ force: true }).catch(() => undefined);
    // Focus must NOT have left the modal — ack button or the modal itself is still focused.
    const focusedTestId = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.closest('[data-testid="stage-modal"]') !== null;
    });
    expect(focusedTestId, 'focus must stay inside the stage modal while it is open').toBe(true);

    // Acknowledge dismisses the modal.
    await ackBtn.click();
    await expect(modal).not.toBeVisible();

    // The stage chip reads "Coding Round".
    const chip = page.getByTestId('stage-chip');
    await expect(chip).toBeVisible();
    const chipText = await chip.innerText();
    expect(chipText, 'stage chip must show Coding Round label').toMatch(/Coding Round/i);
  });

  test('coding modal does NOT reappear after a reload at the same phase', async ({ page }) => {
    const interview = await createInterview({ language: 'python', level: 'mid' });
    createdId = interview.id;
    const room = new CandidateRoom(page);
    await room.enter(interview.link);
    await room.waitForSettled();
    await room.advanceThroughOral(ORAL);
    await room.waitForCoding(60_000);

    // Acknowledge the coding modal.
    const ackBtn = page.getByTestId('stage-modal-ack');
    await ackBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await ackBtn.click();
    await expect(page.getByTestId('stage-modal')).not.toBeVisible();

    // Reload the page (same tab — sessionStorage survives).
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Re-enter through the consent gate (resume path).
    const begin = page.getByTestId('consent-begin');
    await begin.waitFor({ state: 'visible', timeout: 30_000 });
    await begin.click();
    // Wait until we're back in the coding room.
    await room.waitForCoding(60_000);

    // The modal must NOT reappear — sessionStorage guard prevents it.
    await page.waitForTimeout(1_500); // give it a moment to render if it were going to
    await expect(page.getByTestId('stage-modal')).not.toBeVisible();

    // Stage chip still reads Coding Round after reload.
    const chip = page.getByTestId('stage-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(/Coding Round/i);
  });

  test('stage chip reads Walkthrough during oral phase', async ({ page }) => {
    const interview = await createInterview({ language: 'python', level: 'mid' });
    createdId = interview.id;
    const room = new CandidateRoom(page);
    await room.enter(interview.link);
    await room.waitForSettled();

    // Still in oral — chip should read Walkthrough.
    const chip = page.getByTestId('stage-chip');
    await expect(chip).toBeVisible();
    const text = await chip.innerText();
    expect(text, 'chip must read Walkthrough during oral phase').toMatch(/Walkthrough/i);
  });
});
