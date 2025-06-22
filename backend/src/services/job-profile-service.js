const { createClient } = require('@supabase/supabase-js');
const JobProfile = require('../models/job-profile');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class JobProfileService {
  
  /**
   * 🤖 V2 AI-Powered Job Profile Creation (Pure AI, No Hardcoded Patterns)
   * @param {Object} profileData - AI-generated profile data
   * @returns {Promise<Object>} - Created job profile
   */
  static async createV2JobProfile(profileData) {
    console.log('🤖 Creating V2 AI Job Profile (100% AI-generated)');
    
    const jobProfileData = {
      title: profileData.title,
      company: profileData.company,
      location: profileData.location,
      employment_type: profileData.employment_type,
      experience_level: profileData.experience_level,
      description: profileData.description,
      extracted_job_title: profileData.title,
      extracted_tech_stack: profileData.extracted_tech_stack,
      required_skills: profileData.required_skills,
      preferred_skills: profileData.preferred_skills,
      parameters: profileData.parameters, // AI-generated parameters
      master_problem: profileData.master_problem, // AI-generated master problem  
      assessment_criteria: profileData.assessment_criteria,
      processing_status: 'completed',
      processing_completed_at: new Date().toISOString(),
      ai_confidence_score: profileData.ai_confidence_score,
      created_by: profileData.created_by,
      is_active: true,
      v2_system: true, // Flag to indicate V2 AI generation
      generation_method: 'ai_v2' // Track generation method
    };

    console.log('💾 Inserting V2 job profile into database...');
    console.log(`🎯 Parameters: ${profileData.parameters.length}`);
    console.log(`🧩 Master Problem: ${profileData.master_problem ? 'AI-Generated ✅' : 'Missing ❌'}`);

    const { data, error } = await supabase
      .from('job_profiles')
      .insert([jobProfileData])
      .select('*')
      .single();

    if (error) {
      console.error('❌ V2 Job Profile Creation Failed:', error);
      throw new Error(`Failed to create V2 job profile: ${error.message}`);
    }

    console.log('✅ V2 AI Job Profile Created Successfully!');
    console.log(`📋 ID: ${data.id}`);
    console.log(`🏷️ Title: ${data.title}`);
    
    return data;
  }

  /**
   * @deprecated Use createV2JobProfile instead - this creates hardcoded templates
   * 
   * LEGACY: Hardcoded AWS Backend Profile (TO BE REMOVED)
   * This method creates hardcoded job profiles with static templates.
   * Use V2 AI generation instead for pure AI-driven profiles.
   */
  static async initializeAWSBackendProfile() {
    console.warn('⚠️ DEPRECATED: initializeAWSBackendProfile uses hardcoded patterns');
    console.warn('🤖 Use createV2JobProfile with V2 AI system instead');
    
    throw new Error('Deprecated: Use V2 AI generation instead of hardcoded patterns. Call /api/job-profiles/generate-from-jd');
  }

  static async getAllJobProfiles() {
    try {
      const { data, error } = await supabase
        .from('job_profiles')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      return data.map(profile => JobProfile.fromDatabase(profile));
    } catch (error) {
      console.error('Error fetching job profiles:', error);
      throw error;
    }
  }

  static async getJobProfileById(id) {
    try {
      const { data, error } = await supabase
        .from('job_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return data ? JobProfile.fromDatabase(data) : null;
    } catch (error) {
      console.error('Error fetching job profile by ID:', error);
      throw error;
    }
  }

  static async createJobProfile(profileData) {
    try {
      const { data, error } = await supabase
        .from('job_profiles')
        .insert([profileData])
        .select()
        .single();

      if (error) throw error;

      return JobProfile.fromDatabase(data);
    } catch (error) {
      console.error('Error creating job profile:', error);
      throw error;
    }
  }

  static async updateJobProfile(id, profileData) {
    try {
      const { data, error } = await supabase
        .from('job_profiles')
        .update(profileData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return JobProfile.fromDatabase(data);
    } catch (error) {
      console.error('Error updating job profile:', error);
      throw error;
    }
  }
}

module.exports = JobProfileService; 