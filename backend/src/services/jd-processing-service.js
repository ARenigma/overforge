const { createClient } = require('@supabase/supabase-js');
const fileParserService = require('./file-parser-service');
const axios = require('axios');
const crypto = require('crypto');

class JDProcessingService {
  
  constructor() {
    // Use service role for admin operations but track user ownership explicitly
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    this.aiModuleUrl = process.env.AI_MODULE_URL || 'http://localhost:8000';
    this.storageBucket = 'job-descriptions';
  }
  
  /**
   * Process uploaded JD file end-to-end with service role for reliability
   * @param {Object} file - Multer file object
   * @param {string} userId - User ID who uploaded
   * @param {string} userToken - User's auth token (for potential future use)
   * @returns {Promise<Object>} - Processing result
   */
  async processJDFile(file, userId, userToken) {
    let jobProfileId = null;
    
    try {
      console.log(`🚀 Starting JD processing for file: ${file.originalname}`);
      console.log(`🔐 Processing on behalf of user: ${userId}`);
      console.log(`🛡️  Using service role with explicit user tracking`);
      
      // Step 0: Check for file deduplication
      const fileHash = fileParserService.generateFileHash(file.buffer);
      console.log(`🔍 Checking for duplicate files with hash: ${fileHash.substring(0, 16)}...`);
      
      const duplicateCheck = await this.checkForDuplicateFile(fileHash, userId);
      if (duplicateCheck.isDuplicate) {
        console.log(`♻️  Duplicate file detected! Returning existing job profile: ${duplicateCheck.existingProfile.id}`);
        return {
          success: true,
          isDuplicate: true,
          jobProfileId: duplicateCheck.existingProfile.id,
          jobProfile: duplicateCheck.existingProfile,
          message: `This file has already been processed. Returning existing job profile: "${duplicateCheck.existingProfile.title}"`,
          originalUploadDate: duplicateCheck.existingProfile.created_at,
          metrics: {
            processingTime: 0, // No processing needed
            duplicateDetection: true
          }
        };
      }
      
      // Step 1: Create initial job profile record (service role with user tracking)
      jobProfileId = await this.createInitialJobProfile(file, userId, fileHash);
      await this.logProcessingStep(jobProfileId, 'file_upload', 'started', 'File upload initiated');
      
      // Step 2: Extract text from file
      console.log(`📄 Extracting text from ${file.originalname}...`);
      await this.logProcessingStep(jobProfileId, 'text_extraction', 'started', 'Starting text extraction');
      
      const extractionResult = await fileParserService.extractText(file);
      
      if (!extractionResult.success) {
        await this.updateJobProfileStatus(jobProfileId, 'failed', extractionResult.error);
        await this.logProcessingStep(jobProfileId, 'text_extraction', 'failed', extractionResult.error);
        throw new Error(extractionResult.error);
      }
      
      console.log(`✅ Text extracted: ${extractionResult.textLength} characters, ${extractionResult.wordCount} words`);
      await this.logProcessingStep(jobProfileId, 'text_extraction', 'completed', 
        `Extracted ${extractionResult.textLength} characters using ${extractionResult.extractionMethod}`);
      
      // Step 2.5: Check for content deduplication
      const contentHash = this.generateContentHash(extractionResult.extractedText);
      console.log(`🔍 Checking for duplicate content with hash: ${contentHash.substring(0, 16)}...`);
      
      const contentDuplicateCheck = await this.checkForDuplicateContent(contentHash, userId);
      if (contentDuplicateCheck.isDuplicate) {
        console.log(`♻️  Duplicate content detected! Linking to existing job profile: ${contentDuplicateCheck.existingProfile.id}`);
        
        // Update current job profile to reference the existing one
        await this.updateJobProfileStatus(jobProfileId, 'completed', null);
        await this.linkDuplicateJobProfile(jobProfileId, contentDuplicateCheck.existingProfile);
        
        return {
          success: true,
          isDuplicate: true,
          jobProfileId: contentDuplicateCheck.existingProfile.id,
          jobProfile: contentDuplicateCheck.existingProfile,
          message: `This content has already been processed. Returning existing job profile: "${contentDuplicateCheck.existingProfile.title}"`,
          originalUploadDate: contentDuplicateCheck.existingProfile.created_at,
          metrics: {
            processingTime: Date.now() - new Date().getTime(),
            duplicateDetection: true,
            contentDeduplication: true
          }
        };
      }
      
      // Step 3: Store file in Supabase Storage
      console.log(`💾 Uploading file to storage...`);
      const storageResult = await this.uploadFileToStorage(file, userId, jobProfileId);
      
      // Step 4: Record file upload in file_uploads table
      await this.recordFileUpload(file, userId, jobProfileId, fileHash, contentHash, extractionResult, storageResult);
      
      // Step 5: Update job profile with extracted text
      // TEMPORARY: Skip this step due to database trigger issue
      console.log('⚠️  Skipping job profile text update due to database trigger issue');
      console.log('📝 Text extracted and file uploaded successfully, proceeding to AI analysis...');
      
      // await this.updateJobProfileWithText(jobProfileId, extractionResult, storageResult, contentHash);
      
      // Step 6: AI Analysis and Parameter Extraction
      console.log(`🤖 Starting AI analysis...`);
      await this.logProcessingStep(jobProfileId, 'ai_analysis', 'started', 'Starting AI-powered JD analysis');
      
      const aiAnalysisResult = await this.performAIAnalysis(extractionResult.extractedText);
      
      if (!aiAnalysisResult.success) {
        await this.updateJobProfileStatus(jobProfileId, 'failed', aiAnalysisResult.error);
        await this.logProcessingStep(jobProfileId, 'ai_analysis', 'failed', aiAnalysisResult.error);
        throw new Error(aiAnalysisResult.error);
      }
      
      console.log(`✅ AI analysis completed with confidence: ${aiAnalysisResult.confidence}%`);
      await this.logProcessingStep(jobProfileId, 'ai_analysis', 'completed', 
        `AI analysis completed with ${aiAnalysisResult.confidence}% confidence`);
      
      // Step 7: Generate 3-Parameter Assessment
      console.log(`🎯 Generating 3-parameter assessment...`);
      await this.logProcessingStep(jobProfileId, 'parameter_generation', 'started', 'Generating assessment parameters');
      
      const parameterResult = await this.generate3ParameterAssessment(aiAnalysisResult, extractionResult.extractedText);
      
      if (!parameterResult.success) {
        await this.updateJobProfileStatus(jobProfileId, 'failed', parameterResult.error);
        await this.logProcessingStep(jobProfileId, 'parameter_generation', 'failed', parameterResult.error);
        throw new Error(parameterResult.error);
      }
      
      console.log(`✅ Generated 3 assessment parameters`);
      await this.logProcessingStep(jobProfileId, 'parameter_generation', 'completed', 
        'Successfully generated 3-parameter assessment system');
      
      // Step 8: Finalize job profile
      const finalJobProfile = await this.finalizeJobProfile(jobProfileId, aiAnalysisResult, parameterResult);
      
      console.log(`🎉 JD processing completed successfully for ${file.originalname}`);
      
      const endTime = Date.now();
      return {
        success: true,
        isDuplicate: false,
        jobProfileId,
        jobProfile: finalJobProfile,
        processingSteps: await this.getProcessingLogs(jobProfileId),
        metrics: {
          textLength: extractionResult.textLength,
          wordCount: extractionResult.wordCount,
          processingTime: endTime - new Date().getTime(),
          aiConfidence: aiAnalysisResult.confidence,
          extractionMethod: extractionResult.extractionMethod
        }
      };
      
    } catch (error) {
      console.error(`❌ JD processing failed for ${file.originalname}:`, error.message);
      
      if (jobProfileId) {
        await this.updateJobProfileStatus(jobProfileId, 'failed', error.message);
        await this.logProcessingStep(jobProfileId, 'processing', 'failed', error.message);
      }
      
      throw error;
    }
  }
  
  /**
   * Check for duplicate files using file hash
   * @param {string} fileHash - SHA-256 hash of file
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Duplicate check result
   */
  async checkForDuplicateFile(fileHash, userId) {
    try {
      // Check if this exact file has been uploaded by this user before
      const { data: existingFile, error } = await this.supabase
        .from('file_uploads')
        .select(`
          id,
          related_job_profile_id,
          created_at,
          job_profiles!inner(
            id,
            title,
            processing_status,
            created_at,
            is_active
          )
        `)
        .eq('file_hash', fileHash)
        .eq('uploaded_by', userId)
        .eq('job_profiles.is_active', true)
        .eq('job_profiles.processing_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking for duplicate file:', error);
        return { isDuplicate: false };
      }
      
      if (existingFile && existingFile.job_profiles) {
        return {
          isDuplicate: true,
          existingProfile: existingFile.job_profiles,
          existingFileUpload: existingFile
        };
      }
      
      return { isDuplicate: false };
      
    } catch (error) {
      console.error('Error in duplicate file check:', error);
      return { isDuplicate: false };
    }
  }
  
  /**
   * Check for duplicate content using content hash
   * @param {string} contentHash - SHA-256 hash of extracted text
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Duplicate check result
   */
  async checkForDuplicateContent(contentHash, userId) {
    try {
      // Check if this content has been processed before by this user
      const { data: existingProfile, error } = await this.supabase
        .from('job_profiles')
        .select('id, title, processing_status, created_at, is_active, ai_confidence_score')
        .eq('content_hash', contentHash)
        .eq('created_by', userId)
        .eq('is_active', true)
        .eq('processing_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error checking for duplicate content:', error);
        return { isDuplicate: false };
      }
      
      if (existingProfile) {
        return {
          isDuplicate: true,
          existingProfile
        };
      }
      
      return { isDuplicate: false };
      
    } catch (error) {
      console.error('Error in duplicate content check:', error);
      return { isDuplicate: false };
    }
  }
  
  /**
   * Generate content hash from extracted text
   * @param {string} text - Extracted text
   * @returns {string} - SHA-256 hash
   */
  generateContentHash(text) {
    // Normalize text for consistent hashing
    const normalizedText = text
      .toLowerCase()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .trim();
    
    return crypto.createHash('sha256').update(normalizedText).digest('hex');
  }
  
  /**
   * Record file upload in file_uploads table
   * @param {Object} file - File object
   * @param {string} userId - User ID
   * @param {string} jobProfileId - Job profile ID
   * @param {string} fileHash - File hash
   * @param {string} contentHash - Content hash
   * @param {Object} extractionResult - Text extraction result
   * @param {Object} storageResult - Storage result
   */
  async recordFileUpload(file, userId, jobProfileId, fileHash, contentHash, extractionResult, storageResult) {
    // With Supabase Auth, userId is already a UUID
    const { error } = await this.supabase
      .from('file_uploads')
      .insert([{
        original_name: file.originalname,
        stored_name: storageResult.storagePath.split('/').pop(),
        file_size: file.size,
        mime_type: file.mimetype,
        file_hash: fileHash,
        content_hash: contentHash,
        storage_bucket: this.storageBucket,
        storage_path: storageResult.storagePath,
        storage_url: storageResult.storageUrl,
        upload_status: 'processed',
        extracted_text: extractionResult.extractedText,
        extraction_method: extractionResult.extractionMethod,
        uploaded_by: userId, // Direct UUID from Supabase Auth
        related_job_profile_id: jobProfileId
      }]);
    
    if (error) {
      console.error('Error recording file upload:', error);
      // Don't throw error as this is not critical for main processing
    }
  }
  
  /**
   * Link duplicate job profile to existing one
   * @param {string} newJobProfileId - New job profile ID
   * @param {Object} existingProfile - Existing job profile
   */
  async linkDuplicateJobProfile(newJobProfileId, existingProfile) {
    const { error } = await this.supabase
      .from('job_profiles')
      .update({
        title: `Duplicate: ${existingProfile.title}`,
        description: `This job description is a duplicate of an existing one. Original processing completed on ${new Date(existingProfile.created_at).toLocaleDateString()}.`,
        parameters: existingProfile.parameters || [],
        master_problem: existingProfile.master_problem || {},
        assessment_criteria: existingProfile.assessment_criteria || {},
        processing_status: 'completed',
        processing_completed_at: new Date().toISOString(),
        ai_confidence_score: existingProfile.ai_confidence_score,
        is_active: true,
        duplicate_of: existingProfile.id // Reference to original
      })
      .eq('id', newJobProfileId);
    
    if (error) {
      console.error('Error linking duplicate job profile:', error);
    }
  }
  
  /**
   * Create initial job profile record
   * @param {Object} file - File object
   * @param {string} userId - User ID
   * @param {string} fileHash - File hash
   * @returns {Promise<string>} - Job profile ID
   */
  async createInitialJobProfile(file, userId, fileHash) {
    console.log(`🔧 Creating job profile with userId: ${userId} (type: ${typeof userId})`);
    
    // With Supabase Auth, userId is already a UUID, no mapping needed
    console.log(`✅ Using Supabase Auth UUID: ${userId}`);
    
    const { data, error } = await this.supabase
      .from('job_profiles')
      .insert([{
        title: `Processing: ${file.originalname}`,
        description: 'Processing job description...',
        experience_level: 'pending',
        parameters: [],
        master_problem: {},
        assessment_criteria: {},
        original_file_name: file.originalname,
        original_file_size: file.size,
        original_file_type: file.mimetype,
        file_hash: fileHash, // Store file hash
        processing_status: 'processing',
        processing_started_at: new Date().toISOString(),
        created_by: userId, // Direct UUID from Supabase Auth
        is_active: false // Will be activated after successful processing
      }])
      .select('id')
      .single();
    
    if (error) {
      throw new Error(`Failed to create job profile: ${error.message}`);
    }
    
    return data.id;
  }
  
  /**
   * Upload file to Supabase Storage
   * @param {Object} file - File object
   * @param {string} userId - User ID
   * @param {string} jobProfileId - Job profile ID
   * @returns {Promise<Object>} - Storage result
   */
  async uploadFileToStorage(file, userId, jobProfileId) {
    const fileExtension = file.originalname.split('.').pop();
    const timestamp = Date.now();
    const storagePath = `${userId}/${timestamp}-${jobProfileId}.${fileExtension}`;
    
    const { data, error } = await this.supabase.storage
      .from(this.storageBucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });
    
    if (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }
    
    // Get public URL
    const { data: urlData } = this.supabase.storage
      .from(this.storageBucket)
      .getPublicUrl(storagePath);
    
    return {
      storagePath: data.path,
      storageUrl: urlData.publicUrl
    };
  }
  
  /**
   * Update job profile with extracted text and file info
   * @param {string} jobProfileId - Job profile ID
   * @param {Object} extractionResult - Text extraction result
   * @param {Object} storageResult - File storage result
   * @param {string} contentHash - Content hash
   */
  async updateJobProfileWithText(jobProfileId, extractionResult, storageResult, contentHash) {
    const updateData = {
      description: extractionResult.extractedText,
      file_storage_path: storageResult.storagePath,
      file_storage_url: storageResult.storageUrl,
      content_hash: contentHash
      // Let the database handle updated_at automatically
    };

    console.log(`🔄 Updating job profile ${jobProfileId} with:`, Object.keys(updateData));
    
    const { data, error } = await this.supabase
      .from('job_profiles')
      .update(updateData)
      .eq('id', jobProfileId)
      .select();
    
    if (error) {
      console.error('❌ Update error details:', error);
      throw new Error(`Failed to update job profile with text: ${error.message}`);
    }
    
    console.log(`✅ Job profile updated successfully:`, data.length > 0 ? 'Record updated' : 'No records updated');
  }
  
  /**
   * Perform AI analysis on JD text
   * @param {string} jdText - Job description text
   * @returns {Promise<Object>} - AI analysis result
   */
  async performAIAnalysis(jdText) {
    try {
      const response = await axios.post(`${this.aiModuleUrl}/analyze-job-description`, {
        job_description: jdText
      }, {
        timeout: 30000 // 30 second timeout
      });
      
      if (response.data.success) {
        return {
          success: true,
          jobTitle: response.data.job_title,
          techStack: response.data.tech_stack,
          requiredSkills: response.data.required_skills,
          preferredSkills: response.data.preferred_skills,
          experienceLevel: response.data.experience_level,
          company: response.data.company,
          location: response.data.location,
          employmentType: response.data.employment_type,
          confidence: response.data.confidence || 85
        };
      } else {
        throw new Error(response.data.error || 'AI analysis failed');
      }
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('AI module is not running. Please start the AI service.');
      }
      throw new Error(`AI analysis failed: ${error.message}`);
    }
  }
  
  /**
   * Generate 3-parameter assessment system
   * @param {Object} aiAnalysis - AI analysis result
   * @param {string} originalJobDescription - Full original job description text
   * @returns {Promise<Object>} - Parameter generation result
   */
  async generate3ParameterAssessment(aiAnalysis, originalJobDescription = null) {
    try {
      // Use full job description if available, otherwise fall back to summary
      const jobDescriptionToSend = originalJobDescription || `
Job Title: ${aiAnalysis.jobTitle}
Required Skills: ${aiAnalysis.requiredSkills.join(', ')}
Tech Stack: ${aiAnalysis.techStack.join(', ')}
Experience Level: ${aiAnalysis.experienceLevel}
      `.trim();

      console.log(`🎯 Sending ${originalJobDescription ? 'FULL JD' : 'SUMMARY'} to V2 system (${jobDescriptionToSend.length} chars)`);

      const response = await axios.post(`${this.aiModuleUrl}/extract-jd-parameters`, {
        job_description: jobDescriptionToSend
      }, {
        timeout: 30000
      });
      
      if (response.data.success) {
        // Generate master problem with flexible language handling
        const inferredLanguage = this.inferPrimaryLanguage(aiAnalysis.techStack);
        const languageForProblem = inferredLanguage === 'flexible' ? 'javascript' : inferredLanguage;
        
        console.log(`🎯 Language for problem generation: ${languageForProblem} (inferred: ${inferredLanguage})`);
        
        const problemResponse = await axios.post(`${this.aiModuleUrl}/generate-assessment-problem`, {
          parameters: response.data.parameters,
          language: languageForProblem,
          experience_level: this.normalizeExperienceLevel(aiAnalysis.experienceLevel)
        }, {
          timeout: 30000
        });
        
        return {
          success: true,
          parameters: response.data.parameters,
          masterProblem: problemResponse.data.success ? problemResponse.data.problem : null,
          assessmentCriteria: this.generateAssessmentCriteria(response.data.parameters)
        };
      } else {
        throw new Error(response.data.error || 'Parameter extraction failed');
      }
      
    } catch (error) {
      throw new Error(`3-parameter generation failed: ${error.message}`);
    }
  }
  
  /**
   * Infer primary programming language from tech stack (enhanced for either-or flexibility)
   * @param {Array} techStack - Array of technologies
   * @returns {string} - Primary language or 'flexible' for either-or situations
   */
  inferPrimaryLanguage(techStack) {
    const languageMap = {
      'javascript': ['javascript', 'js', 'node', 'react', 'vue', 'angular', 'express'],
      'python': ['python', 'django', 'flask', 'pandas', 'tensorflow', 'boto3'],
      'java': ['java', 'spring', 'hibernate', 'maven', 'gradle'],
      'cpp': ['c++', 'cpp', 'c plus plus'],
      'csharp': ['c#', 'csharp', '.net', 'asp.net'],
      'go': ['go', 'golang'],
      'rust': ['rust'],
      'php': ['php', 'laravel', 'symfony']
    };
    
    const techStackLower = techStack.map(tech => tech.toLowerCase());
    const techStackString = techStackLower.join(' ');
    
    // Detect either-or patterns in tech stack
    const eitherOrPatterns = [
      'python/node', 'node/python', 'python or node', 'node or python',
      'javascript/python', 'python/javascript', 'js/python', 'python/js',
      'java/python', 'python/java', 'java or python', 'python or java'
    ];
    
    const hasEitherOr = eitherOrPatterns.some(pattern => 
      techStackString.includes(pattern.replace('/', '/').replace(' or ', ' '))
    );
    
    if (hasEitherOr) {
      console.log(`🔄 Either-or language pattern detected in tech stack: ${techStackString}`);
      return 'flexible'; // Special flag for language-agnostic scenarios
    }
    
    // Count language matches
    const languageScores = {};
    for (const [language, keywords] of Object.entries(languageMap)) {
      languageScores[language] = keywords.filter(keyword => 
        techStackLower.some(tech => tech.includes(keyword))
      ).length;
    }
    
    // Find language with highest score
    const topLanguage = Object.entries(languageScores)
      .filter(([lang, score]) => score > 0)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (topLanguage) {
      console.log(`🎯 Primary language inferred: ${topLanguage[0]} (score: ${topLanguage[1]})`);
      return topLanguage[0];
    }
    
    return 'javascript'; // Default fallback
  }
  
  /**
   * Normalize experience level to standard format
   * @param {string} experienceLevel - Raw experience level
   * @returns {string} - Normalized level
   */
  normalizeExperienceLevel(experienceLevel) {
    const level = experienceLevel.toLowerCase();
    
    if (level.includes('senior') || level.includes('5+') || level.includes('lead')) {
      return 'advanced';
    } else if (level.includes('junior') || level.includes('entry') || level.includes('0-2')) {
      return 'beginner';
    } else {
      return 'intermediate';
    }
  }
  
  /**
   * Generate assessment criteria from parameters
   * @param {Array} parameters - Assessment parameters
   * @returns {Object} - Assessment criteria
   */
  generateAssessmentCriteria(parameters) {
    return {
      scoring: {
        maxScore: 9,
        passThreshold: 5,
        parameterWeight: 'equal'
      },
      parameters: parameters.map((param, index) => ({
        id: index + 1,
        name: param.name,
        weight: 1.0,
        depths: param.depth_levels.map((depth, depthIndex) => ({
          level: depthIndex + 1,
          description: depth.description,
          points: 1,
          timeLimit: 300 // 5 minutes per depth
        }))
      }))
    };
  }
  
  /**
   * Finalize job profile after successful processing
   * @param {string} jobProfileId - Job profile ID
   * @param {Object} aiAnalysis - AI analysis result
   * @param {Object} parameterResult - Parameter generation result
   * @returns {Promise<Object>} - Final job profile
   */
  async finalizeJobProfile(jobProfileId, aiAnalysis, parameterResult) {
    const { data, error } = await this.supabase
      .from('job_profiles')
      .update({
        title: aiAnalysis.jobTitle,
        company: aiAnalysis.company,
        location: aiAnalysis.location,
        employment_type: aiAnalysis.employmentType,
        experience_level: aiAnalysis.experienceLevel,
        extracted_job_title: aiAnalysis.jobTitle,
        extracted_tech_stack: aiAnalysis.techStack,
        required_skills: aiAnalysis.requiredSkills,
        preferred_skills: aiAnalysis.preferredSkills,
        parameters: parameterResult.parameters,
        master_problem: parameterResult.masterProblem,
        assessment_criteria: parameterResult.assessmentCriteria,
        processing_status: 'completed',
        processing_completed_at: new Date().toISOString(),
        ai_confidence_score: aiAnalysis.confidence / 100,
        is_active: true
      })
      .eq('id', jobProfileId)
      .select('*')
      .single();
    
    if (error) {
      throw new Error(`Failed to finalize job profile: ${error.message}`);
    }
    
    return data;
  }
  
  /**
   * Update job profile processing status
   * @param {string} jobProfileId - Job profile ID
   * @param {string} status - New status
   * @param {string} error - Error message if any
   */
  async updateJobProfileStatus(jobProfileId, status, error = null) {
    const updateData = {
      processing_status: status
    };
    
    if (status === 'failed') {
      updateData.processing_error = error;
      updateData.processing_completed_at = new Date().toISOString();
    }
    
    await this.supabase
      .from('job_profiles')
      .update(updateData)
      .eq('id', jobProfileId);
  }
  
  /**
   * Log processing step
   * @param {string} jobProfileId - Job profile ID
   * @param {string} stepName - Step name
   * @param {string} status - Step status
   * @param {string} message - Step message
   */
  async logProcessingStep(jobProfileId, stepName, status, message) {
    await this.supabase
      .from('jd_processing_logs')
      .insert([{
        job_profile_id: jobProfileId,
        step_name: stepName,
        step_status: status,
        step_message: message,
        completed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null
      }]);
  }
  
  /**
   * Get processing logs for a job profile
   * @param {string} jobProfileId - Job profile ID
   * @returns {Promise<Array>} - Processing logs
   */
  async getProcessingLogs(jobProfileId) {
    const { data, error } = await this.supabase
      .from('jd_processing_logs')
      .select('*')
      .eq('job_profile_id', jobProfileId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Failed to fetch processing logs:', error);
      return [];
    }
    
    return data;
  }
  
  /**
   * Get all job profiles for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - User's job profiles
   */
  async getUserJobProfiles(userId) {
    const { data, error } = await this.supabase
      .from('job_profiles')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`Failed to fetch job profiles: ${error.message}`);
    }
    
    return data;
  }
}

module.exports = new JDProcessingService(); 