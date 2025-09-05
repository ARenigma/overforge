const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for admin operations
);

async function setupDatabase() {
  try {
    console.log('🚀 Setting up database tables...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create-job-profiles-table.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL commands by semicolon and execute them one by one
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    console.log(`📝 Executing ${commands.length} SQL commands...`);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.trim()) {
        console.log(`⏳ Executing command ${i + 1}/${commands.length}...`);
        
        const { error } = await supabase.rpc('exec_sql', { 
          sql_query: command + ';' 
        });
        
        if (error) {
          console.error(`❌ Error executing command ${i + 1}:`, error);
          // Continue with other commands even if one fails
        } else {
          console.log(`✅ Command ${i + 1} executed successfully`);
        }
      }
    }
    
    console.log('🎉 Database setup completed!');
    
    // Verify tables were created
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['job_profiles', 'assessment_sessions']);
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError);
    } else {
      console.log('📋 Created tables:', tables.map(t => t.table_name));
    }
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Alternative approach using direct SQL execution
async function setupDatabaseDirect() {
  try {
    console.log('🚀 Setting up database tables (direct approach)...');
    
    // Create job_profiles table
    const createJobProfilesTable = `
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
    `;
    
    const { error: jobProfilesError } = await supabase.rpc('exec_sql', {
      sql_query: createJobProfilesTable
    });
    
    if (jobProfilesError) {
      console.error('❌ Error creating job_profiles table:', jobProfilesError);
    } else {
      console.log('✅ job_profiles table created successfully');
    }
    
    // Create assessment_sessions table
    const createAssessmentSessionsTable = `
      CREATE TABLE IF NOT EXISTS public.assessment_sessions (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL UNIQUE,
          candidate_id UUID NOT NULL,
          job_profile_id UUID NOT NULL,
          language VARCHAR(50) DEFAULT 'python',
          experience_level VARCHAR(50) DEFAULT 'intermediate',
          current_parameter INTEGER DEFAULT 0,
          current_depth INTEGER DEFAULT 0,
          parameter_scores JSONB DEFAULT '{}',
          assessment_state JSONB DEFAULT '{}',
          code_progress JSONB DEFAULT '{}',
          retry_count JSONB DEFAULT '{}',
          overall_score FLOAT DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active',
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const { error: assessmentSessionsError } = await supabase.rpc('exec_sql', {
      sql_query: createAssessmentSessionsTable
    });
    
    if (assessmentSessionsError) {
      console.error('❌ Error creating assessment_sessions table:', assessmentSessionsError);
    } else {
      console.log('✅ assessment_sessions table created successfully');
    }
    
    console.log('🎉 Database setup completed!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    
    // Fallback: Try creating tables using regular insert/select operations
    console.log('🔄 Trying fallback approach...');
    
    try {
      // Test if we can create a simple table
      const { error: testError } = await supabase
        .from('job_profiles')
        .select('id')
        .limit(1);
      
      if (testError && testError.code === '42P01') {
        console.log('📝 Tables do not exist. Please create them manually in Supabase dashboard.');
        console.log('📋 Use the SQL from create-job-profiles-table.sql');
      } else {
        console.log('✅ Tables appear to exist already');
      }
    } catch (fallbackError) {
      console.error('❌ Fallback approach failed:', fallbackError);
    }
  }
}

// Run the setup
setupDatabaseDirect(); 