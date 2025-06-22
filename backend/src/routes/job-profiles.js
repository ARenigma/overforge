const express = require('express');
const router = express.Router();
const JobProfileService = require('../services/job-profile-service');
const JDProcessingService = require('../services/jd-processing-service');
const { body, validationResult } = require('express-validator');
const { authenticateSupabase, optionalAuth } = require('../middleware/supabase-auth');

// Get all available job profiles
router.get('/', optionalAuth, async (req, res) => {
  try {
    console.log('📋 Fetching job profiles...');
    const profiles = await JobProfileService.getAllJobProfiles();
    console.log('✅ Found profiles:', profiles.length);
    
    res.json({
      success: true,
      data: profiles.map(profile => ({
        id: profile.id,
        title: profile.title,
        description: profile.description,
        experienceLevel: profile.experienceLevel,
        parameterCount: profile.parameters ? profile.parameters.length : 0
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching job profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job profiles'
    });
  }
});

// Get specific job profile details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const profile = await JobProfileService.getJobProfileById(req.params.id);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Job profile not found'
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching job profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job profile'
    });
  }
});

// 🤖 V2 AI-Powered Job Profile Generation (replaces hardcoded patterns)
router.post('/generate-from-jd', authenticateSupabase, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { job_description, title } = req.body;
    
    if (!job_description) {
      return res.status(400).json({
        success: false,
        error: 'Job description is required'
      });
    }

    console.log('🤖 V2 AI: Generating job profile from JD (all AI, no hardcoded patterns)');
    console.log(`📄 Job Description Length: ${job_description.length} characters`);

    // Step 1: AI Analysis of Job Description
    console.log('🔍 Step 1: AI analyzing job description...');
    const aiAnalysis = await JDProcessingService.performAIAnalysis(job_description);
    
    if (!aiAnalysis.success) {
      throw new Error('AI analysis failed');
    }

    console.log(`✅ AI Analysis Complete: ${aiAnalysis.jobTitle}`);
    console.log(`🔧 Tech Stack: ${aiAnalysis.techStack.join(', ')}`);

    // Step 2: AI Parameter Generation + Master Problem Generation
    console.log('🎯 Step 2: AI generating parameters and master problem...');
    const v2Result = await JDProcessingService.generate3ParameterAssessment(aiAnalysis, job_description);
    
    if (!v2Result.success) {
      throw new Error('V2 parameter generation failed');
    }

    console.log(`✅ V2 Generation Complete: ${v2Result.parameters.length} parameters + AI master problem`);
    v2Result.parameters.forEach((param, index) => {
      console.log(`   ${index + 1}. ${param.name}`);
    });

    // Step 3: Create Job Profile with Pure AI Data
    console.log('💾 Step 3: Creating pure AI job profile...');
    const jobProfile = await JobProfileService.createV2JobProfile({
      title: title || aiAnalysis.jobTitle,
      company: aiAnalysis.company,
      location: aiAnalysis.location,
      employment_type: aiAnalysis.employmentType,
      experience_level: aiAnalysis.experienceLevel,
      description: job_description,
      extracted_tech_stack: aiAnalysis.techStack,
      required_skills: aiAnalysis.requiredSkills,
      preferred_skills: aiAnalysis.preferredSkills,
      parameters: v2Result.parameters,
      master_problem: v2Result.masterProblem,
      assessment_criteria: v2Result.assessmentCriteria,
      ai_confidence_score: aiAnalysis.confidence / 100,
      created_by: req.user.id
    });

    console.log('🎉 V2 AI Job Profile Generated Successfully!');
    console.log(`📋 Profile ID: ${jobProfile.id}`);
    console.log(`🎯 Parameters: ${jobProfile.parameters.length}`);
    console.log(`🧩 Master Problem: ${jobProfile.master_problem ? 'AI-Generated' : 'Failed'}`);

    res.json({
      success: true,
      message: 'V2 AI job profile generated successfully (100% AI, zero hardcoded patterns)',
      data: {
        id: jobProfile.id,
        title: jobProfile.title,
        description: jobProfile.description,
        parameters: jobProfile.parameters.map(p => ({
          name: p.name,
          description: p.description
        })),
        masterProblem: jobProfile.master_problem,
        aiGenerated: true,
        v2System: true
      }
    });

  } catch (error) {
    console.error('❌ V2 AI Job Profile Generation Failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate V2 AI job profile',
      details: error.message
    });
  }
});

// Legacy endpoint (deprecated - use V2 AI generation instead)
router.post('/initialize-aws', authenticateSupabase, async (req, res) => {
  res.status(400).json({
    success: false,
    error: 'Deprecated: Use /generate-from-jd with V2 AI system instead of hardcoded patterns',
    migration: {
      newEndpoint: '/api/job-profiles/generate-from-jd',
      method: 'POST',
      body: {
        job_description: 'Your AWS Backend Developer job description...',
        title: 'Optional custom title'
      }
    }
  });
});

module.exports = router; 
module.exports = router; 