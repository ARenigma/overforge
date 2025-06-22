-- =====================================================
-- ADDITIONAL INDEXES AND UTILITY FUNCTIONS
-- =====================================================

-- Additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_master_problems_search 
ON master_problems USING gin(to_tsvector('english', title || ' ' || description));

CREATE INDEX IF NOT EXISTS idx_problems_time_estimate 
ON master_problems(time_estimate) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_problems_difficulty 
ON master_problems(difficulty_level) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_session_status 
ON interview_sessions_v2(status, created_at);

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to get available problems for given criteria
CREATE OR REPLACE FUNCTION get_available_problems(
    p_core_language VARCHAR(100),
    p_tech_stack VARCHAR(100),
    p_framework VARCHAR(100) DEFAULT NULL,
    p_subcategory VARCHAR(50) DEFAULT NULL,
    p_seniority VARCHAR(20) DEFAULT 'mid'
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

-- Function to search problems by text
CREATE OR REPLACE FUNCTION search_problems(
    search_text TEXT,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    title VARCHAR(200),
    description TEXT,
    technology VARCHAR(100),
    category VARCHAR(50),
    seniority_level VARCHAR(20),
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mp.id,
        mp.title,
        mp.description,
        mp.technology,
        mp.category,
        mp.seniority_level,
        ts_rank(to_tsvector('english', mp.title || ' ' || mp.description), plainto_tsquery('english', search_text)) as rank
    FROM master_problems mp
    WHERE to_tsvector('english', mp.title || ' ' || mp.description) @@ plainto_tsquery('english', search_text)
    AND mp.is_active = true
    ORDER BY rank DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get technology statistics
CREATE OR REPLACE FUNCTION get_technology_stats()
RETURNS TABLE (
    technology VARCHAR(100),
    category VARCHAR(50),
    problem_count BIGINT,
    avg_difficulty NUMERIC,
    avg_time_estimate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mp.technology,
        mp.category,
        COUNT(*) as problem_count,
        AVG(mp.difficulty_level) as avg_difficulty,
        AVG(mp.time_estimate) as avg_time_estimate
    FROM master_problems mp
    WHERE mp.is_active = true
    GROUP BY mp.technology, mp.category
    ORDER BY problem_count DESC;
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

-- Function to get popular technology combinations
CREATE OR REPLACE FUNCTION get_popular_combinations(limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
    core_language VARCHAR(100),
    framework VARCHAR(100),
    tech_stack VARCHAR(100),
    subcategory VARCHAR(50),
    problem_count INTEGER,
    is_popular BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tc.core_language,
        tc.framework,
        tc.tech_stack,
        tc.subcategory,
        tc.problem_count,
        tc.is_popular
    FROM technology_combinations tc
    ORDER BY tc.is_popular DESC, tc.problem_count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to create a new interview session
CREATE OR REPLACE FUNCTION create_interview_session(
    p_interviewer_id UUID,
    p_core_language VARCHAR(100),
    p_tech_stack VARCHAR(100),
    p_core_framework VARCHAR(100) DEFAULT NULL,
    p_tech_subcategory VARCHAR(50) DEFAULT NULL,
    p_seniority_level VARCHAR(20) DEFAULT 'mid',
    p_job_profile_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    session_id VARCHAR(255),
    core_problem_id INTEGER,
    core_problem_title VARCHAR(200),
    tech_problem_id INTEGER,
    tech_problem_title VARCHAR(200)
) AS $$
DECLARE
    v_session_id VARCHAR(255);
    v_core_problem_id INTEGER;
    v_tech_problem_id INTEGER;
    v_core_problem_title VARCHAR(200);
    v_tech_problem_title VARCHAR(200);
BEGIN
    -- Generate unique session ID
    v_session_id := 'session_' || encode(gen_random_bytes(16), 'hex');
    
    -- Get random problems for the combination
    SELECT core_problem_id, core_problem_title, tech_problem_id, tech_problem_title
    INTO v_core_problem_id, v_core_problem_title, v_tech_problem_id, v_tech_problem_title
    FROM get_available_problems(p_core_language, p_tech_stack, p_core_framework, p_tech_subcategory, p_seniority_level);
    
    -- Insert interview session
    INSERT INTO interview_sessions_v2 (
        session_id, interviewer_id, job_profile_id,
        core_language, core_framework, tech_stack, tech_subcategory, seniority_level,
        core_language_problem_id, tech_stack_problem_id
    ) VALUES (
        v_session_id, p_interviewer_id, p_job_profile_id,
        p_core_language, p_core_framework, p_tech_stack, p_tech_subcategory, p_seniority_level,
        v_core_problem_id, v_tech_problem_id
    );
    
    RETURN QUERY
    SELECT v_session_id, v_core_problem_id, v_core_problem_title, v_tech_problem_id, v_tech_problem_title;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS FOR EASY QUERYING
-- =====================================================

-- View for active problems with technology info
CREATE OR REPLACE VIEW active_problems_view AS
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
    mp.tags,
    array_agg(pt.tag_name) FILTER (WHERE pt.tag_name IS NOT NULL) as tag_list
FROM master_problems mp
LEFT JOIN problem_tags pt ON mp.id = pt.problem_id
WHERE mp.is_active = true
GROUP BY mp.id, mp.title, mp.description, mp.category, mp.technology, 
         mp.framework, mp.subcategory, mp.seniority_level, mp.difficulty_level, 
         mp.time_estimate, mp.problem_type, mp.tags;

-- View for session results summary
CREATE OR REPLACE VIEW session_results_summary AS
SELECT 
    s.session_id,
    s.core_language,
    s.core_framework,
    s.tech_stack,
    s.tech_subcategory,
    s.seniority_level,
    s.status,
    s.created_at,
    s.started_at,
    s.completed_at,
    cp.title as core_problem_title,
    tp.title as tech_problem_title,
    AVG(CASE WHEN ar.problem_type = 'core_language' THEN ar.overall_score END) as core_avg_score,
    AVG(CASE WHEN ar.problem_type = 'tech_stack' THEN ar.overall_score END) as tech_avg_score,
    SUM(ar.completion_time) as total_time
FROM interview_sessions_v2 s
LEFT JOIN master_problems cp ON s.core_language_problem_id = cp.id
LEFT JOIN master_problems tp ON s.tech_stack_problem_id = tp.id
LEFT JOIN assessment_results_v2 ar ON s.session_id = ar.session_id
GROUP BY s.session_id, s.core_language, s.core_framework, s.tech_stack, 
         s.tech_subcategory, s.seniority_level, s.status, s.created_at, 
         s.started_at, s.completed_at, cp.title, tp.title;

-- =====================================================
-- MAINTENANCE FUNCTIONS
-- =====================================================

-- Function to cleanup old sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM interview_sessions_v2 
    WHERE created_at < NOW() - INTERVAL '%s days' AND status = 'cancelled';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update problem statistics
CREATE OR REPLACE FUNCTION update_problem_statistics()
RETURNS VOID AS $$
BEGIN
    -- Update technology combinations problem counts
    UPDATE technology_combinations 
    SET problem_count = (
        SELECT COUNT(*) 
        FROM master_problems mp
        WHERE mp.is_active = true
        AND (
            (mp.category = 'core_language' AND mp.technology = technology_combinations.core_language 
             AND (mp.framework = technology_combinations.framework OR (mp.framework IS NULL AND technology_combinations.framework IS NULL)))
            OR 
            (mp.category = 'tech_stack' AND mp.technology = technology_combinations.tech_stack
             AND (mp.subcategory = technology_combinations.subcategory OR technology_combinations.subcategory IS NULL))
        )
    );
    
    -- Update extracted parameters frequency
    UPDATE extracted_parameters 
    SET frequency_count = (
        SELECT COUNT(*) 
        FROM interview_sessions_v2 s
        WHERE (s.core_language = extracted_parameters.technology_name OR s.tech_stack = extracted_parameters.technology_name)
        AND s.created_at > NOW() - INTERVAL '30 days'
    )
    WHERE frequency_count = 0;
END;
$$ LANGUAGE plpgsql; 