-- The Attentive Interviewer (docs/ADAPTIVE_INTERVIEWER_DESIGN.md §6.6) persists engagement-state
-- transitions and observer notes as interview_events rows, but 0001's kind CHECK predates those
-- kinds — every insert was rejected (and swallowed by fire-and-forget callers), so the audit
-- trail silently never materialized. Additive relaxation only; no data change.

alter table interview_events drop constraint if exists interview_events_kind_check;
alter table interview_events add constraint interview_events_kind_check check (
  kind in (
    'transition','utterance','answer','llm_in','llm_out','asr','tts','code_run','score',
    'engagement','observer_note'
  )
);
