# Overforge — Project Rules

Supplements the global `~/.claude/CLAUDE.md`. These are hard rules for this repo.

## Browser QA — ALWAYS use browser-use (hard rule)

For ANY browser testing, QA, click-through, screenshot, or visual verification on this
project, use the **browser-use** CLI (v2) — **never** the Claude Preview MCP (`preview_*`) or
Claude-in-Chrome. Those black-frame on the WebGL landing hero and can't reach authed pages.

- Public pages: `browser-use --session pub open <url>`.
- Authed pages (dashboard, interview room, `/dashboard/[id]` detail view): launch with the
  signed-in Chrome profile — `browser-use --session qa --profile "Amit" open <url>` (Chrome
  Profile 1 is the Overforge account). Pass `--profile` only on the launching `open`;
  later commands use just `--session qa`.
- **Never type the user's password.** Open the headed window; if there's no session, ask the
  user to sign in, then continue driving.
- Loop: `open` → `screenshot /tmp/x.png` then Read the PNG → `eval "<js>"` for DOM/function
  checks → `state` for clickable elements → `click`/`input`.
- Local dev points at the prod Supabase + backend via `frontend/.env.local`:
  `cd frontend && npm run dev` → `:3000`. Don't run `npm install`/`build` while `next dev` is
  live (kills it).

See memory: `overforge-browser-use-qa`, `overforge-prod-hardening`, `overforge-production-deploy`.
