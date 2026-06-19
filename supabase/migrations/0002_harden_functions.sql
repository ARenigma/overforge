-- Hardening per Supabase security advisor (applied live to the alpha project).

-- 1) Pin set_updated_at's search_path (function_search_path_mutable WARN).
--    now() resolves via pg_catalog regardless, so '' is safe.
alter function public.set_updated_at() set search_path = '';

-- 2) public.rls_auto_enable() is a pre-existing event-trigger helper (RLS-by-default
--    on new public tables; owned by postgres, search_path pinned). It never needs to
--    be callable via PostgREST RPC, so revoke EXECUTE from client roles to shrink the
--    attack surface (the event trigger still fires on DDL regardless of these grants).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Note: interview_events and notify_outbox intentionally have RLS enabled with NO
-- policies — they are service-role-only (the advisor flags this as INFO, by design).
