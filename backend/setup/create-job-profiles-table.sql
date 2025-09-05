-- Create job_profiles table
CREATE TABLE IF NOT EXISTS public.job_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    experience_level VARCHAR(100) NOT NULL,
    parameters JSONB NOT NULL,
    master_problem JSONB NOT NULL,
    assessment_criteria JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create assessment_sessions table
CREATE TABLE IF NOT EXISTS public.assessment_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    candidate_id UUID NOT NULL,
    job_profile_id UUID NOT NULL REFERENCES public.job_profiles(id),
    language VARCHAR(50) DEFAULT 'python',
    experience_level VARCHAR(50) DEFAULT 'intermediate',
    current_parameter INTEGER DEFAULT 0,
    current_depth INTEGER DEFAULT 0,
    parameter_scores JSONB DEFAULT '{}',
    assessment_state JSONB DEFAULT '{}',
    code_progress JSONB DEFAULT '{}',
    hints_used INTEGER DEFAULT 0,
    retry_count JSONB DEFAULT '{}',
    overall_score FLOAT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'paused')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_job_profiles_active ON public.job_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_job_profiles_title ON public.job_profiles(title);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_session_id ON public.assessment_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_candidate_id ON public.assessment_sessions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_status ON public.assessment_sessions(status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.job_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for job_profiles (readable by authenticated users)
CREATE POLICY "job_profiles_select_policy" ON public.job_profiles
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create RLS policies for assessment_sessions (users can only access their own sessions)
CREATE POLICY "assessment_sessions_select_policy" ON public.assessment_sessions
    FOR SELECT USING (auth.uid()::text = candidate_id::text);

CREATE POLICY "assessment_sessions_insert_policy" ON public.assessment_sessions
    FOR INSERT WITH CHECK (auth.uid()::text = candidate_id::text);

CREATE POLICY "assessment_sessions_update_policy" ON public.assessment_sessions
    FOR UPDATE USING (auth.uid()::text = candidate_id::text);

-- Grant necessary permissions
GRANT SELECT ON public.job_profiles TO authenticated;
GRANT ALL ON public.assessment_sessions TO authenticated;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_job_profiles_updated_at BEFORE UPDATE ON public.job_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessment_sessions_updated_at BEFORE UPDATE ON public.assessment_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 