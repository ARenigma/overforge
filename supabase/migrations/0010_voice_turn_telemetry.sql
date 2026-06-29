-- Overforge — durable per-turn voice telemetry sink.
--
-- The Python voice service has no Supabase credentials; it POSTs each turn's
-- metrics to the TypeScript backend, which writes rows here via the service-role
-- client.  No candidate-facing data (audio, transcripts) is stored — only timing
-- and classification fields needed for endpointing tuning and latency analysis.

create table if not exists public.voice_turn_telemetry (
  id           uuid        primary key default gen_random_uuid(),
  interview_id uuid        not null references public.interviews(id) on delete cascade,
  request_id   text,
  commit_kind  text        not null,
  audio_s      real,
  stt_ms       real,
  oracle_ms    real,
  tts_ms       real,
  gap_ms       real,
  phase        text,
  empty        boolean     not null default false,
  terminal     boolean     not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists voice_turn_telemetry_interview_idx
  on public.voice_turn_telemetry (interview_id);

create index if not exists voice_turn_telemetry_created_idx
  on public.voice_turn_telemetry (created_at desc);

-- RLS enabled with NO policies: the service_role bypasses RLS and is the only
-- writer/reader.  All other roles (anon, authenticated) are implicitly denied
-- because there are no permissive policies granting them access.
alter table public.voice_turn_telemetry enable row level security;

comment on table public.voice_turn_telemetry is
  'Per-turn voice pipeline telemetry. Written exclusively by the backend service role '
  'on behalf of the voice service (which carries no Supabase credentials). '
  'No audio or transcript content is stored here.';
