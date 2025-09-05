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
        RAISE NOTICE 'Added language column';
    ELSE
        RAISE NOTICE 'Language column already exists';
    END IF;

    -- Add experience_level column if it doesn't exist  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'assessment_sessions' 
                   AND column_name = 'experience_level') THEN
        ALTER TABLE public.assessment_sessions 
        ADD COLUMN experience_level VARCHAR(50) DEFAULT 'intermediate';
        RAISE NOTICE 'Added experience_level column';
    ELSE
        RAISE NOTICE 'Experience_level column already exists';
    END IF;
END $$;

-- Update existing rows to have default values
UPDATE public.assessment_sessions 
SET language = 'python' 
WHERE language IS NULL;

UPDATE public.assessment_sessions 
SET experience_level = 'intermediate' 
WHERE experience_level IS NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'assessment_sessions' 
AND column_name IN ('language', 'experience_level')
ORDER BY column_name; 