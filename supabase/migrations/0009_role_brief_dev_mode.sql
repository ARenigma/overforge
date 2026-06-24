-- Overforge — per-interview role brief + dev-mode flag, both set at creation.
--
-- role_brief: free-text role/JD context. Injected into the oracle (questions tailored to the
-- role) and the scorer (graded against what the role needs). Nullable = no extra context.
alter table interviews add column if not exists role_brief text;

-- dev_mode: a testing interview created by a dev account. Relaxes guards for flow-testing —
-- paste is allowed in the room and the duration is short. Server only honors it for an email in
-- the DEV_EMAILS allowlist (see http layer), so a normal interview can never enable it.
alter table interviews add column if not exists dev_mode boolean not null default false;
