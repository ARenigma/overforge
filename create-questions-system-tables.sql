-- =====================================================
-- QUESTIONS SYSTEM DATABASE SCHEMA
-- =====================================================

-- 1. EXTRACTED PARAMETERS TABLE
-- Stores all tech parameters extracted from JDs for dropdown population
CREATE TABLE extracted_parameters (
    id SERIAL PRIMARY KEY,
    technology_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('core_language', 'tech_stack')),
    subcategory VARCHAR(50), -- 'cloud', 'database', 'framework', etc.
    frameworks JSONB DEFAULT '[]', -- Array of frameworks for core languages
    frequency_count INTEGER DEFAULT 1,
    last_detected TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(technology_name, category, subcategory)
);

-- 2. MASTER PROBLEMS TABLE  
-- Stores all pre-built coding problems
CREATE TABLE master_problems (
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

-- 3. INTERVIEW SESSIONS TABLE (Enhanced)
-- Links sessions to selected parameters and problems
CREATE TABLE interview_sessions_v2 (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    interviewer_id UUID REFERENCES auth.users(id),
    candidate_id VARCHAR(255),
    job_profile_id INTEGER, -- Optional, if created from JD
    
    -- Selected Parameters
    core_language VARCHAR(100) NOT NULL,
    core_framework VARCHAR(100), -- Optional
    tech_stack VARCHAR(100) NOT NULL,
    tech_subcategory VARCHAR(50), -- 'cloud', 'database', etc.
    seniority_level VARCHAR(20) NOT NULL,
    
    -- Assigned Problems
    core_language_problem_id INTEGER REFERENCES master_problems(id),
    tech_stack_problem_id INTEGER REFERENCES master_problems(id),
    
    -- Session Status
    status VARCHAR(50) DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'completed', 'cancelled')),
    session_data JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- 4. ASSESSMENT RESULTS TABLE
-- Stores results for both core language and tech stack assessments
CREATE TABLE assessment_results_v2 (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) REFERENCES interview_sessions_v2(session_id),
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

-- 5. TECHNOLOGY COMBINATIONS TABLE
-- Pre-defined valid combinations of core language + tech stack
CREATE TABLE technology_combinations (
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

-- 6. PROBLEM TAGS TABLE
-- For better categorization and search
CREATE TABLE problem_tags (
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
CREATE INDEX idx_extracted_params_category ON extracted_parameters(category);
CREATE INDEX idx_extracted_params_tech ON extracted_parameters(technology_name);
CREATE INDEX idx_extracted_params_frequency ON extracted_parameters(frequency_count DESC);

-- Master Problems Indexes
CREATE INDEX idx_problems_category ON master_problems(category);
CREATE INDEX idx_problems_technology ON master_problems(technology);
CREATE INDEX idx_problems_seniority ON master_problems(seniority_level);
CREATE INDEX idx_problems_active ON master_problems(is_active);
CREATE INDEX idx_problems_combo ON master_problems(technology, framework, seniority_level);

-- Interview Sessions Indexes
CREATE INDEX idx_sessions_session_id ON interview_sessions_v2(session_id);
CREATE INDEX idx_sessions_interviewer ON interview_sessions_v2(interviewer_id);
CREATE INDEX idx_sessions_core_language ON interview_sessions_v2(core_language);
CREATE INDEX idx_sessions_tech_stack ON interview_sessions_v2(tech_stack);

-- Assessment Results Indexes  
CREATE INDEX idx_results_session_id ON assessment_results_v2(session_id);
CREATE INDEX idx_results_problem_id ON assessment_results_v2(problem_id);
CREATE INDEX idx_results_problem_type ON assessment_results_v2(problem_type);

-- Technology Combinations Indexes
CREATE INDEX idx_tech_combo_popular ON technology_combinations(is_popular);
CREATE INDEX idx_tech_combo_core ON technology_combinations(core_language);
CREATE INDEX idx_tech_combo_stack ON technology_combinations(tech_stack);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_extracted_parameters_updated_at 
    BEFORE UPDATE ON extracted_parameters 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_master_problems_updated_at 
    BEFORE UPDATE ON master_problems 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to increment frequency count
CREATE OR REPLACE FUNCTION increment_parameter_frequency()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE extracted_parameters 
    SET frequency_count = frequency_count + 1,
        last_detected = NOW()
    WHERE technology_name = NEW.technology_name 
      AND category = NEW.category;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on sensitive tables
ALTER TABLE interview_sessions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_results_v2 ENABLE ROW LEVEL SECURITY;

-- Policies for interview_sessions_v2
CREATE POLICY "Interviewers can manage their own sessions" ON interview_sessions_v2
    FOR ALL USING (auth.uid() = interviewer_id);

CREATE POLICY "Public read access to session basic info" ON interview_sessions_v2
    FOR SELECT USING (true);

-- Policies for assessment_results_v2
CREATE POLICY "Interviewers can view results for their sessions" ON assessment_results_v2
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM interview_sessions_v2 
            WHERE session_id = assessment_results_v2.session_id 
            AND interviewer_id = auth.uid()
        )
    );

-- =====================================================
-- INITIAL SEED DATA SETUP
-- =====================================================

-- This will be populated by the seed data script
-- Run the seed data script after creating these tables 