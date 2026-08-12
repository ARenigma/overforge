-- Migration 0018: per-turn shadow STT observations (A/B/C comparison)
--
-- One row per configured shadow engine per turn, referenced by interview_id + request_id
-- (same key as voice_turn_telemetry). RLS is enabled with ZERO policies so only the
-- service-role client can read/write — telemetry rows are never exposed to candidates.
--
-- Do NOT apply manually — the orchestrator applies migrations in order at deploy time.

create table if not exists public.voice_turn_shadows (
  id             uuid         primary key default gen_random_uuid(),
  interview_id   uuid         not null references interviews(id) on delete cascade,
  request_id     text         not null,
  engine         text         not null,         -- "soniox" | "deepgram"
  transcript     text,                          -- shadow transcript for this window
  stt_ms         double precision,              -- window-start → last final token (ms)
  endpoint_ms    double precision,              -- window-start → shadow's first EOT (ms); null = never fired
  endpoint_count integer,                       -- shadow EOT decisions in window (0 = never, ≥2 = would split)
  finalize_lag_ms double precision,             -- flush-sent → last is_final (ms); null for Deepgram
  second_voice_ms double precision,             -- ms attributed to non-primary speakers (positional, not identity)
  speaker_count  integer,                       -- distinct speaker labels; null when unavailable
  created_at     timestamptz  default now()
);

-- Enable RLS; zero policies — service-role only.
alter table public.voice_turn_shadows enable row level security;

-- Index for the most common query: all shadow rows for one interview, ordered by request.
create index if not exists voice_turn_shadows_interview_request_idx
  on public.voice_turn_shadows (interview_id, request_id);
