-- Supabase Schema Migration
-- Run this in Supabase SQL Editor to create all tables

-- Create Users table
CREATE TABLE IF NOT EXISTS "Users" (
    "id" SERIAL PRIMARY KEY,
    "username" VARCHAR(255) NOT NULL UNIQUE,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "password" VARCHAR(255) NOT NULL,
    "firstName" VARCHAR(255) NOT NULL,
    "lastName" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'candidate' CHECK ("role" IN ('interviewer', 'candidate', 'admin')),
    "isActive" BOOLEAN DEFAULT true,
    "lastLogin" TIMESTAMP WITH TIME ZONE,
    "organization" VARCHAR(255),
    "department" VARCHAR(255),
    "experience" VARCHAR(50) CHECK ("experience" IN ('beginner', 'intermediate', 'advanced')),
    "preferredLanguage" VARCHAR(255),
    "profilePicture" VARCHAR(255),
    "bio" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for Users table
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "Users" ("email");
CREATE INDEX IF NOT EXISTS "users_username_idx" ON "Users" ("username");
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "Users" ("role");

-- Create interview_sessions table
CREATE TABLE IF NOT EXISTS "interview_sessions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "sessionCode" VARCHAR(8) NOT NULL UNIQUE,
    "title" VARCHAR(255) NOT NULL,
    "jobDescription" TEXT NOT NULL,
    "language" VARCHAR(255) NOT NULL DEFAULT 'javascript',
    "experienceLevel" VARCHAR(50) NOT NULL DEFAULT 'intermediate' CHECK ("experienceLevel" IN ('beginner', 'intermediate', 'advanced')),
    "status" VARCHAR(50) NOT NULL DEFAULT 'created' CHECK ("status" IN ('created', 'active', 'completed', 'cancelled')),
    "interviewerId" INTEGER NOT NULL REFERENCES "Users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "candidateId" INTEGER REFERENCES "Users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    "maxDuration" INTEGER DEFAULT 60,
    "allowHints" BOOLEAN DEFAULT true,
    "maxMainHints" INTEGER DEFAULT 3,
    "maxParameterHints" INTEGER DEFAULT 1,
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "completedAt" TIMESTAMP WITH TIME ZONE,
    "extractedParameters" JSONB,
    "mainProblem" TEXT,
    "finalScore" INTEGER,
    "maxScore" INTEGER DEFAULT 9,
    "assessmentData" JSONB,
    "isPublic" BOOLEAN DEFAULT false,
    "allowedCandidateEmails" JSONB,
    "notes" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for interview_sessions table
CREATE INDEX IF NOT EXISTS "interview_sessions_session_code_idx" ON "interview_sessions" ("sessionCode");
CREATE INDEX IF NOT EXISTS "interview_sessions_interviewer_id_idx" ON "interview_sessions" ("interviewerId");
CREATE INDEX IF NOT EXISTS "interview_sessions_candidate_id_idx" ON "interview_sessions" ("candidateId");
CREATE INDEX IF NOT EXISTS "interview_sessions_status_idx" ON "interview_sessions" ("status");

-- Create rooms table (if still needed for legacy support)
CREATE TABLE IF NOT EXISTS "rooms" (
    "id" SERIAL PRIMARY KEY,
    "roomId" VARCHAR(255) NOT NULL UNIQUE,
    "createdBy" INTEGER REFERENCES "Users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    "language" VARCHAR(255) DEFAULT 'javascript',
    "experience" VARCHAR(50) DEFAULT 'intermediate' CHECK ("experience" IN ('beginner', 'intermediate', 'advanced')),
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for rooms table
CREATE INDEX IF NOT EXISTS "rooms_room_id_idx" ON "rooms" ("roomId");
CREATE INDEX IF NOT EXISTS "rooms_created_by_idx" ON "rooms" ("createdBy");

-- Enable Row Level Security
ALTER TABLE "Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interview_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Users table
CREATE POLICY "Users can view own profile" ON "Users"
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON "Users"
    FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Allow user registration" ON "Users"
    FOR INSERT WITH CHECK (true);

-- RLS Policies for interview_sessions table
CREATE POLICY "Interviewers can manage their sessions" ON "interview_sessions"
    FOR ALL USING (auth.uid()::text = "interviewerId"::text);

CREATE POLICY "Candidates can view assigned sessions" ON "interview_sessions"
    FOR SELECT USING (
        auth.uid()::text = "candidateId"::text OR 
        "isPublic" = true
    );

CREATE POLICY "Candidates can update assigned sessions" ON "interview_sessions"
    FOR UPDATE USING (auth.uid()::text = "candidateId"::text);

-- RLS Policies for rooms table
CREATE POLICY "Users can manage their rooms" ON "rooms"
    FOR ALL USING (auth.uid()::text = "createdBy"::text);

CREATE POLICY "Public rooms are viewable" ON "rooms"
    FOR SELECT USING ("isActive" = true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON "Users"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interview_sessions_updated_at BEFORE UPDATE ON "interview_sessions"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON "rooms"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data (optional)
-- INSERT INTO "Users" ("username", "email", "password", "firstName", "lastName", "role")
-- VALUES 
--     ('admin', 'admin@overforge.com', '$2a$10$example', 'Admin', 'User', 'admin'),
--     ('interviewer1', 'interviewer@company.com', '$2a$10$example', 'John', 'Interviewer', 'interviewer'),
--     ('candidate1', 'candidate@email.com', '$2a$10$example', 'Jane', 'Candidate', 'candidate');

-- Grant necessary permissions (if needed)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres; 