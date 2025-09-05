const express = require('express');
const multer = require('multer');
const router = express.Router();
const jdProcessingService = require('../services/jd-processing-service');
const fileParserService = require('../services/file-parser-service');
const { authenticateSupabase } = require('../middleware/supabase-auth');
const { createClient } = require('@supabase/supabase-js');

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024, // 1MB limit
    files: 1 // Only one file at a time
  },
  fileFilter: (req, file, cb) => {
    const supportedTypes = fileParserService.getSupportedTypes();
    
    if (supportedTypes.mimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported types: PDF, TXT, DOCX`), false);
    }
  }
});

/**
 * Get supported file types
 * GET /api/jd-upload/supported-types
 */
router.get('/supported-types', (req, res) => {
  res.json({
    success: true,
    data: fileParserService.getSupportedTypes()
  });
});

/**
 * Upload and process JD file
 * POST /api/jd-upload
 */
router.post('/', authenticateSupabase, upload.single('jdFile'), async (req, res) => {
  try {
    console.log('📁 JD file upload request received');
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please select a PDF, TXT, or DOCX file.'
      });
    }
    
    const userId = req.user.id;
    const file = req.file;
    
    // Extract the user's auth token for service operations
    const authHeader = req.header('Authorization');
    const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    console.log(`📁 Processing JD file: ${file.originalname} (${file.size} bytes) for user ${userId}`);
    console.log(`📋 User object:`, req.user);
    console.log(`🔑 User ID type:`, typeof userId, 'Value:', userId);
    console.log(`🎫 User token available:`, !!userToken);
    
    // Validate file
    const validation = fileParserService.validateFile(file);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors.join('; ')
      });
    }
    
    // Process the JD file with user context
    const processingResult = await jdProcessingService.processJDFile(file, userId, userToken);
    
    if (processingResult.success) {
      console.log(`✅ JD processing completed successfully for ${file.originalname}`);
      
      res.json({
        success: true,
        message: 'Job description processed successfully',
        data: {
          jobProfileId: processingResult.jobProfileId,
          jobProfile: processingResult.jobProfile,
          metrics: processingResult.metrics
        }
      });
    } else {
      console.error(`❌ JD processing failed for ${file.originalname}:`, processingResult.error);
      
      res.status(500).json({
        success: false,
        error: processingResult.error,
        jobProfileId: processingResult.jobProfileId
      });
    }
    
  } catch (error) {
    console.error('JD upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 1MB limit'
      });
    }
    
    if (error.message.includes('Unsupported file type')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error during file processing'
    });
  }
});

/**
 * Get processing status for a job profile
 * GET /api/jd-upload/status/:jobProfileId
 */
router.get('/status/:jobProfileId', authenticateSupabase, async (req, res) => {
  try {
    const { jobProfileId } = req.params;
    const userId = req.user.id;
    
    console.log(`📊 Getting status for job profile: ${jobProfileId}`);

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Get processing logs
    const logs = await jdProcessingService.getProcessingLogs(jobProfileId);
    
    // Get job profile info
    const { data: jobProfile, error } = await supabase
      .from('job_profiles')
      .select('id, title, processing_status, processing_error, processing_started_at, processing_completed_at, ai_confidence_score')
      .eq('id', jobProfileId)
      .eq('created_by', userId)
      .single();
    
    if (error || !jobProfile) {
      return res.status(404).json({
        success: false,
        error: 'Job profile not found or access denied'
      });
    }
    
    res.json({
      success: true,
      data: {
        jobProfile,
        processingLogs: logs,
        isComplete: jobProfile.processing_status === 'completed',
        isFailed: jobProfile.processing_status === 'failed'
      }
    });
    
  } catch (error) {
    console.error('Error fetching processing status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch processing status'
    });
  }
});

/**
 * Get user's job profiles
 * GET /api/jd-upload/my-profiles
 */
router.get('/my-profiles', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.user.id;
    const profiles = await jdProcessingService.getUserJobProfiles(userId);
    
    res.json({
      success: true,
      data: profiles.map(profile => ({
        id: profile.id,
        title: profile.title,
        company: profile.company,
        experience_level: profile.experience_level,
        processing_status: profile.processing_status,
        ai_confidence_score: profile.ai_confidence_score,
        original_file_name: profile.original_file_name,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        parameters_count: profile.parameters ? profile.parameters.length : 0
      }))
    });
    
  } catch (error) {
    console.error('Error fetching user job profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job profiles'
    });
  }
});

/**
 * Get specific job profile details
 * GET /api/jd-upload/profile/:jobProfileId
 */
router.get('/profile/:jobProfileId', authenticateSupabase, async (req, res) => {
  try {
    const { jobProfileId } = req.params;
    const userId = req.user.id;
    
    console.log(`📋 Getting profile for job profile: ${jobProfileId}`);

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: jobProfile, error } = await supabase
      .from('job_profiles')
      .select('*')
      .eq('id', jobProfileId)
      .eq('created_by', userId)
      .single();
    
    if (error || !jobProfile) {
      return res.status(404).json({
        success: false,
        error: 'Job profile not found or access denied'
      });
    }
    
    res.json({
      success: true,
      data: jobProfile
    });
    
  } catch (error) {
    console.error('Error fetching job profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job profile'
    });
  }
});

/**
 * Delete job profile
 * DELETE /api/jd-upload/profile/:jobProfileId
 */
router.delete('/profile/:jobProfileId', authenticateSupabase, async (req, res) => {
  try {
    const { jobProfileId } = req.params;
    const userId = req.user.id;
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // First, get the job profile to check ownership and get file info
    const { data: jobProfile, error: fetchError } = await supabase
      .from('job_profiles')
      .select('id, created_by, file_storage_path')
      .eq('id', jobProfileId)
      .eq('created_by', userId)
      .single();
    
    if (fetchError || !jobProfile) {
      return res.status(404).json({
        success: false,
        error: 'Job profile not found or access denied'
      });
    }
    
    // Delete file from storage if exists
    if (jobProfile.file_storage_path) {
      const { error: storageError } = await supabase.storage
        .from('job-descriptions')
        .remove([jobProfile.file_storage_path]);
      
      if (storageError) {
        console.error('Failed to delete file from storage:', storageError);
      }
    }
    
    // Delete job profile (processing logs will be cascade deleted)
    const { error: deleteError } = await supabase
      .from('job_profiles')
      .delete()
      .eq('id', jobProfileId)
      .eq('created_by', userId);
    
    if (deleteError) {
      throw new Error(deleteError.message);
    }
    
    res.json({
      success: true,
      message: 'Job profile deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting job profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete job profile'
    });
  }
});

/**
 * Reprocess job profile (if initial processing failed)
 * POST /api/jd-upload/reprocess/:jobProfileId
 */
router.post('/reprocess/:jobProfileId', authenticateSupabase, async (req, res) => {
  try {
    const { jobProfileId } = req.params;
    const userId = req.user.id;
    
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Get job profile
    const { data: jobProfile, error } = await supabase
      .from('job_profiles')
      .select('*')
      .eq('id', jobProfileId)
      .eq('created_by', userId)
      .single();
    
    if (error || !jobProfile) {
      return res.status(404).json({
        success: false,
        error: 'Job profile not found or access denied'
      });
    }
    
    if (jobProfile.processing_status === 'processing') {
      return res.status(400).json({
        success: false,
        error: 'Job profile is already being processed'
      });
    }
    
    if (!jobProfile.description || jobProfile.description.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Job profile does not have sufficient text for reprocessing'
      });
    }
    
    // Reset processing status
    await supabase
      .from('job_profiles')
      .update({
        processing_status: 'processing',
        processing_error: null,
        processing_started_at: new Date().toISOString()
      })
      .eq('id', jobProfileId);
    
    // Reprocess AI analysis and parameters
    const aiAnalysisResult = await jdProcessingService.performAIAnalysis(jobProfile.description);
    
    if (!aiAnalysisResult.success) {
      await jdProcessingService.updateJobProfileStatus(jobProfileId, 'failed', aiAnalysisResult.error);
      throw new Error(aiAnalysisResult.error);
    }
    
    const parameterResult = await jdProcessingService.generate3ParameterAssessment(aiAnalysisResult, jobProfile.description);
    
    if (!parameterResult.success) {
      await jdProcessingService.updateJobProfileStatus(jobProfileId, 'failed', parameterResult.error);
      throw new Error(parameterResult.error);
    }
    
    const updatedProfile = await jdProcessingService.finalizeJobProfile(jobProfileId, aiAnalysisResult, parameterResult);
    
    res.json({
      success: true,
      message: 'Job profile reprocessed successfully',
      data: updatedProfile
    });
    
  } catch (error) {
    console.error('Error reprocessing job profile:', error);
    res.status(500).json({
      success: false,
      error: `Reprocessing failed: ${error.message}`
    });
  }
});

module.exports = router; 