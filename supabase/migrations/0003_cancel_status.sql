-- Overforge — interviewer-initiated cancel.
-- Soft-cancel keeps the row + transcript for audit; a separate hard DELETE (GDPR erasure)
-- removes the row entirely via the backend. Idempotent: safe to re-run.
alter type interview_status add value if not exists 'cancelled';
