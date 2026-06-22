-- Overforge — make a code-run persist fully atomic across all three columns.
--
-- 0005 added append_code_run(uuid, jsonb) which atomically appended to code_runs, but
-- recordRun still wrote code_snapshot + code_language in a SEPARATE updateInterview. Under
-- two concurrent /run calls that split could leave code_runs[-1] describing run B while
-- code_snapshot/code_language described run A — so the scorer (which reads code_snapshot as
-- the candidate's final code) could grade code from a different run than the last logged one.
--
-- Replace the function with one that writes all three fields in a single UPDATE, so a run is
-- persisted as one indivisible unit. Row-level write lock for the statement → no lost update.

drop function if exists public.append_code_run(uuid, jsonb);

create or replace function public.append_code_run(
  p_id       uuid,
  p_run      jsonb,
  p_snapshot text,
  p_language text
)
returns void
language sql
set search_path = ''
as $$
  update public.interviews
  set code_runs     = coalesce(code_runs, '[]'::jsonb) || jsonb_build_array(p_run),
      code_snapshot = p_snapshot,
      code_language = p_language
  where id = p_id;
$$;

-- Backend (service role) only; shrink the PostgREST attack surface (matches 0002/0005).
revoke execute on function public.append_code_run(uuid, jsonb, text, text) from public, anon, authenticated;
grant  execute on function public.append_code_run(uuid, jsonb, text, text) to service_role;

-- Reload PostgREST's schema cache so the new signature is callable immediately after deploy
-- (prevents a PGRST202 "function not found" window for the freshly-shipped backend).
select pg_notify('pgrst', 'reload schema');
