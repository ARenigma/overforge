-- Overforge M1 — core interview schema, constraints, indexes, RLS.
-- Apply: `supabase db push` (CLI, linked project) or psql against the project DB.
-- Idempotent enum creation so the migration is safe to re-run in dev.

-- ─────────────────────────── Enums ───────────────────────────
do $$ begin
  create type interview_status as enum
    ('invited','in_progress','completed','scored','expired','abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type interview_phase as enum
    ('greeting','oral','handoff','coding','wrap_up','scoring','done');
exception when duplicate_object then null; end $$;

-- ─────────────────────────── updated_at trigger ───────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────── interviews ───────────────────────────
create table if not exists interviews (
  id                 uuid primary key default gen_random_uuid(),
  interviewer_id     uuid not null references auth.users(id) on delete cascade,
  candidate_email    text not null check (position('@' in candidate_email) > 1),
  candidate_name     text,
  status             interview_status not null default 'invited',
  phase              interview_phase  not null default 'greeting',
  fsm_state          jsonb not null default '{}'::jsonb,  -- machine context (current node, follow-up counters)
  -- Candidate access: store only a hash of the single-use token; the raw token is
  -- returned once at creation and lives only in the candidate's invite link.
  access_token_hash  text unique,
  token_expires_at   timestamptz,
  tnc_accepted_at    timestamptz,                          -- candidate T&C/indemnity acceptance
  tnc_version        text,
  transcript         jsonb not null default '[]'::jsonb,   -- ordered turns {role,text,ts}
  code_snapshot      text  not null default '',            -- last editor state
  code_runs          jsonb not null default '[]'::jsonb,   -- [{lang,stdout,stderr,exit,ms}]
  evaluation_score   jsonb,                                -- deterministic scorecard (null until scored)
  scorecard_sent_at  timestamptz,                          -- notification idempotency
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists interviews_interviewer_idx on interviews (interviewer_id, created_at desc);
create index if not exists interviews_status_idx       on interviews (status);

drop trigger if exists interviews_set_updated_at on interviews;
create trigger interviews_set_updated_at
  before update on interviews
  for each row execute function set_updated_at();

-- ─────────────────────────── interview_events (append-only) ───────────────────────────
-- Every FSM transition + LLM/ASR/TTS/code I/O. Full replay & audit.
create table if not exists interview_events (
  id            bigint generated always as identity primary key,
  interview_id  uuid not null references interviews(id) on delete cascade,
  seq           int  not null,                 -- monotonic per interview
  kind          text not null check (kind in
                  ('transition','utterance','answer','llm_in','llm_out','asr','tts','code_run','score')),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (interview_id, seq)
);
create index if not exists interview_events_idx on interview_events (interview_id, seq);

-- ─────────────────────────── notify_outbox (reliable email) ───────────────────────────
create table if not exists notify_outbox (
  id            bigint generated always as identity primary key,
  interview_id  uuid not null references interviews(id) on delete cascade,
  kind          text not null default 'scorecard',
  status        text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts      int  not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index if not exists notify_outbox_pending_idx on notify_outbox (status) where status = 'pending';

-- ─────────────────────────── RLS ───────────────────────────
alter table interviews       enable row level security;
alter table interview_events enable row level security;
alter table notify_outbox    enable row level security;

-- interviews: an interviewer has full access to ONLY their own rows.
-- Candidates are anonymous in M1 and reach their interview through the backend
-- (service role), which validates access_token_hash server-side — no client RLS
-- path for candidates. The service role bypasses RLS.
drop policy if exists interviews_owner_select on interviews;
create policy interviews_owner_select on interviews
  for select to authenticated using (auth.uid() = interviewer_id);

drop policy if exists interviews_owner_insert on interviews;
create policy interviews_owner_insert on interviews
  for insert to authenticated with check (auth.uid() = interviewer_id);

drop policy if exists interviews_owner_update on interviews;
create policy interviews_owner_update on interviews
  for update to authenticated using (auth.uid() = interviewer_id)
  with check (auth.uid() = interviewer_id);

drop policy if exists interviews_owner_delete on interviews;
create policy interviews_owner_delete on interviews
  for delete to authenticated using (auth.uid() = interviewer_id);

-- interview_events + notify_outbox: NO client policies → RLS denies all
-- authenticated/anon access. Only the backend (service role) reads/writes them.
