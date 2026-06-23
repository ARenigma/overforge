-- Overforge — interviewer-chosen seniority level, set at interview creation.
--
-- Drives BOTH question generation (the oracle asks level-appropriate questions) and scoring
-- (the rubric is calibrated to the level — a "hire" at senior is a higher bar than at junior).
-- Does NOT change the question count: the flow stays 2 oral → 2 coding, ≤3 follow-ups.
-- Stored as plain text (not an enum) so labels can be adjusted without a migration.
alter table interviews add column if not exists level text not null default 'mid';
