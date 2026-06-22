-- Overforge — answer idempotency + live spectating.

-- Idempotency key for the last processed /answer (dedupes a retry after a lost response).
alter table interviews add column if not exists last_request_id text;

-- Live spectating: the interviewer's detail view subscribes to the interview row via
-- Supabase Realtime. Add the table to the realtime publication (idempotent) and set
-- REPLICA IDENTITY FULL so UPDATE events carry the full row for RLS filtering.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interviews'
  ) then
    alter publication supabase_realtime add table interviews;
  end if;
end $$;

alter table interviews replica identity full;
