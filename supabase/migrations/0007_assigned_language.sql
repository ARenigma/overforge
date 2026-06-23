-- Overforge — interviewer-assigned coding language, chosen at interview creation.
--
-- Distinct from code_language (the last language the candidate actually ran): assigned_language
-- is the interviewer's choice for the room. NULL = "candidate chooses" (the room shows the
-- in-room language switcher); a specific value locks the room to that language.
alter table interviews add column if not exists assigned_language text;
