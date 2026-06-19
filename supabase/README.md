# Supabase (Overforge)

Schema, RLS, and migrations for the interview platform. See
`../docs/ARCHITECTURE_SPEC.md` §2 for the data-model rationale.

## Apply migrations

**Option A — Supabase CLI (recommended):**
```bash
supabase link --project-ref <your-project-ref>   # one-time
supabase db push                                  # applies supabase/migrations/*
```

**Option B — psql:**
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init_interviews.sql
```

`SUPABASE_DB_URL` is the project connection string (Project Settings → Database).

## Model notes

- **Candidate access** is not RLS-based. Candidates are anonymous in M1 and reach
  their interview via a single-use token; the backend (service role) validates the
  token against `interviews.access_token_hash`. Only a **hash** is stored — the raw
  token lives only in the invite link, returned once at creation.
- **`interview_events`** is append-only (full FSM/LLM replay) and **`notify_outbox`**
  backs reliable interviewer email. Both are **service-role only** — RLS is enabled
  with no client policies, so authenticated/anon clients cannot read or write them.
- **Interviewer** access to `interviews` is owner-scoped via `auth.uid() = interviewer_id`.

## Verification status

`0001_init_interviews.sql` is standard Postgres/Supabase SQL (idempotent enum
creation; safe to re-run in dev). It has **not** yet been applied against a live
project (pending staged credentials); it will be verified on the first
`supabase db push`.
