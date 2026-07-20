# Overforge Backend

Express + TypeScript FSM backend for the Finite AI interview platform.

## What it does

- **Interview FSM** (`src/interview/machine.ts`) — deterministic finite state machine:
  greeting → oral → coding → wrap_up → done. LLM fills slots; control flow never delegated
  to the model.
- **LLM oracle** — MiniMax primary with Groq/Cerebras fallback chain for utterance generation
  and answer evaluation.
- **Docker-per-run execution kernel** (`src/execution/docker.ts`) — isolated gVisor containers
  for 7 languages, network-isolated, tmpfs workspace, CPU/mem capped.
- **Scorer** (`src/scoring/`) — deterministic post-interview scorecard pass via LLM.
- **Notifier** (`src/notify/`) — transactional-outbox email via Resend.
- **Voice proxy** (`src/voice/`) — WebSocket bridge to the Python voice service.

## Commands

Run from the repo root (npm workspace) or from `backend/`:

```bash
npm test --workspace=backend      # Jest unit tests
npm run lint --workspace=backend  # ESLint
npm run typecheck --workspace=backend  # tsc --noEmit
npm run dev --workspace=backend   # tsx watch (port 5001)
```

## Environment

Copy `backend/.env.example` to `backend/.env` and fill in secrets. See `.env.example` for
all variables grouped by area (Supabase, LLM chain, Cartesia/voice, Resend, Sentry,
sandbox/exec, retention, rate/dev).

## Further docs

See `/docs` for architecture spec and sandbox hardening notes.
