-- Fix missing columns in assessment_sessions table
-- Run this in Supabase SQL Editor

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    -- Add language column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'assessment_sessions' 
                   AND column_name = 'language') THEN
        ALTER TABLE public.assessment_sessions 
        ADD COLUMN language VARCHAR(50) DEFAULT 'python';
    END IF;

    -- Add experience_level column if it doesn't exist  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'assessment_sessions' 
                   AND column_name = 'experience_level') THEN
        ALTER TABLE public.assessment_sessions 
        ADD COLUMN experience_level VARCHAR(50) DEFAULT 'intermediate';
    END IF;
END $$;

-- Update existing rows to have default values
UPDATE public.assessment_sessions 
SET language = 'python' 
WHERE language IS NULL;

UPDATE public.assessment_sessions 
SET experience_level = 'intermediate' 
WHERE experience_level IS NULL;

-- Add NOT NULL constraints
ALTER TABLE public.assessment_sessions 
ALTER COLUMN language SET NOT NULL;

ALTER TABLE public.assessment_sessions 
ALTER COLUMN experience_level SET NOT NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'assessment_sessions' 
AND column_name IN ('language', 'experience_level'); 