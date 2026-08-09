-- The outbox drain's exponential backoff (makeOutboxStore.claimPending) reads
-- notify_outbox.updated_at, but the column was never created — every drain cycle has been
-- throwing `column notify_outbox.updated_at does not exist`, so no scorecard email has been
-- delivered since the backoff shipped (observed live 2026-08-09, interview e3c07b8f).

alter table notify_outbox
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows: seed from created_at so backoff math starts sane, not "just now".
update notify_outbox set updated_at = created_at where updated_at > created_at;

-- Refresh on every UPDATE (claim bumps, status flips) — the backoff reads this as
-- "time of last attempt". moddatetime ships with Supabase.
create extension if not exists moddatetime;
drop trigger if exists notify_outbox_set_updated_at on notify_outbox;
create trigger notify_outbox_set_updated_at
  before update on notify_outbox
  for each row execute procedure moddatetime (updated_at);
