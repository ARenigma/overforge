# Security Policy

## Reporting a Vulnerability

If you discover a security issue in this repository, **do not open a public GitHub issue.** Email **you@example.com** (or DM Amit Ranjan on Telegram) with details. Expect a response within 48 hours.

## Incident Log

### 2026-06-15 — Historical secret exposure (overforge)

**What happened.** A pre-Cave project commit history contained several files with live credentials that should never have been committed:

| File | Secret class | Status |
| --- | --- | --- |
| `ai_module/simple_api_test.py` | Live Mistral + OpenRouter API keys | Scrubbed from git history |
| `repomix-output.xml` | ~16 Supabase JWTs (anon, service_role, user sessions) + assorted API keys | Scrubbed from git history |
| `specstory.md` (root) | A 19,779-line SpecStory conversation dump containing Supabase ANON_KEY and SERVICE_ROLE_KEY in plaintext | Scrubbed from git history |
| `.specstory/history/*.md` (18 files) | Conversation dumps; some contained Supabase JWTs | All specstory history files scrubbed from git history |

**Remediation taken (this repo, 2026-06-15).**
1. Two `git filter-repo` history rewrites removed all four paths above from every commit on `main` (12 + 14 commits rewritten across both passes; all SHAs before `3fb58a8` are new).
2. `main` was force-pushed (`3b29cc8…` → `c33b751` → `3fb58a8`).
3. The in-flight `chore/ci-cd-foundation` PR branch was re-created from the rewritten `main` and all 6 of its commits re-applied. **The old PR must be closed and the new one opened** because the base SHA changed.
4. Leaked paths are in `.gitignore` so they can't be re-added by accident.
5. A `gitleaks` GitHub Action (`.github/workflows/gitleaks.yml`) now blocks any PR or push to `main` that re-introduces a secret.
6. All clones of this repo on other machines must be discarded and re-cloned — `git pull` will not recover from a history rewrite; the old SHAs no longer exist.

**Remediation still required (provider-side, owner action).**
The git history rewrite only removes the secrets from this repository. The actual credentials are still valid until rotated at their respective providers. **The repo owner must:**

- [ ] Rotate the Mistral API key at <https://console.mistral.ai/>
- [ ] Rotate the OpenRouter API key at <https://openrouter.ai/keys>
- [ ] Rotate every Supabase project key found in the leaks (anon, service_role; any leaked user JWTs are short-lived but should still trigger a session invalidation)
- [ ] Audit Cloud Run / Vercel / any deployment platform for env vars that match the leaked values
- [ ] Review provider-side access logs between the leak date and rotation for unauthorized usage

## Secret-handling policy (going forward)

- **No secrets in code, ever.** All runtime secrets come from environment variables loaded from `.env` files. `.env` is git-ignored. `.env.example` files document the shape of required env vars without values.
- **No conversation dumps in VCS.** `.specstory/history/` and the root-level `specstory.md` are git-ignored. Specstory transcripts stay local to the developer who generated them.
- **No test fixtures with real keys.** `ai_module/simple_api_test.py` and similar files must use mocked providers, not live API calls.
- **Pre-commit gates.** Husky `pre-commit` runs prettier + gitleaks on staged files. `pre-push` runs a `.env` leak check across the working tree.
- **CI gates.** GitHub Actions runs `gitleaks` on every PR and push to `main`, with `fetch-depth: 0` so the full history is scanned. A leak fails the build.
- **Quarterly review.** The repo owner reviews `git log -p` for any new secret-shaped strings (long opaque tokens, JWTs, `sk-…` API keys) as a manual sanity check.
