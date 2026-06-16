-- =====================================================
-- QUESTIONS SYSTEM ADD-ON FOR EXISTING DATABASE
-- =====================================================
-- This script adds the questions system while preserving existing tables

-- 1. EXTRACTED PARAMETERS TABLE (NEW)
-- Stores all tech parameters extracted from JDs for dropdown population
CREATE TABLE IF NOT EXISTS extracted_parameters (
    id SERIAL PRIMARY KEY,
    technology_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('core_language', 'tech_stack')),
    subcategory VARCHAR(50), -- 'cloud', 'database', 'framework', 'containerization', etc.
    frameworks JSONB DEFAULT '[]', -- Array of frameworks for core languages
    frequency_count INTEGER DEFAULT 1,
    last_detected TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(technology_name, category, subcategory)
);

-- 2. MASTER PROBLEMS TABLE (NEW)
-- Stores all pre-built coding problems
CREATE TABLE IF NOT EXISTS master_problems (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('core_language', 'tech_stack')),
    technology VARCHAR(100) NOT NULL, -- 'Java', 'Python', 'AWS', etc.
    framework VARCHAR(100), -- 'Spring Boot', 'Django', etc. (optional)
    subcategory VARCHAR(50), -- 'cloud', 'database', 'containerization', etc.
    seniority_level VARCHAR(20) NOT NULL CHECK (seniority_level IN ('junior', 'mid', 'senior')),
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
    time_estimate INTEGER DEFAULT 10, -- minutes
    problem_type VARCHAR(50), -- 'algorithm', 'data_structure', 'api', 'configuration', etc.
    sample_input TEXT,
    sample_output TEXT,
    hints JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]', -- ['arrays', 'sorting', 'strings', etc.]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. EXTEND EXISTING INTERVIEW_SESSIONS TABLE
-- Add new columns to existing table instead of creating interview_sessions_v2
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS core_language VARCHAR(100);
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS core_framework VARCHAR(100);
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS tech_stack VARCHAR(100);
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS tech_subcategory VARCHAR(50);
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS seniority_level VARCHAR(20);
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS core_language_problem_id INTEGER REFERENCES master_problems(id);
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS tech_stack_problem_id INTEGER REFERENCES master_problems(id);

-- Update the experience level mapping
UPDATE interview_sessions SET seniority_level = 
    CASE 
        WHEN "experienceLevel" = 'beginner' THEN 'junior'
        WHEN "experienceLevel" = 'intermediate' THEN 'mid'
        WHEN "experienceLevel" = 'advanced' THEN 'senior'
        ELSE 'mid'
    END
WHERE seniority_level IS NULL;

-- 4. ASSESSMENT RESULTS TABLE (NEW)
-- Stores results for both core language and tech stack assessments
CREATE TABLE IF NOT EXISTS assessment_results (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES interview_sessions(id),
    problem_id INTEGER REFERENCES master_problems(id),
    problem_type VARCHAR(50) NOT NULL, -- 'core_language' or 'tech_stack'
    
    -- Code and Answers
    candidate_code TEXT,
    programming_language VARCHAR(50),
    
    -- Depth Question Results (3 questions per problem)
    depth_1_question TEXT,
    depth_1_answer TEXT,
    depth_1_score DECIMAL(3,2),
    depth_1_passed BOOLEAN,
    
    depth_2_question TEXT,
    depth_2_answer TEXT,
    depth_2_score DECIMAL(3,2),
    depth_2_passed BOOLEAN,
    
    depth_3_question TEXT,
    depth_3_answer TEXT,
    depth_3_score DECIMAL(3,2),
    depth_3_passed BOOLEAN,
    
    -- Overall Scores
    overall_score DECIMAL(3,2),
    completion_time INTEGER, -- minutes
    status VARCHAR(50) DEFAULT 'in_progress',
    
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- 5. TECHNOLOGY COMBINATIONS TABLE (NEW)
-- Pre-defined valid combinations of core language + tech stack
CREATE TABLE IF NOT EXISTS technology_combinations (
    id SERIAL PRIMARY KEY,
    core_language VARCHAR(100) NOT NULL,
    framework VARCHAR(100),
    tech_stack VARCHAR(100) NOT NULL,
    subcategory VARCHAR(50),
    is_popular BOOLEAN DEFAULT false, -- Mark popular combinations
    problem_count INTEGER DEFAULT 0, -- Track available problems
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(core_language, framework, tech_stack, subcategory)
);

-- 6. PROBLEM TAGS TABLE (NEW)
-- For better categorization and search
CREATE TABLE IF NOT EXISTS problem_tags (
    id SERIAL PRIMARY KEY,
    problem_id INTEGER REFERENCES master_problems(id) ON DELETE CASCADE,
    tag_name VARCHAR(50) NOT NULL,
    tag_category VARCHAR(50), -- 'algorithm_type', 'data_structure', 'concept', etc.
    
    UNIQUE(problem_id, tag_name)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Extracted Parameters Indexes
CREATE INDEX IF NOT EXISTS idx_extracted_params_category ON extracted_parameters(category);
CREATE INDEX IF NOT EXISTS idx_extracted_params_tech ON extracted_parameters(technology_name);
CREATE INDEX IF NOT EXISTS idx_extracted_params_frequency ON extracted_parameters(frequency_count DESC);

-- Master Problems Indexes
CREATE INDEX IF NOT EXISTS idx_problems_category ON master_problems(category);
CREATE INDEX IF NOT EXISTS idx_problems_technology ON master_problems(technology);
CREATE INDEX IF NOT EXISTS idx_problems_seniority ON master_problems(seniority_level);
CREATE INDEX IF NOT EXISTS idx_problems_active ON master_problems(is_active);
CREATE INDEX IF NOT EXISTS idx_problems_combo ON master_problems(technology, framework, seniority_level);

-- Enhanced Interview Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_core_language ON interview_sessions(core_language);
CREATE INDEX IF NOT EXISTS idx_sessions_tech_stack ON interview_sessions(tech_stack);
CREATE INDEX IF NOT EXISTS idx_sessions_seniority ON interview_sessions(seniority_level);

-- Assessment Results Indexes  
CREATE INDEX IF NOT EXISTS idx_results_session_id ON assessment_results(session_id);
CREATE INDEX IF NOT EXISTS idx_results_problem_id ON assessment_results(problem_id);
CREATE INDEX IF NOT EXISTS idx_results_problem_type ON assessment_results(problem_type);

-- Technology Combinations Indexes
CREATE INDEX IF NOT EXISTS idx_tech_combo_popular ON technology_combinations(is_popular);
CREATE INDEX IF NOT EXISTS idx_tech_combo_core ON technology_combinations(core_language);
CREATE INDEX IF NOT EXISTS idx_tech_combo_stack ON technology_combinations(tech_stack);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get problems for specific parameters
CREATE OR REPLACE FUNCTION get_problems_for_parameters(
    p_core_language VARCHAR(100),
    p_framework VARCHAR(100) DEFAULT NULL,
    p_tech_stack VARCHAR(100),
    p_subcategory VARCHAR(50) DEFAULT NULL,
    p_seniority VARCHAR(20)
)
RETURNS TABLE (
    core_problem_id INTEGER,
    core_problem_title VARCHAR(200),
    core_problem_description TEXT,
    tech_problem_id INTEGER,
    tech_problem_title VARCHAR(200),
    tech_problem_description TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH core_problems AS (
        SELECT id, title, description
        FROM master_problems 
        WHERE category = 'core_language'
        AND technology = p_core_language
        AND (framework = p_framework OR (framework IS NULL AND p_framework IS NULL))
        AND seniority_level = p_seniority
        AND is_active = true
        ORDER BY RANDOM()
        LIMIT 1
    ),
    tech_problems AS (
        SELECT id, title, description
        FROM master_problems 
        WHERE category = 'tech_stack'
        AND technology = p_tech_stack
        AND (subcategory = p_subcategory OR p_subcategory IS NULL)
        AND seniority_level = p_seniority
        AND is_active = true
        ORDER BY RANDOM()
        LIMIT 1
    )
    SELECT 
        cp.id::INTEGER,
        cp.title::VARCHAR(200),
        cp.description::TEXT,
        tp.id::INTEGER,
        tp.title::VARCHAR(200),
        tp.description::TEXT
    FROM core_problems cp
    CROSS JOIN tech_problems tp;
END;
$$ LANGUAGE plpgsql;

-- Function to increment parameter frequency when detected
CREATE OR REPLACE FUNCTION upsert_extracted_parameter(
    p_technology_name VARCHAR(100),
    p_category VARCHAR(50),
    p_subcategory VARCHAR(50) DEFAULT NULL,
    p_frameworks JSONB DEFAULT '[]'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO extracted_parameters (technology_name, category, subcategory, frameworks, frequency_count)
    VALUES (p_technology_name, p_category, p_subcategory, p_frameworks, 1)
    ON CONFLICT (technology_name, category, subcategory)
    DO UPDATE SET 
        frequency_count = extracted_parameters.frequency_count + 1,
        last_detected = NOW(),
        frameworks = CASE 
            WHEN p_frameworks IS NOT NULL AND p_frameworks != '[]'::jsonb 
            THEN p_frameworks 
            ELSE extracted_parameters.frameworks 
        END;
END;
$$ LANGUAGE plpgsql;

-- Function to get available core languages with frameworks
CREATE OR REPLACE FUNCTION get_core_languages_with_frameworks()
RETURNS TABLE (
    technology_name VARCHAR(100),
    frameworks JSONB,
    problem_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ep.technology_name,
        ep.frameworks,
        COUNT(mp.id) as problem_count
    FROM extracted_parameters ep
    LEFT JOIN master_problems mp ON (
        mp.technology = ep.technology_name 
        AND mp.category = 'core_language'
        AND mp.is_active = true
    )
    WHERE ep.category = 'core_language'
    GROUP BY ep.technology_name, ep.frameworks
    ORDER BY problem_count DESC, ep.frequency_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get tech stacks by subcategory
CREATE OR REPLACE FUNCTION get_tech_stacks_by_subcategory()
RETURNS TABLE (
    subcategory VARCHAR(50),
    technologies JSONB,
    total_problems BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(ep.subcategory, 'general') as subcategory,
        jsonb_agg(
            jsonb_build_object(
                'name', ep.technology_name,
                'frequency', ep.frequency_count,
                'problem_count', COALESCE(problem_counts.cnt, 0)
            )
        ) as technologies,
        COALESCE(SUM(problem_counts.cnt), 0) as total_problems
    FROM extracted_parameters ep
    LEFT JOIN (
        SELECT technology, COUNT(*) as cnt
        FROM master_problems 
        WHERE category = 'tech_stack' AND is_active = true
        GROUP BY technology
    ) problem_counts ON problem_counts.technology = ep.technology_name
    WHERE ep.category = 'tech_stack'
    GROUP BY COALESCE(ep.subcategory, 'general')
    ORDER BY total_problems DESC;
END;
$$ LANGUAGE plpgsql;

-- View for problems with full details
CREATE OR REPLACE VIEW problems_with_details AS
SELECT 
    mp.id,
    mp.title,
    mp.description,
    mp.category,
    mp.technology,
    mp.framework,
    mp.subcategory,
    mp.seniority_level,
    mp.difficulty_level,
    mp.time_estimate,
    mp.problem_type,
    mp.sample_input,
    mp.sample_output,
    mp.hints,
    mp.tags,
    mp.is_active,
    mp.created_at,
    mp.updated_at,
    array_agg(DISTINCT pt.tag_name) FILTER (WHERE pt.tag_name IS NOT NULL) as all_tags
FROM master_problems mp
LEFT JOIN problem_tags pt ON mp.id = pt.problem_id
WHERE mp.is_active = true
GROUP BY mp.id, mp.title, mp.description, mp.category, mp.technology, 
         mp.framework, mp.subcategory, mp.seniority_level, mp.difficulty_level, 
         mp.time_estimate, mp.problem_type, mp.tags;

-- Update existing interview sessions to include technology info based on their current language
UPDATE interview_sessions 
SET 
    core_language = 
        CASE 
            WHEN language = 'javascript' THEN 'JavaScript'
            WHEN language = 'python' THEN 'Python'
            WHEN language = 'java' THEN 'Java'
            WHEN language = 'typescript' THEN 'TypeScript'
            WHEN language = 'csharp' THEN 'C#'
            WHEN language = 'go' THEN 'Go'
            WHEN language = 'php' THEN 'PHP'
            WHEN language = 'ruby' THEN 'Ruby'
            ELSE 'JavaScript'
        END,
    tech_stack = 'AWS'  -- Default tech stack, can be updated based on business logic
WHERE core_language IS NULL; 