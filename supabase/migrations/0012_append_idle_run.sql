-- Overforge — append a synthetic run to code_runs WITHOUT touching code_snapshot / code_language.
--
-- Path B (stuck-not-running) records an idle check-in as a synthetic run (status:'Idle') on the
-- code-run channel so it persists race-free (no fsm_state / transcript write). Unlike a real /run,
-- an idle marker carries NO candidate source — it must NOT overwrite code_snapshot (the last real
-- editor content the scorer reads) or code_language. append_code_run always rewrites those two
-- columns, so reusing it here could revert the snapshot to a stale value under a rare concurrent
-- run. This variant appends the run only, atomically, under the same row-level write lock.

create or replace function public.append_code_run_only(
  p_id  uuid,
  p_run jsonb
)
returns void
language sql
set search_path = ''
as $$
  update public.interviews
  set code_runs = coalesce(code_runs, '[]'::jsonb) || jsonb_build_array(p_run)
  where id = p_id;
$$;

-- Backend (service role) only; shrink the PostgREST attack surface (matches 0002/0005/0006).
revoke execute on function public.append_code_run_only(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.append_code_run_only(uuid, jsonb) to service_role;

-- Reload PostgREST's schema cache so the new function is callable immediately after deploy.
select pg_notify('pgrst', 'reload schema');
