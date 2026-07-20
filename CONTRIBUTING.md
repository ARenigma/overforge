# Contributing to Finite

Monorepo for an autonomous AI technical interview platform. PRs go through regression
gates locally (husky) and in CI (GitLab) before landing.

## Repository layout

```
overforge/
├── frontend/          # Next.js App Router (TypeScript) — port 3000
├── backend/           # Node.js/Express FSM + LLM + scorer — port 5001
├── voice/             # FastAPI voice service (Python, uv-managed) — port 5002
├── playwright/        # Playwright E2E harness
├── deploy/            # docker-compose.yml, Caddy config, pull-runtimes.sh
├── supabase/          # migrations/
├── .husky/            # Git hooks (pre-commit: lint-staged; pre-push: tsc + jest)
├── package.json       # Root npm workspace (backend + frontend); lint-staged config
└── README.md
```

## Local dev setup

```bash
# 1. Clone
git clone git@gitlab.com:overforge/overforge.git
cd overforge

# 2. Env files (never commit the real .env, only .env.example)
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env.local

# 3. Install JS deps (root workspace hoists backend + frontend)
npm ci

# 4. Start services
(cd backend  && npm run dev)          # :5001
(cd frontend && npm run dev)          # :3000

# Voice service (optional)
(cd voice && uv sync && uv run uvicorn ws_app:app --host 0.0.0.0 --port 5002)   # :5002
```

## Gates

| Gate | When | What it checks |
|---|---|---|
| Prettier + lint-staged | pre-commit | Format staged JS/TS/JSON/MD |
| backend tsc + jest | pre-push | Type-check + all unit tests |
| frontend tsc | pre-push | `tsc --noEmit` |
| Repo hygiene | pre-push | No real `.env` files tracked |
| Full CI pipeline | GitLab MR | Build, lint, test, E2E |

## Coding conventions

### Frontend (Next.js / TypeScript)
- 2-space indent, single quotes, semicolons (Prettier)
- `NEXT_PUBLIC_` prefix for any client-exposed env var
- No `any`; use `unknown` + narrowing

### Backend (Node / Express / TypeScript)
- ESM (`import`/`export`) — do not mix with `require`
- 2-space indent, single quotes, semicolons
- New services need a Jest test in `backend/src/<module>/<module>.test.ts`
- Mock Supabase and Docker in tests — never hit real infra

### Voice service (FastAPI / Python)
- `uv` for package management — `uv add <pkg>`, never bare `pip`
- `ruff check --fix` before committing
- New endpoints need a Pydantic model for request + response

## What NOT to do

- Do not commit a real `.env` file (the pre-push hook will block it)
- Do not skip hooks with `--no-verify`
- Do not add `*_key.txt` files at any path
- Do not bump major deps without opening an issue first
