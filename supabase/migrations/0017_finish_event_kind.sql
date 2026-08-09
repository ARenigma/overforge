-- The /finish path now persists a terminal 'finish' event carrying the end reason
-- (candidate_ended / time_cap) so forensics can always tell WHY an interview ended
-- (the 2026-08-09 session had to infer the End click from a truncated proctor window).
-- 0014's kind CHECK predates this kind — without this relaxation the awaited append
-- throws inside finishAndScore and the End button breaks outright (the exact failure
-- mode 0014 fixed for engagement events). Additive relaxation only; no data change.

alter table interview_events drop constraint if exists interview_events_kind_check;
alter table interview_events add constraint interview_events_kind_check check (
  kind in (
    'transition','utterance','answer','llm_in','llm_out','asr','tts','code_run','score',
    'engagement','observer_note','finish'
  )
);
