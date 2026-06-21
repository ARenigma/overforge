/**
 * interview-flow.spec.ts
 *
 * End-to-end journey covering the four core surfaces of overForge:
 *   1. Landing page  — hero, pill nav, primary CTAs
 *   2. /auth         — sign-in form (Welcome back), OAuth provider buttons
 *   3. /dashboard    — guarded by auth; either asserts the page or the redirect
 *   4. /interview/[id] — asserts editor + AI-chat elements tolerantly
 *
 * Auth-gated steps (dashboard, interview) require real Supabase credentials.
 * Set E2E_EMAIL and E2E_PASSWORD in your environment to enable them.
 * When those vars are absent the tests still run but assert the auth-gate
 * redirect instead of the authenticated view.
 *
 * Run against the dev server:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/interview-flow.spec.ts
 */

import { test, expect } from './fixtures';

// ── Auth credential helpers ────────────────────────────────────────────────────

const E2E_EMAIL = process.env.E2E_EMAIL ?? '';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '';
const hasAuthCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

// ── 1. Landing page ───────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test('hero heading is present', async ({ page }) => {
    await page.goto('/');

    // The hero renders two lines: "Technical interviews," and "run by AI."
    // We look for the first part which is always visible.
    await expect(page.getByRole('heading', { name: /technical interviews/i })).toBeVisible();
  });

  test('pill nav is present with navigation links', async ({ page }) => {
    await page.goto('/');

    // The PillNav renders a <nav aria-label="Primary"> containing the links.
    const nav = page.getByRole('navigation', { name: /primary/i });
    await expect(nav).toBeVisible();

    // Desktop nav links inside the pill (may be hidden on narrow viewports but
    // present in the DOM — use count check rather than visibility).
    const productLink = page.getByRole('link', { name: /product/i });
    await expect(productLink).toHaveCount(1);
  });

  test('"Start free" CTA in the hero is present and points to /auth', async ({ page }) => {
    await page.goto('/');

    // Hero renders a "Start free" link (the CTA section has one too — take the first).
    const startFreeLink = page.getByRole('link', { name: /start free/i }).first();
    await expect(startFreeLink).toBeVisible();
    await expect(startFreeLink).toHaveAttribute('href', '/auth');
  });

  test('"Sign in" CTA in the pill nav is present and points to /auth', async ({ page }) => {
    await page.goto('/');

    // PillNav has a "Sign in" link visible on sm+ breakpoints.
    // The mobile menu also has one, so we look for at least one.
    const signInLinks = page.getByRole('link', { name: /sign in/i });
    await expect(signInLinks.first()).toBeAttached();
    await expect(signInLinks.first()).toHaveAttribute('href', '/auth');
  });
});

// ── 2. /auth ──────────────────────────────────────────────────────────────────

test.describe('Auth page (/auth)', () => {
  test('auth card renders with heading, email and password inputs', async ({ page }) => {
    await page.goto('/auth');

    // Default mode is "signin" — "Welcome back" heading must be visible.
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

    // Email and password inputs are both present.
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Sign Up is offered as a footer link.
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible();
  });

  test('OAuth provider buttons are present', async ({ page }) => {
    await page.goto('/auth');

    // Four OAuth buttons: Google, GitHub, GitLab, LinkedIn.
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with gitlab/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with linkedin/i })).toBeVisible();
  });

  test('switching to Sign Up shows "Create Account" submit button', async ({ page }) => {
    await page.goto('/auth');

    // Sign Up is reached via the footer action (not a tab).
    await page.getByRole('button', { name: /sign up/i }).click();

    // Primary CTA label changes to "Create Account".
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });
});

// ── 3. /dashboard — auth-gated ────────────────────────────────────────────────

test.describe('Dashboard (/dashboard)', () => {
  test('redirects unauthenticated visitors to /auth', async ({ page }) => {
    // Skip the sign-in path entirely when no credentials are configured.
    // We still assert the auth-gate redirect which must always work.
    if (hasAuthCreds) {
      // With creds, full sign-in is performed in the block below — skip
      // the redirect-only variant.
      test.skip(true, 'Credentials present — auth sign-in test covers this route.');
    }

    await page.goto('/dashboard');

    // Next.js server-side redirect — the URL must end up at /auth (or /auth?...).
    await expect(page).toHaveURL(/\/auth/);
  });

  test('authenticated user sees the Interviews dashboard heading', async ({ page }) => {
    // Skip entirely when credentials are absent.
    if (!hasAuthCreds) {
      test.skip(true, 'E2E_EMAIL / E2E_PASSWORD not set — skipping authenticated dashboard test.');
    }

    // Navigate to auth and sign in with email + password.
    await page.goto('/auth');
    await page.locator('input[type="email"]').fill(E2E_EMAIL);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    // After successful sign-in the app redirects to /dashboard.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // The dashboard page heading.
    await expect(page.getByRole('heading', { name: /interviews/i })).toBeVisible();
  });
});

// ── 4. /interview/[id] — tolerant assertions ──────────────────────────────────

test.describe('Interview screen (/interview/[id])', () => {
  /**
   * The interview page requires a valid `?t=<token>` query param to enter
   * the interview flow. Without one it immediately renders an <ErrorCard>.
   * We test two scenarios:
   *   a) No token → error card (always runnable).
   *   b) With a fake token → consent screen before the split-pane layout.
   *
   * The split-pane editor + AI-chat assertions are gated behind real auth +
   * a valid token (obtained after signing in and starting an interview).
   * When neither is available we assert what IS reachable.
   */

  test('renders error card when no token is provided', async ({ page }) => {
    await page.goto('/interview/test-interview-id-000');

    // ErrorCard contains "Something went wrong" and the specific message.
    await expect(page.getByText(/something went wrong/i)).toBeVisible();
    await expect(page.getByText(/invalid or missing interview link/i)).toBeVisible();
  });

  test('renders consent card when a (fake) token is present', async ({ page }) => {
    // A fake token causes the consent stage to render (token present = stage:consent).
    // The API call only fires AFTER the user clicks "I agree & start".
    await page.goto('/interview/test-interview-id-000?t=fake-token-for-e2e');

    // Consent card must show the "Before you begin" notice and the CTA.
    await expect(page.getByText(/before you begin/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /i agree & start/i })).toBeVisible();
  });

  test('split-pane interview layout: code editor, language menu, and AI chat input exist', async ({
    page,
  }) => {
    // This test is only meaningful when we can obtain a real interview token.
    // Gate it behind credentials; without them we document what we'd expect.
    if (!hasAuthCreds) {
      test.skip(
        true,
        'E2E_EMAIL / E2E_PASSWORD not set — cannot reach the live interview split-pane.'
      );
    }

    // ---- Sign in ----
    await page.goto('/auth');
    await page.locator('input[type="email"]').fill(E2E_EMAIL);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // ---- Open a new interview dialog and grab its link ----
    // The dashboard has a "New Interview" button that opens NewInterviewDialog.
    const newInterviewBtn = page.getByRole('button', { name: /new interview/i });
    await expect(newInterviewBtn).toBeVisible();
    await newInterviewBtn.click();

    // The dialog is expected to contain a shareable link or a "Create" action.
    // We allow flexibility here — just confirm a dialog opened.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // If the dialog exposes a copy-link input, extract the URL.
    // Otherwise navigate directly to a well-known interview path constructed
    // from any `href` the dialog might render.
    const interviewLinkInput = dialog.locator('input[type="text"], input[type="url"]').first();
    let interviewURL: string | null = null;
    if ((await interviewLinkInput.count()) > 0) {
      interviewURL = await interviewLinkInput.inputValue();
    }

    // Close dialog.
    const closeBtn = dialog.getByRole('button', { name: /close|cancel|dismiss/i }).first();
    if ((await closeBtn.count()) > 0) await closeBtn.click();

    if (!interviewURL) {
      test.skip(
        true,
        'Could not extract interview URL from the dialog — skipping split-pane check.'
      );
    }

    // ---- Navigate to the interview ----
    await page.goto(interviewURL!);

    // Consent step first.
    const agreeBtn = page.getByRole('button', { name: /i agree & start/i });
    if (await agreeBtn.isVisible({ timeout: 3_000 })) {
      await agreeBtn.click();
    }

    // ---- Assert the split-pane elements ----

    // Code editor container — the EnhancedCodeMirrorEditor wraps a CodeMirror
    // instance; its outer shell always carries a `data-testid` or a `.cm-editor`
    // class. We use a tolerant selector that matches either convention.
    const editorContainer = page.locator('[data-testid="code-editor"], .cm-editor').first();
    await expect(editorContainer).toBeVisible({ timeout: 10_000 });

    // Language selector — rendered as a <SelectTrigger> with font-mono text.
    // The trigger contains one of the supported language names.
    const languageMenu = page.getByRole('combobox').or(page.locator('[role="combobox"]')).first();
    await expect(languageMenu).toBeVisible();

    // AI chat / answer input textarea — "Type your answer…".
    const chatInput = page.locator('textarea[placeholder*="answer"]').first();
    await expect(chatInput).toBeVisible();
  });
});
