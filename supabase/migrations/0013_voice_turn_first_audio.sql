-- Add per-turn TTFB column to voice turn telemetry.
--
-- first_audio_ms: browser-measured time (ms) from turn_ready receipt to the first PCM audio
-- sample being scheduled for playback (performance.now() delta).  Null for rows inserted by
-- older clients that pre-date this field, and for turns where TTS failed entirely.
--
-- double precision chosen for sub-millisecond resolution (performance.now() returns a DOMHighResTimeStamp).
-- Applied MANUALLY to prod (like 0003/0011/0012 — the deploy pipeline does not run migrations);
-- applied 2026-07-11, BEFORE the backend that inserts the column deploys. Idempotent.

alter table public.voice_turn_telemetry
  add column if not exists first_audio_ms double precision;
