# Finite

Finite is an autonomous AI technical interviewer. It conducts structured oral and coding
interviews end-to-end: probing candidate answers with LLM-generated counter-questions,
grading submissions against hidden test cases inside a hardened sandbox, and emailing the
hiring manager a scorecard when the session ends.

## Architecture

```
┌──────────────────┐  HTTPS  ┌────────────────────────────────────┐
│  Next.js App     │◄───────►│  Express backend  (port 5001)      │
│  (Vercel)        │         │  FSM engine · LLM oracle · scorer  │
└──────────────────┘         └────────────┬───────────────────────┘
                                          │ Docker API
                          ┌───────────────┘
                          │
             ┌────────────▼──────────────┐   ┌──────────────────────┐
             │  Per-run executor          │   │  Python voice service │
             │  docker.ts + gVisor/runsc  │   │  FastAPI  port 9001   │
             │  --network none            │   │  AssemblyAI STT       │
             │  --read-only --cap-drop    │   │  Cartesia TTS         │
             │  tmpfs /work               │   │  endpointing.py       │
             └───────────────────────────┘   └──────────────────────┘

                          ┌──────────────────────┐
                          │  Supabase Postgres    │  auth + all state
                          └──────────────────────┘
```

Key source files:

| Path | What it does |
|---|---|
| `backend/src/interview/machine.ts` | Pure FSM: greeting → oral → coding → wrap_up → done |
| `backend/src/execution/docker.ts` | Per-run container kernel (7 languages) |
| `backend/src/scoring/` | LLM-based scorecard generation |
| `backend/src/notify/` | Transactional-outbox email (Resend) |
| `voice/` | FastAPI voice service (Python, `uv`-managed) |
| `supabase/migrations/` | Schema history |
| `deploy/docker-compose.yml` | Production VPS stack behind Caddy |
| `playwright/` | Playwright E2E harness |

## Local dev quickstart

**Requirements:** Node 20+, Docker daemon running, Python 3.12 +
[`uv`](https://github.com/astral-sh/uv).

```bash
# 1. Install workspace deps (backend + frontend hoisted under root node_modules)
npm ci

# 2. Copy and fill env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local   # set NEXT_PUBLIC_BACKEND_URL=http://localhost:5001

# 3. Start the backend (port 5001)
cd backend && npm run dev

# 4. Start the frontend (port 3000) — separate terminal
cd frontend && npm run dev

# 5. Voice service — optional for text-only sessions (port 9001)
cd voice && uv sync && uv run python ws_app.py
```

## Tests

```bash
# Backend unit + integration (Jest)
npm test --workspace=backend

# Voice service (pytest)
cd voice && uv run pytest -q

# Playwright E2E (needs live backend + frontend)
cd playwright && npx playwright test
```

## Deploy

CI runs on GitLab (`.gitlab-ci.yml`). On merge to `main`:

1. Backend image is built and deployed to the VPS via SSH; `docker compose up -d` restarts
   the stack behind Caddy (auto-TLS via Let's Encrypt).
2. Frontend deploys automatically to Vercel on every push.

After the first VPS deploy, pre-pull language runtime images so the first `/run` of each
language is fast:

```bash
bash deploy/pull-runtimes.sh
```
