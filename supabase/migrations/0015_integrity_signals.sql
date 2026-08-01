-- Overforge — integrity signal sink for advisory anti-cheat observations.
--
-- Stores one row per discrete integrity event from any source:
--   * 'second_voice'    — shadow STT diarization detected >1 speaker in a turn
--   * 'blur'            — browser window lost focus (candidate may have alt-tabbed)
--   * 'hidden'          — visibilitychange: page hidden (tab-switch / minimize)
--   * 'fullscreen_exit' — candidate left enforced fullscreen
--   * 'paste_blocked'   — paste attempt in the code editor (shape only, never content)
--   * 'multi_monitor'   — screen.isExtended detected an external display
--
-- ONLY 'second_voice' is wired in this migration (backend: /voice-turn route).
-- The remaining kinds are pre-declared so later browser-lockdown work needs no schema migration.
--
-- LEGAL: signals are advisory context only — they must be STRUCTURALLY INCAPABLE of altering
-- the numeric score (asserted by the scorer isolation test). No audio, image, or biometric data
-- is stored here — only counts, timestamps, and opaque detail blobs.
-- The 'second_voice' kind uses positional speaker labels from diarization, never voiceprints
-- or enrolled identities; it cannot and does not name any individual.

create table if not exists public.integrity_signals (
  id           uuid        primary key default gen_random_uuid(),
  interview_id uuid        not null references public.interviews(id) on delete cascade,
  kind         text        not null check (
                             kind in (
                               'second_voice',
                               'blur',
                               'hidden',
                               'fullscreen_exit',
                               'paste_blocked',
                               'multi_monitor'
                             )
                           ),
  at           timestamptz not null default now(),
  duration_ms  int         null,
  detail       jsonb       not null default '{}'
);

create index if not exists integrity_signals_interview_at_idx
  on public.integrity_signals (interview_id, at);

-- RLS enabled with NO policies: the service_role bypasses RLS and is the only
-- writer/reader.  All other roles (anon, authenticated) are implicitly denied
-- because there are no permissive policies granting them access.
alter table public.integrity_signals enable row level security;

comment on table public.integrity_signals is
  'Per-event advisory integrity signals. Written exclusively by the backend service role. '
  'Signals are observational context only — they MUST NOT alter numeric scores (enforced by '
  'the scorer isolation test). No audio, video, or biometric data is stored; ''second_voice'' '
  'uses positional diarization labels, never enrolled voiceprints.';
