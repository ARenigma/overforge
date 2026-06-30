-- Overforge — candidate-camera anti-cheat signal sink.
--
-- The frontend proctoring module (MediaPipe face detection) has no Supabase
-- credentials; it POSTs aggregated window metrics to the TypeScript backend,
-- which writes rows here via the service-role client.  No video or image data
-- is stored — only per-window timing counts used for advisory scoring context.

create table if not exists public.proctor_signals (
  id             uuid        primary key default gen_random_uuid(),
  interview_id   uuid        not null references public.interviews(id) on delete cascade,
  window_ms      int,
  samples        int,
  face_absent_ms int,
  multi_face_ms  int,
  gaze_off_ms    int,
  max_faces      int,
  created_at     timestamptz not null default now()
);

create index if not exists proctor_signals_interview_idx
  on public.proctor_signals (interview_id);

create index if not exists proctor_signals_interview_created_idx
  on public.proctor_signals (interview_id, created_at);

-- RLS enabled with NO policies: the service_role bypasses RLS and is the only
-- writer/reader.  All other roles (anon, authenticated) are implicitly denied
-- because there are no permissive policies granting them access.
alter table public.proctor_signals enable row level security;

comment on table public.proctor_signals is
  'Per-window camera proctoring signals. Written exclusively by the backend service role '
  'on behalf of the frontend proctoring module (which carries no Supabase credentials). '
  'No video, image, or biometric data is stored here — only timing counts.';
