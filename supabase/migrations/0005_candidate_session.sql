-- Overforge — candidate session polish: persisted language + atomic code-run append.

-- 1) Persist the candidate's chosen editor language so it survives reload/reconnect and is
--    visible to the interviewer/scorer. Nullable: existing rows + interviews with no run yet
--    report NULL (the client falls back to its localStorage choice, else 'python').
alter table interviews add column if not exists code_language text;

-- 2) Atomic append to interviews.code_runs. The previous JS read-modify-write
--    (SELECT code_runs -> push -> UPDATE whole array) could lose a concurrent run.
--    A single UPDATE with jsonb concatenation takes a row-level write lock for the
--    statement, so two concurrent appends can never clobber each other.
--    SECURITY INVOKER (default): the backend service role runs it; RLS still applies to
--    any other caller. search_path pinned per the security advisor (see 0002).
create or replace function public.append_code_run(p_id uuid, p_run jsonb)
returns void
language sql
set search_path = ''
as $$
  update public.interviews
  set code_runs = coalesce(code_runs, '[]'::jsonb) || jsonb_build_array(p_run)
  where id = p_id;
$$;

-- Only the backend (service role) should invoke this; shrink the PostgREST attack surface.
revoke execute on function public.append_code_run(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.append_code_run(uuid, jsonb) to service_role;
