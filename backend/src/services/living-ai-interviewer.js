const { createClient } = require('@supabase/supabase-js');
const aiService = require('./aiService');
const timingConfig = require('../config/timingConfig');
const supabaseConfig = require('../config/supabase');
const { parameterDetectionConfig } = require('../config/lhis-detection-rules'); // Import config
const loggingConfig = require('../config/loggingConfig');
const ApproachDetector = require('./approach-detector');
const ProblemDetector = require('./problem-detector');

class LivingAIInterviewer {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key'
    );
    
    // Active assessment sessions
    this.activeSessions = new Map();
    
    // Code monitoring intervals
    this.codeMonitoring = new Map();
    
    // Assessment state
    this.assessmentState = new Map();
    
    // Socket IO instance for emitting messages
    this.socketIO = null;
    this.emitAndStore = null;
    this.parameterDetectionConfig = parameterDetectionConfig;
    this.aiAnalysisLocks = new Map(); // Prevent concurrent AI analysis per session
  }

  /**
   * Ensure session has required nested shapes to avoid runtime errors
   */
  ensureSessionShapes(session) {
    if (!session) return;
    if (!session.assessmentSession) session.assessmentSession = { retry_count: {}, assessment_state: { startTime: new Date().toISOString() } };
    if (!session.assessmentSession.retry_count) session.assessmentSession.retry_count = {};
    if (!session.conversationContext) session.conversationContext = {};
    if (!(session.conversationContext.activeThreads instanceof Set)) session.conversationContext.activeThreads = new Set();
    if (!(session.conversationContext.recentMentions instanceof Map)) session.conversationContext.recentMentions = new Map();
    if (typeof session.conversationContext.conversationMood !== 'string') session.conversationContext.conversationMood = 'neutral';
    if (typeof session.conversationContext.sessionPhase !== 'string') session.conversationContext.sessionPhase = 'introduction';
    if (!session.candidatePersonality) {
      session.candidatePersonality = {
        communicationStyle: 'concise',
        technicalDepth: 'surface',
        responsePatterns: [],
        interests: new Set(),
        concerns: new Set(),
        strengths: new Set(),
        preferredExplanationStyle: 'unknown'
      };
    }
  }

  /**
   * Compute simple code stats: meaningful lines and boilerplate ratio
   */
  getCodeStats(code) {
    const lines = (code || '').split(/\r?\n/);
    const nonEmpty = lines.filter(l => l.trim().length > 0);
    const isComment = (l) => /^(\s*\/\/|\s*#|\s*\/\*|\s*\*)/.test(l.trim());
    const isImport = (l) => /^(\s*import\b|\s*from\b|\s*using\b|\s*package\b)/.test(l.trim());
    const boilerplateLike = nonEmpty.filter(l => isComment(l) || isImport(l));
    const meaningfulLines = nonEmpty.length - boilerplateLike.length;
    const boilerplateRatio = nonEmpty.length === 0 ? 1 : boilerplateLike.length / nonEmpty.length;
    const hasImplementationSignals = /(class\s+\w+|def\s+\w+\(|function\s+\w+\(|public\s+\w+\(|=\s*new\s+|\w+\s*=\s*\w+|if\s*\(|for\s*\(|while\s*\()/i.test(code);
    return { nonEmpty: nonEmpty.length, meaningfulLines, boilerplateRatio, hasImplementationSignals };
  }

  /**
   * Initialize parameter progress dynamically based on actual parameters
   * Handles both old format (with ids) and new format (array indices)
   */
  initializeParameterProgress(parameters) {
    const progress = {};
    
    if (!parameters || !Array.isArray(parameters)) {
      console.log('⚠️ No parameters found, using empty progress');
      return progress;
    }
    
    parameters.forEach((param, index) => {
      // Use parameter id if available, otherwise use array index
      const paramKey = param.id !== undefined ? param.id : index;
      progress[paramKey] = {
        milestone: 'not_started',
        codeDetected: false,
        questionsAsked: []
      };
      console.log(`📊 Initialized progress for parameter ${paramKey}: ${param.name}`);
    });
    
    return progress;
  }

  /**
   * Set Socket.IO instance for real-time communication
   */
  setSocketIO(socketIO) {
    this.socketIO = socketIO;
    console.log('🔌 LHIS: SocketIO configured');
  }

  /**
   * Set storage function for chat message persistence
   */
  setStorageFunction(emitAndStore) {
    this.emitAndStore = emitAndStore;
    console.log('💾 LHIS: Storage function configured');
  }

  /**
   * Universal approach detection - works for all languages
   */
  detectApproachUniversal(code, language) {
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      console.log(`⚠️ LHIS: No code provided for approach detection`);
      return { type: 'unknown', confidence: 0, details: {}, problemType: 'general' };
    }

    try {
      console.log(`🔍 LHIS: Running universal approach detection for ${language} (${code.length} chars)`);
      const result = ApproachDetector.detectApproach(code, language);
      console.log(`✅ LHIS: Approach detected: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`);
      return result;
    } catch (error) {
      console.error(`❌ LHIS: Universal approach detection failed:`, error.message);
      return { type: 'unknown', confidence: 0, details: {}, problemType: 'general' };
    }
  }

  /**
   * Universal problem detection - works for all languages
   */
  detectProblemUniversal(code, language) {
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      console.log(`⚠️ LHIS: No code provided for problem detection`);
      return { problemType: 'general_coding', problemId: 99, confidence: 0.1, category: 'general' };
    }

    try {
      console.log(`🔍 LHIS: Running universal problem detection for ${language}`);
      const result = ProblemDetector.detectProblemType(code, language);
      console.log(`✅ LHIS: Problem detected: ${result.problemType} (ID: ${result.problemId})`);
      return result;
    } catch (error) {
      console.error(`❌ LHIS: Universal problem detection failed:`, error.message);
      return { problemType: 'general_coding', problemId: 99, confidence: 0.1, category: 'general' };
    }
  }

  /**
   * Initialize parameter-based assessment session (for parameter selection sessions)
   */
  async initializeParameterAssessment(sessionId, userId, language, experienceLevel) {
    try {
      console.log(`🎯 LHIS: Initializing parameter-based assessment for ${sessionId}`);
      
      // Create a simplified session for parameter-based interviews
      const session = {
        sessionId,
        userId,
        language,
        experienceLevel,
        sessionStartTime: Date.now(), // Track start time for timer-based question forcing
        currentProblemId: null, // DYNAMIC: Will be detected from code patterns
        detectedApproach: null, // Will store detected approach
        detectedProblemType: null, // Will store detected problem type
        jobProfile: {
          title: 'Dynamic Code Assessment',
          parameters: [
            {
              id: 0,
              name: 'Approach Analysis',
              description: 'Analyze candidate approach and compare against alternatives'
            }
          ]
        },
        parameterProgress: {
          0: {
            milestone: 'not_started',
            codeDetected: false,
            questionsAsked: [],
            approachDetected: false,
            solutionsCompared: false
          }
        },
        currentCode: { main: '' },
        awaitingAnswer: null,
        conversationThreads: new Map(),
        conversationHistory: [],
        conversationContext: {},
        conversationNarrative: [],
        recentMentions: new Map(),
        candidatePersonality: { 
          communicationStyle: 'concise', 
          technicalDepth: 'surface',
          responsePatterns: [],
          interests: new Set(),
          concerns: new Set()
        }
      };
      
      this.activeSessions.set(sessionId, session);
      console.log(`✅ LHIS: Dynamic parameter-based session initialized: ${sessionId}`);
      
      return {
        success: true,
        sessionId,
        message: 'Dynamic parameter assessment initialized'
      };
      
    } catch (error) {
      console.error(`❌ LHIS: Parameter assessment initialization failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initialize assessment session with job profile
   */
  async initializeAssessment(sessionId, candidateId, jobProfileId, language, experienceLevel) {
    try {
      console.log(`🎯 LHIS: Initializing assessment for session ${sessionId}`);
      
      // Fetch job profile with better error handling
      let jobProfile;
      try {
        const { data: jobProfiles, error: profileError } = await this.supabase
        .from('job_profiles')
        .select('*')
          .eq('id', jobProfileId);

        if (profileError) {
          throw new Error(`Database error: ${profileError.message}`);
        }

        if (!jobProfiles || jobProfiles.length === 0) {
          throw new Error(`No job profile found with ID: ${jobProfileId}`);
        }

        if (jobProfiles.length > 1) {
          console.log(`⚠️  Multiple job profiles found for ID ${jobProfileId}, using the first one`);
        }

        jobProfile = jobProfiles[0]; // Take the first matching profile
        console.log(`📋 Job profile found: "${jobProfile.title}"`);

      } catch (dbError) {
        console.error(`❌ Job profile fetch failed:`, dbError);
        throw new Error(`Job profile not found: ${dbError.message}`);
      }

      // Check if session already exists to avoid duplicate key error
      const { data: existingSession } = await this.supabase
        .from('assessment_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      let assessmentSession;
      if (existingSession) {
        console.log(`📋 Reusing existing assessment session for ${sessionId}`);
        assessmentSession = existingSession;
      } else {
        // Create new assessment session record
        const { data: newSession, error: sessionError } = await this.supabase
        .from('assessment_sessions')
        .insert([{
          session_id: sessionId,
          candidate_id: candidateId,
          job_profile_id: jobProfileId,
          assessment_state: {
            currentParameterIndex: 0,
            completedParameters: [],
            startTime: new Date().toISOString(),
            masterProblem: jobProfile.master_problem,
            language: language,
            experienceLevel: experienceLevel
          },
          code_progress: {},
          retry_count: {},
          status: 'active'
        }])
        .select()
        .single();

      if (sessionError) {
        throw new Error(`Failed to create assessment session: ${sessionError.message}`);
        }
        assessmentSession = newSession;
      }

      // Store in memory for real-time access
      this.activeSessions.set(sessionId, {
        sessionId,
        candidateId,
        jobProfile,
        assessmentSession: assessmentSession,
        currentCode: {},
        lastCodeChange: new Date(),
        codeHistory: [],
        parameterProgress: this.initializeParameterProgress(jobProfile.parameters),
        awaitingAnswer: null,
        language,
        experienceLevel,
        conversationHistory: [], // Track LHIS conversation to avoid repetition
        lastEngagementType: null,
        engagementCount: 0,
        lastEngagementTime: null,
        awaitingUserResponse: false,
        lastUserResponse: null,
        
        // Conversation threading system
        conversationThreads: new Map(),
        lastParameterCompletedAt: null,
        lastUserResponse: null,

        
        // 🧵 CONVERSATION THREADING SYSTEM
        conversationNarrative: [], // Timeline of conversation flow for natural references
        topicProgression: [], // Track how topics build on each other
        candidatePersonality: { // Learn candidate's communication patterns
          communicationStyle: 'unknown', // 'detailed', 'concise', 'uncertain', 'confident'
          technicalDepth: 'unknown', // 'surface', 'intermediate', 'deep', 'expert'
          responsePatterns: [], // Track typical response characteristics
          interests: new Set(), // Topics they show enthusiasm for
          concerns: new Set(), // Areas they express uncertainty about
          strengths: new Set(), // Technical areas they demonstrate confidence in
          preferredExplanationStyle: 'unknown' // 'code-first', 'concept-first', 'example-driven'
        },
        conversationContext: { // Current conversation state
          currentMainTopic: null,
          activeThreads: new Set(), // Currently ongoing discussion threads
          recentMentions: new Map(), // Recently mentioned topics (for natural callbacks)
          conversationMood: 'neutral', // 'encouraging', 'challenging', 'supportive'
          sessionPhase: 'introduction' // 'introduction', 'exploration', 'deep_dive', 'conclusion'
        }
      });

      console.log(`✅ Assessment session initialized for job: ${jobProfile.title}`);
      
      return {
        success: true,
        sessionId,
        jobProfile: {
          title: jobProfile.title,
          description: jobProfile.description,
          parameters: jobProfile.parameters,
          masterProblem: null // Disable AI master problem - use database problems only
        },
        assessmentCriteria: jobProfile.assessment_criteria,
        initialMessage: this.generatePersonalWelcomeMessage(jobProfile, candidateId, language)
      };

    } catch (error) {
      console.error('❌ Failed to initialize assessment:', error);
      throw error;
    }
  }

  /**
   * Monitor code changes in real-time
   */
  async monitorCodeChange(sessionId, questionId, code, language) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.log(`⚠️ Session ${sessionId} not found for code monitoring`);
      return;
    }

    // Update current code
    session.currentCode[questionId] = code;
    session.lastCodeChange = new Date();
    
    // Add to code history
    session.codeHistory.push({
      timestamp: new Date().toISOString(),
      questionId,
      code: code.substring(0, 500),
      length: code.length
    });

    console.log(`📝 Code change detected in session ${sessionId}, question ${questionId} (${code.length} chars)`);

    // Reset awaiting response flag since user is active
    session.awaitingUserResponse = false;

    // NOTE: Analysis is handled by assessment socket to prevent duplicates
    // Do not call analyzeCodeProgress here as it will cause duplicate AI analysis
    console.log(`📝 LHIS: Code updated, analysis will be handled by assessment socket`);
  }

  /**
   * LHIS - Streamlined code analysis for parameter detection
   * Sequential analysis to prevent conflicts and AI timeouts
   */
  async analyzeCodeProgress(sessionId, questionId, code, language) {
    const session = this.activeSessions.get(sessionId);
    this.ensureSessionShapes(session);
    if (!session || !code) {
      return false;
    }

    // Store code
    if (!session.currentCode) {
      session.currentCode = {};
    }
    session.currentCode[questionId] = code;
    session.currentCode['latest'] = code;
    
    console.log(`💾 LHIS: Code stored - ${questionId}: ${code.length} chars`);

    // Quality filters (keep these - they ensure meaningful code)
    const { codeThresholds, qualityFilters } = parameterDetectionConfig;
    const stats = this.getCodeStats(code);
    
    if (code.trim().length < codeThresholds.minimumCharacters) {
      console.log(`⏭️ LHIS: Code too short (${code.length} < ${codeThresholds.minimumCharacters})`);
      return false;
    }
    
    if (qualityFilters?.requireImplementation && !stats.hasImplementationSignals) {
      console.log(`⏭️ LHIS: No implementation signals detected`);
      return false;
    }
    
    if (stats.meaningfulLines < codeThresholds.minimumMeaningfulLines) {
      console.log(`⏭️ LHIS: Not enough meaningful lines (${stats.meaningfulLines} < ${codeThresholds.minimumMeaningfulLines})`);
      return false;
    }
    
    if (stats.boilerplateRatio > qualityFilters.maxBoilerplateRatio) {
      console.log(`⏭️ LHIS: Too much boilerplate (${stats.boilerplateRatio} > ${qualityFilters.maxBoilerplateRatio})`);
      return false;
    }

    // ✅ SIMPLIFIED: Use approach detection instead of AI parameter detection
    // This is fast, reliable, and always works
    console.log(`🔍 LHIS: Detecting approach for ${code.length} chars of ${language} code`);
    
    const detectedApproach = this.detectApproachUniversal(code, language);
    const detectedProblem = this.detectProblemUniversal(code, language);
    
    // Update session with detected info
    session.detectedApproach = detectedApproach;
    session.detectedProblemType = detectedProblem;
    session.currentProblemId = detectedProblem.problemId;
    
    // Always use parameter 0 (Approach Analysis) for all code
    const parameterProgress = session.parameterProgress;
    const paramKey = 0;
    
    if (!parameterProgress[paramKey]) {
      parameterProgress[paramKey] = {
        milestone: 'not_started',
        codeDetected: false,
        questionsAsked: [],
        approachDetected: false
      };
    }
    
    const progress = parameterProgress[paramKey];
    
    // Mark as detected if approach found OR if quality filters passed (ensures questions always generate)
    const hasValidApproach = detectedApproach.confidence > 0.3 || detectedApproach.type !== 'unknown';
    
    if (hasValidApproach || true) { // Always mark as detected if quality filters passed
      if (!progress.codeDetected) {
        console.log(`✅ LHIS: Code detected - Approach: ${detectedApproach.type} (${(detectedApproach.confidence * 100).toFixed(1)}%)`);
        progress.codeDetected = true;
        progress.approachDetected = hasValidApproach;
        progress.detectedApproach = detectedApproach;
        progress.detectedAt = new Date().toISOString();
        progress.lastDetectedTimestamp = Date.now();
        return true;
      } else {
        // Update approach info even if already detected
        progress.detectedApproach = detectedApproach;
        progress.approachDetected = hasValidApproach;
        console.log(`✅ LHIS: Code already detected, updated approach: ${detectedApproach.type}`);
        return true;
      }
    }
    
    return true; // Always return true if quality filters passed
  }



  /**
   * AI-powered parameter detection with specific criteria
   * Enhanced to prevent cross-parameter detection confusion
   */
  async fastParameterDetection(code, parameter, language) {
    console.log(`🔍 Analyzing ${parameter.name}...`);

    try {
      const aiService = require('./aiService');
      
      // Simple, clear prompt that trusts AI intelligence
      const detectionPrompt = `Analyze this ${language} code to determine if it demonstrates competency in "${parameter.name}".

Parameter: ${parameter.name}
Description: ${parameter.description}

CODE:
${code}

Instructions:
- Look at what the code actually implements and uses
- Consider if this code demonstrates understanding of ${parameter.name}
- Be precise - only detect what is clearly demonstrated in the code
- Don't over-interpret or make assumptions

Respond with JSON:
{
  "detected": true/false,
  "confidence": 0-100,
  "evidence": ["specific elements in the code that demonstrate this parameter"],
  "reasoning": "brief explanation of your assessment"
}`;

      console.log(`🔍 Requesting AI analysis`);
      // Add timeout to prevent hanging
      const response = await Promise.race([
        aiService.performAIAnalysis(detectionPrompt),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI analysis timeout')), 10000) // 10 second timeout
        )
      ]);
      
      if (response) {
      let result;
        
        // Parse the AI response - handle AI module's response format
        try {
          // Check if response has analysis field (from AI module)
          if (response.analysis && typeof response.analysis === 'object') {
            result = response.analysis;
          } else if (typeof response === 'string') {
            // Try to extract JSON from string response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            } else {
              console.error('No JSON found in AI response');
              return false;
            }
          } else if (typeof response === 'object') {
            // Direct object response
            result = response;
      } else {
            console.error('Unexpected response type:', typeof response);
            return false;
          }
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError);
          return false;
        }

        // Validate the result has required fields
        if (!result || typeof result.detected === 'undefined' || typeof result.confidence === 'undefined') {
          console.error('Invalid AI response structure');
          return false;
        }

        // Log the analysis result
        console.log(`🤖 ${parameter.name}: ${result.detected ? '✅' : '❌'} (${result.confidence}%) - ${result.reasoning}`);

        // Trust the AI with a reasonable confidence threshold
        const isDetected = result.detected && result.confidence >= 70;
        
        return isDetected;
      }
      
    } catch (error) {
      if (error.message === 'AI analysis timeout') {
        console.error(`⏰ AI detection timeout for ${parameter.name} - falling back to false`);
      } else {
      console.error(`❌ AI detection error for ${parameter.name}:`, error);
      }
    }

    // Default to not detected if AI fails or times out
    return false;
  }



  /**
   * Get objective detection criteria for a parameter
   */
  getObjectiveDetectionCriteria(parameter) {
    const parameterName = parameter.name.toUpperCase();
    
    // AWS Services Proficiency
    if (parameterName.includes('AWS')) {
      return {
        description: 'AWS Services Proficiency - Using AWS cloud services in the implementation',
        primaryIndicators: [
          'AWS SDK initialization or client creation (DynamoDB, S3, Lambda, etc.)',
          'AWS service operations (put, get, query, upload, invoke)',
          'Lambda function handler implementation',
          'AWS resource configuration or setup',
          'CloudFormation/CDK/SAM template usage'
        ],
        secondaryIndicators: [
          'AWS environment variables (AWS_REGION, credentials)',
          'IAM role or policy references',
          'AWS resource ARNs in code',
          'AWS-specific error handling',
          'AWS service response handling'
        ],
        minimumPrimary: 1,
        confidenceThreshold: 60
      };
    }
    
    // Java & Spring Framework Expertise - ONLY trigger on Spring-specific indicators
    if (parameterName.includes('SPRING')) {
      return { 
        description: 'Java & Spring Framework Expertise - Building Spring-based applications with EXPLICIT Spring annotations and features',
        primaryIndicators: [
          'Spring annotations (@SpringBootApplication, @RestController, @Service, @Component, @Repository)',
          'Dependency injection (@Autowired, @Inject, @Bean configuration)',
          'Spring REST endpoints (@GetMapping, @PostMapping, @RequestMapping, @PathVariable)',
          'Spring Boot main class with SpringApplication.run()',
          'Spring configuration (@Configuration, @EnableAutoConfiguration)'
        ],
        secondaryIndicators: [
          'Spring profiles (@Profile, application.properties)',
          'Spring transaction management (@Transactional)',
          'Spring Data JPA repositories (extends JpaRepository)',
          'Spring exception handling (@ExceptionHandler, @ControllerAdvice)',
          'Spring Security configuration (@EnableWebSecurity)'
        ],
        minimumPrimary: 2,
        confidenceThreshold: 85, // Increased from 70% to 85% for stricter detection
        strictMode: true, // Add flag for extra strict validation
        excludePatterns: [
          'AWS DynamoDB mapper', 
          'AWS SDK', 
          'boto3', 
          'dynamo client',
          'AWS services without Spring context'
        ]
      };
    }
    
    // System Integration & Data Management
    if (parameterName.includes('SYSTEM') || parameterName.includes('DATA') || parameterName.includes('INTEGRATION')) {
      return {
        description: 'System Integration & Data Management - Connecting systems and managing data',
        primaryIndicators: [
          'Database operations (CRUD, queries, transactions)',
          'API client implementation (REST, SOAP, GraphQL)',
          'Message queue integration (SQS, RabbitMQ, Kafka)',
          'Data transformation or mapping logic',
          'File/stream processing implementation'
        ],
        secondaryIndicators: [
          'Data validation logic',
          'Error handling and retry mechanisms',
          'Caching implementation',
          'Batch processing logic',
          'Data synchronization code'
        ],
        minimumPrimary: 1,
        confidenceThreshold: 65
      };
    }
    
    // Default criteria for unknown parameters
    return {
      description: `${parameter.name} - ${parameter.description}`,
      primaryIndicators: [
        'Core functionality implementation for the parameter',
        'Proper use of relevant frameworks or libraries',
        'Business logic addressing the parameter requirements',
        'Integration with system components',
        'Appropriate design patterns'
      ],
      secondaryIndicators: [
        'Error handling',
        'Configuration management',
        'Testing considerations',
        'Performance optimizations',
        'Security measures'
      ],
      minimumPrimary: 1,
      confidenceThreshold: 60
    };
  }

  /**
   * Get numeric level for milestone comparison
   */
  getMilestoneLevel(milestone) {
    const levels = {
      'not_started': 0,
      'basic_implementation': 1,
      'service_integration': 2,
      'error_handling_optimization': 3,
      'advanced_patterns': 4,
      'completed': 5,
      'failed': -1
    };
    return levels[milestone] || 0;
  }

  /**
   * LHIS - Trigger parameter assessment with depth progression
   * Only triggers if no question is currently awaiting answer
   */
  async triggerParameterAssessment(sessionId, parameterKey) {
    console.log(`🚀 LHIS: triggerParameterAssessment called for ${sessionId}, parameter ${parameterKey}`);
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.log(`❌ LHIS: No session found for ${sessionId}`);
      return null;
    }
    
    console.log(`✅ LHIS: Session found, proceeding with parameter assessment`);
    console.log(`   awaitingAnswer: ${session.awaitingAnswer ? 'YES' : 'NO'}`);
    console.log(`   parameterProgress keys: ${Object.keys(session.parameterProgress || {})}`);
    console.log(`   current code length: ${Object.keys(session.currentCode || {}).map(k => `${k}: ${(session.currentCode[k] || '').length}`)}`);
    

    // Check if already awaiting an answer
    if (session.awaitingAnswer) {
      console.log(`⏭️ LHIS: Already awaiting answer for parameter ${session.awaitingAnswer.parameterId}, skipping`);
      return null;
    }

    const { jobProfile } = session;
    // Find parameter by key (either id or array index)
    const parameter = jobProfile.parameters.find((p, idx) => {
      const pKey = p.id !== undefined ? p.id : idx;
      return pKey === parameterKey;
    });
    const progress = session.parameterProgress[parameterKey];

    if (!parameter) {
      console.log(`❌ LHIS: Parameter ${parameterKey} not found`);
      return null;
    }
    
    // ✅ SIMPLIFIED: Don't require codeDetected - if we're here, code is valid
    // Just check if we have code
    const hasCode = session.currentCode && 
                   Object.values(session.currentCode).some(c => c && c.trim().length >= 150);
    
    if (!hasCode) {
      console.log(`❌ LHIS: No valid code found`);
      return null;
    }
    
    // Ensure codeDetected is set if we have valid code
    if (!progress.codeDetected && hasCode) {
      progress.codeDetected = true;
      console.log(`✅ LHIS: Marking parameter ${parameterKey} as detected (valid code present)`);
    }

    // Determine current depth (0, 1, or 2)
    const currentDepth = progress.questionsAsked.length;
    
    // Check if parameter is complete (3 questions asked)
    if (currentDepth >= 3) {
      console.log(`✅ LHIS: Parameter ${parameter.name} already complete (${currentDepth} questions asked)`);
      return null;
    }

    // 🧠 AI-GENERATED DEPTH QUESTIONS - No database storage needed!
    // Generate contextual questions on-the-fly based on code analysis and depth level
    console.log(`🧠 LHIS: Generating AI depth question for ${parameter.name} - Depth ${currentDepth + 1}`);
    
    const depthQuestion = await this.generateAIDepthQuestion(
      parameter, 
      currentDepth, 
      session
    );
    
    if (!depthQuestion) {
      console.log(`❌ LHIS: Failed to generate AI depth question for ${parameter.name}`);
      return null;
    }

    const depthLabels = [
      'Approach & Logic Assessment',
      'Trade-offs & Alternatives', 
      'What-if Scenarios & Adaptability'
    ];
    
    console.log(`🎯 LHIS: Triggering ${parameter.name} - Depth ${currentDepth + 1}/3 (${depthLabels[currentDepth]})`);

    // Mark as awaiting answer
    session.awaitingAnswer = {
      parameterId: parameterKey,
      depthLevel: currentDepth,
      question: depthQuestion,
      questionType: depthLabels[currentDepth],
      askedAt: new Date().toISOString()
    };

    // Use the AI-generated depth question directly (no redundant systems)
    const generatedQuestion = depthQuestion.question;
    const questionSource = depthQuestion.ai_generated ? 'ai_depth_question' : 'intelligent_fallback';

    console.log(`📝 LHIS: Question generated from: ${questionSource}`);

    // Map question source to user-friendly labels with parameter context
    const questionLabel = this.getQuestionSourceLabel(questionSource, parameter.name, parameterKey, currentDepth + 1);

    // 🧵 Add conversation threading to the question
    const currentTopic = parameter.name.toLowerCase();
    const conversationCallback = this.generateConversationCallback(session, currentTopic);
    
    // 🧵 Update conversation threading for question
    this.updateConversationThreading(sessionId, 'question', generatedQuestion, {
      parameterId: parameterKey,
      depthLevel: currentDepth,
      parameterName: parameter.name,
      questionSource
    });

    // 🧵 Enhance question with personality-aware touches and conversation callbacks
    let enhancedQuestion = generatedQuestion;
    
    // Add threading status when conversation memory is being used
    const threadingStatus = 'active'; // 'active', 'error', 'offline'
    const hasThreading = conversationCallback || session.conversationThreads?.size > 0;
    if (hasThreading) {
      console.log(`🧵 LHIS: Adding conversation threading status`);
    }
    
    if (conversationCallback) {
      enhancedQuestion = `${conversationCallback} ${generatedQuestion}`;
      console.log(`🧵 LHIS: Added conversation callback to question`);
    }
    
    enhancedQuestion = this.generatePersonalityAwareResponse(session, enhancedQuestion);

    return {
      type: 'parameter_question',
      parameterId: parameterKey,
      parameterName: parameter.name,
      depthLevel: currentDepth + 1,
      question: enhancedQuestion, // No emoji prefix
      questionId: `param-${parameterKey}-depth-${currentDepth + 1}`,
      questionSource, // Track where the question came from
      questionLabel, // Enhanced label with parameter context
      threadingStatus: hasThreading ? threadingStatus : null, // Pass status instead of boolean
      metadata: {
        correctAnswer: depthQuestion.correct_answer,
        assessmentCriteria: depthQuestion.assessment_criteria,
        isInterviewerOnly: true
      }
    };
  }

  /**
   * Map question source to user-friendly display labels with parameter context
   * STREAMLINED: Use short, clean format
   */
  getQuestionSourceLabel(questionSource, parameterName, parameterId, depthLevel) {
    const sourceMapping = {
      'ai_depth_question': 'AI Depth',
      'intelligent_fallback': 'Fallback'
    };
    
    const sourceLabel = sourceMapping[questionSource] || 'Fallback';
    return `${sourceLabel} • P${parameterId}`;
  }

  /**
   * Generate smart contextual question without relying on AI - Enhanced for ANY code
   */
  generateSmartContextualQuestion(parameter, depthQuestion, currentDepth, session) {
    const candidateCode = session.currentCode['master-problem'] || session.currentCode['main'] || '';
    const parameterName = parameter.name;
    const baseQuestion = depthQuestion.question;
    
    // Analyze what the candidate has implemented
    const codeAnalysis = this.analyzeImplementationApproach(candidateCode, parameter);
    const codeInsights = this.generateCodeInsights(codeAnalysis, candidateCode);
    
    // Generate contextual variations based on depth and actual code content
    const contextualQuestion = this.generateDepthSpecificQuestion(
      parameter, 
      baseQuestion, 
      codeAnalysis, 
      currentDepth, 
      candidateCode,
      codeInsights
    );
    
    return contextualQuestion;
  }

  /**
   * Generate depth-specific questions that adapt to ANY code content
   */
  generateDepthSpecificQuestion(parameter, baseQuestion, analysis, currentDepth, code, insights) {
    const paramName = parameter.name;
    const hasCode = code.length > parameterDetectionConfig.codeThresholds.minimumCharacters;
    const codeSnippet = code.substring(0, 100).replace(/\n/g, ' ').trim();
    
    // Use natural question starters instead of repetitive patterns
    const naturalStarter = this.generateNaturalQuestionStarter(parameter, code, currentDepth);
    const starter = naturalStarter || "Looking at your current implementation";
    
    switch (currentDepth) {
      case 0: // Depth 1 - Understanding & Approach
        if (paramName.includes('Java') || paramName.includes('Spring')) {
          if (analysis.usesClasses) {
            return `${starter}. How does your current class design align with Java best practices for ${paramName.toLowerCase()}? What key principles are you applying?`;
          } else {
            return `${starter}. What's your approach to structuring this Java solution for ${paramName.toLowerCase()}, and why did you choose this particular design pattern?`;
          }
        }
        
        if (paramName.includes('AWS') || paramName.includes('Data')) {
          if (analysis.usesFrameworks || code.includes('mapper') || code.includes('save')) {
            return `${starter}. How does your current implementation strategy address the ${paramName.toLowerCase()} requirements? What's driving your technical choices here?`;
          } else {
            return `${starter}. Can you walk me through your implementation strategy for ${paramName.toLowerCase()}? What key considerations are guiding your design decisions?`;
          }
        }
        
        if (paramName.includes('System') || paramName.includes('Integration')) {
          if (analysis.implementsLogic || code.includes('if') || code.includes('for')) {
            return `${starter}. How does your current approach tackle the ${paramName.toLowerCase()} challenges? What's your reasoning behind this structure?`;
          } else {
            return `${starter}. What's your overall strategy for ${paramName.toLowerCase()}? How are you thinking about the integration points?`;
          }
        }
        
        // Generic contextual fallback that works with ANY code
        return `${starter}. Can you explain your current approach to ${paramName.toLowerCase()} and what key principles you're keeping in mind as you build this solution?`;

      case 1: // Depth 2 - Implementation Details
        const implementationStarter = hasCode ? 
          `${starter}, let's dive deeper into the implementation details` : 
          `Let's explore the implementation details of your ${paramName.toLowerCase()} solution`;
          
        if (paramName.includes('Java') || paramName.includes('Spring')) {
          if (analysis.usesMethods && analysis.usesVariables) {
            return `${implementationStarter}. How are you handling ${paramName.toLowerCase()} specifics? What implementation details are you focusing on for reliability?`;
          } else {
            return `${implementationStarter}. What specific technical challenges are you addressing, and how are you ensuring robustness?`;
          }
        }
        
        if (paramName.includes('AWS') || paramName.includes('Data')) {
          if (analysis.usesDataStructures || code.includes('List') || code.includes('Map')) {
            return `${implementationStarter}. How are you handling the ${paramName.toLowerCase()} data flow and persistence? What specific implementation patterns are you using?`;
          } else {
            return `${implementationStarter}. How are you managing data consistency and service integration? What technical specifics are you considering?`;
          }
        }
        
        if (paramName.includes('System') || paramName.includes('Integration')) {
          if (analysis.hasErrorHandling || code.includes('try') || code.includes('catch')) {
            return `${implementationStarter}. How are you implementing robust ${paramName.toLowerCase()} handling? What edge cases and failure scenarios are you accounting for?`;
          } else {
            return `${implementationStarter}. How are you ensuring system reliability? What specific technical measures are you implementing for robustness?`;
          }
        }
        
        // Generic depth 2 fallback
        return `${implementationStarter}. What specific technical details are you focusing on? How are you ensuring your solution handles edge cases effectively?`;

      case 2: // Depth 3 - Optimization & Best Practices
        const optimizationStarter = hasCode ? 
          `${starter}, thinking about optimization and production readiness` : 
          `Considering ${paramName.toLowerCase()} optimization`;
          
        if (paramName.includes('Java') || paramName.includes('Spring')) {
          if (analysis.hasDocumentation || code.includes('/**') || code.includes('//')) {
            return `${optimizationStarter}. How would you optimize this ${paramName.toLowerCase()} implementation for production? What performance and maintainability improvements would you consider?`;
          } else {
            return `${optimizationStarter}. What optimizations and best practices would you implement? How would you enhance performance and maintainability?`;
          }
        }
        
        if (paramName.includes('AWS') || paramName.includes('Data')) {
          if (analysis.linesOfCode > 20 || code.length > 200) {
            return `${optimizationStarter}. What optimization strategies would you employ for ${paramName.toLowerCase()} at scale? How would you handle high-volume scenarios and cost efficiency?`;
          } else {
            return `${optimizationStarter}. What scalability and cost considerations would you implement? How would you enhance this solution for enterprise-level performance?`;
          }
        }
        
        if (paramName.includes('System') || paramName.includes('Integration')) {
          return `${optimizationStarter}. What advanced patterns and performance improvements would you consider for ${paramName.toLowerCase()}? How would you scale this solution and ensure operational excellence?`;
        }
        
        // Generic depth 3 fallback
        return `${optimizationStarter}. What advanced techniques and best practices would you implement for ${paramName.toLowerCase()}? How would you enhance scalability and performance?`;

      default:
        return baseQuestion;
    }
  }

  /**
   * Build enhanced AI context prompt for maximum contextual understanding
   */
  buildEnhancedContextPrompt(parameter, depthQuestion, currentDepth, session) {
    const candidateCode = session.currentCode['master-problem'] || session.currentCode['main'] || '';
    const codeSnippet = candidateCode.substring(0, 500); // Increased from 300 to 500
    const depthLabels = ['Understanding & Approach', 'Implementation Details', 'Optimization & Best Practices'];
    
    // Analyze code patterns for better context
    const codeAnalysis = this.analyzeImplementationApproach(candidateCode, parameter);
    const codeInsights = this.generateCodeInsights(codeAnalysis, candidateCode);
    
    return `You are an experienced technical interviewer conducting a live coding assessment. 

INTERVIEW CONTEXT:
- Parameter Being Assessed: ${parameter.name}
- Parameter Description: ${parameter.description}
- Assessment Depth: ${depthLabels[currentDepth]} (Level ${currentDepth + 1}/3)
- Base Question: ${depthQuestion.question}

CANDIDATE'S CODE ANALYSIS:
- Code Sample: ${codeSnippet}
- Code Length: ${candidateCode.length} characters
- Detected Patterns: ${JSON.stringify(codeAnalysis)}
- Key Insights: ${codeInsights}

TASK: Generate a natural, conversational follow-up question that:
1. DIRECTLY references their specific code implementation approach
2. Shows you've actually read and understood their code
3. Assesses ${parameter.name} at the ${depthLabels[currentDepth]} level
4. Feels like a natural conversation between interviewer and candidate
5. Is specific to their actual code choices and patterns
6. Stays under 3 sentences and is encouraging
7. Avoids generic templates - be specific to THEIR implementation

EXAMPLES OF GOOD CONTEXTUAL QUESTIONS:
- "I notice you're using UUID for product IDs - how does this choice impact your ${parameter.name.toLowerCase()} strategy?"
- "Your mapper.save() approach is interesting - what considerations guided this pattern for ${parameter.name.toLowerCase()}?"
- "I see you've structured the Product class with setters - how does this design support ${parameter.name.toLowerCase()} requirements?"

Generate a question that shows you understand their specific implementation:`;
  }

  /**
   * Generate insights from code analysis for better AI context
   */
  generateCodeInsights(analysis, code) {
    const insights = [];
    
    if (analysis.usesClasses) {
      const classMatches = code.match(/class\s+(\w+)/gi);
      if (classMatches) {
        insights.push(`Uses classes: ${classMatches.join(', ')}`);
      }
    }
    
    if (analysis.usesMethods) {
      const methodMatches = code.match(/(public|private|protected)\s+\w+\s+(\w+)\s*\(/gi);
      if (methodMatches) {
        insights.push(`Methods defined: ${methodMatches.slice(0, 3).join(', ')}`);
      }
    }
    
    if (analysis.usesDataStructures) {
      const dataStructures = [];
      if (code.toUpperCase().includes('LIST')) dataStructures.push('List');
      if (code.toUpperCase().includes('MAP')) dataStructures.push('Map');
      if (code.toUpperCase().includes('ARRAY')) dataStructures.push('Array');
      if (dataStructures.length > 0) {
        insights.push(`Data structures: ${dataStructures.join(', ')}`);
      }
    }
    
    if (analysis.hasErrorHandling) {
      insights.push('Implements error handling');
    }
    
    if (analysis.usesFrameworks) {
      const frameworks = [];
      if (code.includes('@')) frameworks.push('Annotations');
      if (code.toUpperCase().includes('SPRING')) frameworks.push('Spring');
      if (frameworks.length > 0) {
        insights.push(`Framework usage: ${frameworks.join(', ')}`);
      }
    }
    
    // Specific patterns
    if (code.includes('UUID')) insights.push('Uses UUID for ID generation');
    if (code.includes('mapper.save')) insights.push('Uses mapper pattern for persistence');
    if (code.includes('request.get')) insights.push('Extracts data from request objects');
    if (code.includes('setAvailable')) insights.push('Implements availability logic');
    
    return insights.length > 0 ? insights.join('; ') : 'Basic code structure detected';
  }

  /**
   * Validate AI response quality
   */
  isValidAIResponse(response) {
    if (!response) return false;
    
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response.question) {
      text = response.question;
    } else if (response.response) {
      text = response.response;
    }
    
    return text && 
           text.length > 30 && 
           text.length < 500 && 
           !text.toLowerCase().includes('error') &&
           !text.toLowerCase().includes('failed');
  }

  /**
   * Clean and format AI response
   */
  cleanAIResponse(response) {
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response.question) {
      text = response.question;
    } else if (response.response) {
      text = response.response;
    }
    
    // Remove common AI prefixes
    const prefixes = [
      'here\'s a contextual question:',
      'here\'s a follow-up question:',
      'i would ask:',
      'a good question would be:',
      'question:'
    ];
    
    for (const prefix of prefixes) {
      if (text.toLowerCase().startsWith(prefix)) {
        text = text.substring(prefix.length).trim();
      }
    }
    
    return text.trim();
  }

  /**
   * LHIS - Process candidate answer and determine next action
   */
  async processAnswer(sessionId, answer) {
    console.log(`🚨 LHIS: processAnswer ENTRY POINT - session ${sessionId} answer length ${answer?.length || 0}`);
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.log(`❌ LHIS: No session found for ${sessionId}`);
      return { success: false, message: 'Session not found' };
    }
    
    if (!session.awaitingAnswer) {
      console.log(`❌ LHIS: No awaiting answer for session ${sessionId}`);
      return { success: false, message: 'No question is currently being assessed' };
    }

    const { parameterId, depthLevel, question } = session.awaitingAnswer;
    
    // Find parameter by key (either id or array index) - same logic as used elsewhere
    const parameter = session.jobProfile.parameters.find((p, idx) => {
      const pKey = p.id !== undefined ? p.id : idx;
      return pKey === parameterId;
    });
    
    if (!parameter) {
      console.error(`❌ LHIS: Parameter not found for parameterId: ${parameterId}`);
      return { success: false, message: 'Parameter not found' };
    }
    
    console.log(`🔍 LHIS: Processing answer for ${parameter.name} Depth ${parameterId}.${depthLevel + 1}`);

    // 🧵 Update conversation threading for candidate answer
    this.updateConversationThreading(sessionId, 'answer', answer, {
      parameterId,
      depthLevel,
      parameterName: parameter.name
    });

    // Fast answer evaluation using basic semantic analysis
    const evaluation = await this.fastAnswerEvaluation(answer, question.correct_answer, question.assessment_criteria);
    
    // ALWAYS PASS - We want all 3 questions regardless of answer quality
    const passed = true; // Focus on data collection, not filtering
    
    console.log(`🔍 LHIS: Answer received - Score: ${evaluation.score}, Length: ${answer.length}, Always Progressing: ${passed}`);
    
    // Store the result - with comprehensive debugging
    console.log(`🔍 LHIS: About to access parameterProgress with parameterId: ${parameterId} (type: ${typeof parameterId})`);
    console.log(`🔍 LHIS: session.parameterProgress:`, JSON.stringify(session.parameterProgress, null, 2));
    
    const progress = session.parameterProgress[String(parameterId)];
    console.log(`🔍 LHIS: Retrieved progress object:`, progress);
    
    // Ensure progress object exists
    if (!progress) {
      console.log(`❌ LHIS: Progress object missing for parameter ${parameterId}`);
      console.log(`🔍 LHIS: Available parameterProgress keys:`, Object.keys(session.parameterProgress));
      
      // Try to create missing progress object with correct key type
      session.parameterProgress[String(parameterId)] = {
        milestone: 'not_started',
        codeDetected: true, // Must be true since we're processing an answer
        questionsAsked: []
      };
      console.log(`✅ LHIS: Created missing progress object for parameter ${parameterId}`);
    }
    
    // Get the (possibly newly created) progress object
    const finalProgress = session.parameterProgress[String(parameterId)];
    console.log(`🔍 LHIS: Final progress object:`, finalProgress);
    
    // Safety check - this should never happen but let's be sure
    if (!finalProgress) {
      console.error(`🚨 LHIS: CRITICAL - finalProgress is still undefined after creation attempt!`);
      console.error(`🚨 LHIS: parameterId: ${parameterId} (${typeof parameterId})`);
      console.error(`🚨 LHIS: String(parameterId): ${String(parameterId)}`);
      console.error(`🚨 LHIS: parameterProgress keys: ${Object.keys(session.parameterProgress)}`);
      console.error(`🚨 LHIS: Full parameterProgress:`, JSON.stringify(session.parameterProgress, null, 2));
      return { success: false, message: 'Critical error: parameter progress object creation failed' };
    }
    
    // Ensure questionsAsked array exists
    if (!finalProgress.questionsAsked) {
      console.log(`⚠️ LHIS: questionsAsked array missing, initializing...`);
      finalProgress.questionsAsked = [];
    }
    
    // Final safety check before push - this is the critical line that was failing
    if (!finalProgress || !finalProgress.questionsAsked) {
      console.error(`🚨 LHIS: FINAL SAFETY CHECK FAILED!`);
      console.error(`🚨 LHIS: finalProgress exists: ${!!finalProgress}`);
      console.error(`🚨 LHIS: finalProgress.questionsAsked exists: ${!!finalProgress?.questionsAsked}`);
      
      // Force create the structure
      if (!finalProgress) {
        console.error(`🚨 LHIS: Creating finalProgress from scratch`);
        session.parameterProgress[String(parameterId)] = {
          milestone: 'not_started',
          codeDetected: true,
          questionsAsked: []
        };
        const newProgress = session.parameterProgress[String(parameterId)];
        console.log(`🚨 LHIS: Force-created progress:`, newProgress);
      } else if (!finalProgress.questionsAsked) {
        console.error(`🚨 LHIS: Adding questionsAsked array to existing progress`);
        finalProgress.questionsAsked = [];
      }
    }
    
    // Get fresh reference after potential creation
    const safeProgress = session.parameterProgress[String(parameterId)];
    console.log(`🔍 LHIS: About to push to questionsAsked array, current length: ${safeProgress?.questionsAsked?.length || 'UNDEFINED'}`);
    
    // Absolutely safe push
    if (safeProgress && safeProgress.questionsAsked && Array.isArray(safeProgress.questionsAsked)) {
      safeProgress.questionsAsked.push({
        depthLevel,
        question: question.question,
        candidateAnswer: answer,
        correctAnswer: question.correct_answer,
        score: evaluation.score,
        passed,
        feedback: evaluation.feedback,
        timestamp: new Date().toISOString()
      });
      console.log(`✅ LHIS: Successfully pushed answer to questionsAsked array`);
    } else {
      console.error(`🚨 LHIS: CRITICAL FAILURE - Cannot push to questionsAsked array`);
      console.error(`🚨 LHIS: safeProgress:`, safeProgress);
      return { success: false, message: 'Critical error: Cannot store answer data' };
    }

    // Clear awaiting state
    session.awaitingAnswer = null;

    // Determine next action
    if (passed) {
      console.log(`✅ LHIS: Answer passed (score: ${evaluation.score})`);
      
      if (depthLevel < 2) {
        // Continue to next depth for same parameter
        return {
          success: true,
          action: 'next_depth',
          score: evaluation.score,
          feedback: evaluation.feedback,
          nextDepth: depthLevel + 1,
          parameterId
        };
      } else {
         // Parameter complete, check if more parameters available
         finalProgress.milestone = 'completed';
        session.lastParameterCompletedAt = Date.now(); // Track completion time
        console.log(`🎉 LHIS: Parameter ${parameter.name} completed`);
        
        const nextParameter = this.getNextAvailableParameter(session);
        if (nextParameter) {
          return {
            success: true,
            action: 'next_parameter',
            score: evaluation.score,
            feedback: evaluation.feedback,
            nextParameterId: nextParameter.id,
            completedParameter: parameter.name
          };
        } else {
          return {
            success: true,
            action: 'assessment_complete',
            score: evaluation.score,
            feedback: evaluation.feedback,
            message: this.generateDynamicAssessmentCompletion(session)
          };
        }
      }
    } else {
      console.log(`❌ LHIS: Answer failed (score: ${evaluation.score})`);
      
      // Check retry count
      const retryCount = session.assessmentSession?.retry_count?.[parameterId] || 0;
      
      if (retryCount < 1) {
        // Allow one retry
        if (!session.assessmentSession.retry_count) {
          session.assessmentSession.retry_count = {};
        }
        session.assessmentSession.retry_count[parameterId] = retryCount + 1;
        
        return {
          success: false,
          action: 'retry',
          score: evaluation.score,
          guidance: `Consider the ${parameter.name} concepts more deeply. ${evaluation.feedback}`,
          retryCount: retryCount + 1
        };
      } else {
        // Move to next depth or parameter
        if (depthLevel < 2) {
          return {
            success: false,
            action: 'next_depth',
            score: evaluation.score,
            feedback: `Let's explore the next aspect of ${parameter.name}.`,
            nextDepth: depthLevel + 1,
            parameterId
          };
        } else {
        finalProgress.milestone = 'failed';
          const nextParameter = this.getNextAvailableParameter(session);
          if (nextParameter) {
    return {
              success: false,
              action: 'next_parameter',
      score: evaluation.score,
              feedback: `Let's move on to ${nextParameter.name}.`,
              nextParameterId: nextParameter.id
            };
          } else {
            return {
              success: false,
              action: 'assessment_complete',
              score: evaluation.score,
              feedback: 'Assessment complete. Good effort overall!',
              message: 'All parameters have been covered.'
            };
          }
        }
      }
    }
  }

  /**
   * Fast answer evaluation with minimal AI processing
   */
  async fastAnswerEvaluation(candidateAnswer, correctAnswer, assessmentCriteria) {
    try {
      // Basic semantic similarity check
      const answerLower = candidateAnswer.toLowerCase();
      const correctLower = correctAnswer.toLowerCase();
      
      // Check for key concept overlap
      const correctWords = correctLower.split(/\s+/).filter(word => word.length > 3);
      const answerWords = answerLower.split(/\s+/);
      
      let conceptMatches = 0;
      correctWords.forEach(word => {
        if (answerWords.some(answerWord => answerWord.includes(word) || word.includes(answerWord))) {
          conceptMatches++;
        }
      });
      
      const conceptScore = Math.min((conceptMatches / correctWords.length) * 100, 100);
      
      // Length and effort scoring (reduced weight to avoid penalizing concise answers)
      const lengthScore = Math.min((candidateAnswer.length / 80) * 10, 10);
      
      // Technical keyword scoring (expanded for programming concepts)
      const technicalWords = ['implement', 'design', 'architecture', 'pattern', 'service', 'data', 'security', 'performance', 
                              'decorator', 'function', 'wrapper', 'class', 'method', 'algorithm', 'complexity', 'optimization',
                              'reusable', 'maintainable', 'scalable', 'efficient', 'python', 'javascript', 'java'];
      const techScore = technicalWords.filter(word => answerLower.includes(word)).length * 3;

      // Explanation markers (reward reasoning even when concise)
      const explanationMarkers = ['because', 'therefore', 'trade-off', 'tradeoff', 'reason', 'justify', 'versus', 'vs.',
                                 'approach', 'solution', 'chose', 'decided', 'considered', 'alternative', 'benefit', 'advantage'];
      const reasoningScore = explanationMarkers.filter(w => answerLower.includes(w)).length * 3;
      
      // Length bonus for detailed answers (but cap it)
      const detailBonus = candidateAnswer.length > 200 ? 15 : candidateAnswer.length > 100 ? 10 : 5;
      
      const totalScore = Math.min((conceptScore + lengthScore + techScore + reasoningScore + detailBonus) / 100, 1);
      
      return {
        score: Math.max(totalScore, 0.1), // Minimum score for effort
        feedback: conceptScore > 50 ? 'Good understanding demonstrated' : 'Consider exploring the core concepts more deeply',
        conceptMatches,
        technicalDepth: techScore
      };
      
    } catch (error) {
      console.error('❌ Fast evaluation error:', error);
      return {
        score: 0.3, // Default passing score for errors
        feedback: 'Answer received and evaluated',
        error: true
      };
    }
  }

  /**
   * Get the next available parameter for assessment
   * FIXED: Only return parameters that have been NEWLY detected in code since last assessment
   */
  getNextAvailableParameter(session) {
    const { jobProfile, parameterProgress } = session;
    
    // First, check for parameters that have code detected and incomplete assessments
    for (let i = 0; i < jobProfile.parameters.length; i++) {
      const parameter = jobProfile.parameters[i];
      const paramKey = parameter.id !== undefined ? parameter.id : i;
      const progress = parameterProgress[paramKey];
      
      // Only proceed with parameters that:
      // 1. Have code detected AND
      // 2. Have incomplete assessment (< 3 questions) AND  
      // 3. Are not marked as completed AND
      // 4. Either: First parameter OR have been recently detected (not previously completed)
      if (progress && progress.codeDetected && 
          progress.questionsAsked.length < 3 && 
          progress.milestone !== 'completed') {
        
        // For the first parameter, always allow assessment
        if (paramKey === 0 || paramKey === 1) {
          return parameter;
        }
        
        // For subsequent parameters, only return if they were recently detected
        // (meaning new code was written that implements this parameter)
        const hasRecentDetection = !progress.questionsAsked.length || 
                                 progress.lastDetectedTimestamp > (session.lastParameterCompletedAt || 0);
        
        if (hasRecentDetection) {
          console.log(`🎯 LHIS: Found parameter ready for depth ${progress.questionsAsked.length + 1} question: ${paramKey}`);
          return parameter;
        } else {
          console.log(`⏭️ LHIS: Skipping ${parameter.name} - no new code detected since last completion`);
        }
      }
    }
    
    return null;
  }

  /**
   * Generate phase transition message
   */
  generatePhaseTransition(completedParameter, nextAction) {
    if (nextAction === 'next_parameter') {
      return `Great work on ${completedParameter}! Let's move on to the next phase of the problem.`;
    } else if (nextAction === 'assessment_complete') {
      return `Excellent! You've completed all parameter assessments. You can continue working on the implementation.`;
    }
    return `Continue with the next aspect of ${completedParameter}.`;
  }

  /**
   * Start engagement timer for parameter assessments only
   */
  startEngagementTimer(sessionId) {
    // Only parameter-specific depth questions should appear
    console.log(`🎯 LHIS: Engagement timer configured for session ${sessionId}`);
    return;
  }

  /**
   * Trigger proactive engagement (like a human interviewer)
   */
  async triggerProactiveEngagement(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const hasCode = Object.values(session.currentCode).some(code => code && code.length > 0);
    const timeSinceStart = Date.now() - new Date(session.assessmentSession.assessment_state.startTime).getTime();
    const minutesElapsed = Math.floor(timeSinceStart / 60000);
    const codeSnippet = hasCode ? Object.values(session.currentCode)[0]?.substring(0, 200) : '';

    console.log(`🤔 Proactive engagement triggered for session ${sessionId} (${minutesElapsed} minutes elapsed)`);

    // Increment engagement count
    session.engagementCount++;

    // Build context for AI-generated proactive message
    const contextPrompt = `
You are an experienced technical interviewer conducting a live coding assessment. The candidate has been working for ${minutesElapsed} minutes.

CONTEXT:
- Job: ${session.jobProfile.title}
- Problem: ${session.jobProfile.master_problem?.title || 'Coding challenge'}
- Time elapsed: ${minutesElapsed} minutes
- Code written: ${hasCode ? 'Yes, some progress made' : 'No code yet'}
- Current code preview: ${codeSnippet || 'No code written'}
- Previous engagements: ${session.engagementCount - 1}
- Last engagement: ${session.lastEngagementType || 'none'}

HUMAN INTERVIEWER GUIDELINES:
1. Be natural and conversational, not repetitive
2. Adapt your check-in based on their current situation
3. Don't ask the same thing twice
4. Be encouraging but professional
5. Provide different types of support based on context
6. Keep it concise (1-2 sentences)
7. Always offer actionable options

Generate a contextual check-in message that a real interviewer would say in this situation. Make it feel natural and appropriate for the current context.`;

    let engagementType = 'ai_generated_checkin';
    
    // Determine engagement type based on context
    if (!hasCode && minutesElapsed >= 3) {
      engagementType = 'initial_guidance';
    } else if (!hasCode && minutesElapsed >= 1) {
      engagementType = 'reading_check';
    } else if (hasCode && minutesElapsed >= 2) {
      engagementType = 'progress_check';
    } else {
      engagementType = 'general_checkin';
    }

    // Generate AI-powered engagement message
    let engagementMessage;
    try {
      engagementMessage = await this.generateContextualResponse(contextPrompt, 'proactive_check');
    } catch (error) {
      console.error('❌ AI engagement generation failed, using fallback');
      engagementMessage = this.getFallbackEngagementMessage(engagementType, hasCode, minutesElapsed);
    }

    // 🧵 Update conversation threading for engagement
    this.updateConversationThreading(sessionId, 'engagement', engagementMessage, {
      engagementType,
      minutesElapsed,
      hasCode
    });

    // 🧵 Enhance engagement with personality-aware touches
    const enhancedEngagementMessage = this.generatePersonalityAwareResponse(session, engagementMessage);

    // Update conversation history
    session.lastEngagementType = engagementType;
    session.conversationHistory.push({
      timestamp: new Date().toISOString(),
      type: 'proactive_engagement',
      message: enhancedEngagementMessage,
      engagementType
    });

    // Emit the proactive engagement
    return {
      type: engagementType,
      message: enhancedEngagementMessage || this.getFallbackEngagementMessage(engagementType, hasCode, minutesElapsed),
      timestamp: new Date().toISOString(),
      sessionId,
      options: ['I have a question', 'I\'m still working on it']
    };
  }

  /**
   * AI-generated fallback engagement messages
   */
  getFallbackEngagementMessage(engagementType, hasCode, minutesElapsed) {
    try {
      // Use AI service for fallback engagement messages
      const aiService = require('./aiService');
      
      // Build context for the AI based on engagement type
      let contextPrompt = "You are an AI interviewer helping a candidate with a coding problem. ";
      
      if (engagementType === 'initial_guidance' && !hasCode && minutesElapsed >= 3) {
        contextPrompt += `The candidate has been looking at the problem for ${minutesElapsed} minutes but hasn't started coding yet. Provide a gentle prompt to help them get started.`;
      } else if (engagementType === 'reading_check' && !hasCode) {
        contextPrompt += "The candidate is still reading the problem. Offer encouragement and support.";
      } else if (engagementType === 'progress_check' && hasCode) {
        contextPrompt += `The candidate has written some code and has been working for ${minutesElapsed} minutes. Check on their progress supportively.`;
      } else {
        contextPrompt += "Check in with the candidate to see how they're doing with the coding problem.";
      }
      
      // Make this async but don't wait for it - return a static response immediately
      // and update the session with AI response when it arrives
      this._getAsyncEngagementMessage(contextPrompt)
        .then(aiResponse => {
          if (aiResponse) {
            console.log('✅ Async AI engagement message received:', aiResponse.substring(0, 50) + '...');
            // Could store this in a cache or emit to socket if needed
          }
        })
        .catch(err => {
          console.error('❌ Async AI engagement message error:', err.message);
        });
      
      // Return static fallback immediately while AI is processing
      return this._getStaticEngagementMessage(engagementType, hasCode, minutesElapsed);
    } catch (error) {
      console.error('❌ Error setting up AI fallback engagement message:', error);
      return this._getStaticEngagementMessage(engagementType, hasCode, minutesElapsed);
    }
  }

  /**
   * Get async AI-generated engagement message
   */
  async _getAsyncEngagementMessage(contextPrompt) {
    try {
      const aiService = require('./aiService');
      
      const prompt = `${contextPrompt}

Generate a supportive message to engage with the candidate. Keep it conversational, encouraging, and under 2 sentences.`;

      const response = await aiService.performAIAnalysis(prompt);
      
      if (response && typeof response === 'string') {
        return response;
      } else if (response && response.reasoning) {
        return response.reasoning;
      } else if (response && response.response) {
        return response.response;
      } else {
        return null;
      }
    } catch (error) {
      console.error('❌ Async engagement message error:', error);
      return null;
    }
  }

  /**
   * Get static engagement message as immediate response
   */
  _getStaticEngagementMessage(engagementType, hasCode, minutesElapsed) {
    if (engagementType === 'initial_guidance' && !hasCode && minutesElapsed >= 3) {
      return `I notice you haven't started coding yet. Would you like me to help clarify the problem requirements or discuss the approach?`;
    } else if (engagementType === 'reading_check' && !hasCode) {
      return `Take your time understanding the problem. Feel free to ask questions about any part that's unclear.`;
    } else if (engagementType === 'progress_check' && hasCode) {
      return `I see you've made some progress! How are you feeling about the current approach?`;
    } else {
      return `How are things going? I'm here if you need any guidance or have questions.`;
    }
  }

  /**
   * Generate contextual response using AI (for LHIS)
   */
  async generateContextualResponse(contextPrompt, userResponse) {
    try {
      console.log('🧠 LHIS generating contextual response...');
      
      const prompt = `${contextPrompt}

USER RESPONSE: "${userResponse}"

Respond as a human interviewer would - be natural, helpful, and contextually appropriate. Keep it conversational and under 3 sentences.`;

      const response = await aiService.analyzeCode(userResponse, 'text', prompt);
      console.log('🔍 Raw LHIS response:', JSON.stringify(response, null, 2));
      
      // Extract the response text
      let responseText = '';
      if (typeof response === 'string') {
        responseText = response;
      } else if (response && response.question) {
        responseText = response.question;
      } else if (response && response.response) {
        responseText = response.response;
      } else if (response && response.analysis) {
        responseText = response.analysis;
      } else if (response) {
        // Try to extract any text from the response object
        responseText = JSON.stringify(response);
      }

      // Clean up the response
      responseText = responseText.trim();
      
      // TEMPORARY FIX: If AI module returns empty, use fallback
      if (!responseText || responseText.length < 5) {
        console.log('⚠️ AI response empty, using temporary fallback for LHIS');
        responseText = this.getTemporaryLHISFallback(contextPrompt, userResponse);
      }
      
      // Ensure it's conversational and not too formal
      if (responseText.length > 300) {
        responseText = responseText.substring(0, 300) + '...';
      }

      console.log('✅ LHIS response generated:', responseText);
      return responseText;

    } catch (error) {
      console.error('❌ LHIS contextual response generation failed:', error);
      console.log('🔄 Using emergency fallback for LHIS');
      return this.getTemporaryLHISFallback(contextPrompt, userResponse);
    }
  }

  /**
   * Temporary fallback for LHIS responses (to be removed when AI module is fixed)
   */
  getTemporaryLHISFallback(contextPrompt, userResponse) {
    // Analyze the context to provide appropriate responses
    const lowerPrompt = contextPrompt.toLowerCase();
    const lowerResponse = userResponse.toLowerCase();
    
    if (lowerResponse.includes('proactive_check')) {
      if (lowerPrompt.includes('0 minutes') || lowerPrompt.includes('just started')) {
        return "I see you've started implementing the Product service! How are you feeling about the AWS integration requirements so far?";
      } else if (lowerPrompt.includes('progress made')) {
        return "Nice progress on the product creation logic! I'd love to hear your thoughts on the DynamoDB integration approach.";
      } else {
        return "How's the coding going? I'm here if you'd like to discuss your approach or have any questions.";
      }
    }
    
    // Default fallback
    return "That's an interesting approach! Can you walk me through your thinking on this implementation?";
  }

  /**
   * Get current assessment status
   */
  getAssessmentStatus(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

      return {
      sessionId,
      jobProfile: session.jobProfile.title,
      parameterProgress: session.parameterProgress,
      awaitingAnswer: session.awaitingAnswer,
      overallProgress: this.calculateOverallProgress(session)
    };
  }

  /**
   * Calculate overall assessment progress
   */
  calculateOverallProgress(session) {
    const parameters = Object.values(session.parameterProgress);
    const completed = parameters.filter(p => p.milestone === 'completed').length;
    const failed = parameters.filter(p => p.milestone === 'failed').length;
    const inProgress = parameters.filter(p => p.codeDetected && p.milestone !== 'completed' && p.milestone !== 'failed').length;

    return {
      total: parameters.length,
      completed,
      failed,
      inProgress,
      percentage: Math.round((completed / parameters.length) * 100)
    };
  }

  /**
   * Check if parameter questions should be triggered and generate them quickly
   */
  async checkAndTriggerParameterQuestion(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.awaitingAnswer) {
      return; // Skip if already waiting for an answer
    }

    const { jobProfile, parameterProgress } = session;

    // Find the next parameter that needs a question
    for (let i = 0; i < jobProfile.parameters.length; i++) {
      const parameter = jobProfile.parameters[i];
      const paramKey = parameter.id !== undefined ? parameter.id : i;
      const progress = parameterProgress[paramKey];
      
      // Check if this parameter is ready for a question (including next depth questions)
      if (progress && progress.codeDetected && progress.questionsAsked.length < 3 && progress.milestone !== 'completed') {
        console.log(`🎯 LHIS: Triggering parameter question for ${parameter.name}`);
        
        // Generate and send the question (triggerParameterAssessment handles message sending)
        const questionData = await this.triggerParameterAssessment(sessionId, paramKey);
        
        if (questionData) {
          console.log(`✅ LHIS: Generated question for ${parameter.name} Depth ${questionData.depthLevel}`);
          return; // Only one question at a time
        } else {
          console.error(`❌ LHIS: Failed to generate question data for ${parameter.name}`);
        }
        
        return; // Only one question at a time
      }
    }
  }

  /**
   * Analyze candidate's implementation approach - Works with ANY programming language
   */
  analyzeImplementationApproach(code, parameter) {
    const codeUpper = code.toUpperCase();
    const codeLower = code.toLowerCase();
    
    // Multi-language pattern detection
    const analysis = {
      // Class/Object-oriented patterns
      usesClasses: /\b(class|struct|interface|object)\s+\w+/i.test(code),
      
      // Method/Function patterns
      usesMethods: /\b(public|private|protected|function|def|fn|method)\s+/i.test(code) ||
                  /\w+\s*\([^)]*\)\s*[{:]/g.test(code),
      
      // Variable/Data patterns
      usesVariables: /\b(var|let|const|string|int|float|double|boolean|auto)\s+/i.test(code) ||
                    /\w+\s*[=:]\s*[^=]/g.test(code),
      
      // Logic implementation
      implementsLogic: /\b(if|else|elif|for|while|switch|case|when|match)\b/i.test(code) ||
                      /\?\s*.*\s*:/g.test(code), // ternary operators
      
      // Data structures (multi-language)
      usesDataStructures: /\b(list|array|vector|map|dict|set|queue|stack|collection)\b/i.test(code) ||
                         /[\[\]{}]/g.test(code),
      
      // Error handling patterns
      hasErrorHandling: /\b(try|catch|except|finally|throw|raise|error|exception)\b/i.test(code),
      
      // Framework/Library usage
      usesFrameworks: /@\w+|import\s+|require\s*\(|#include|using\s+/i.test(code) ||
                     /\b(spring|react|angular|vue|django|flask|express)\b/i.test(code),
      
      // Documentation patterns
      hasDocumentation: /\/\*\*|\/\/|#|"""|'''|<!--/g.test(code),
      
      // Code complexity metrics
      linesOfCode: code.split('\n').filter(line => line.trim().length > 0).length,
      complexity: this.calculateComplexity(code),
      
      // Language detection
      language: this.detectLanguage(code),
      
      // Specific implementation patterns
      patterns: this.detectSpecificPatterns(code)
    };
    
    return analysis;
  }

  /**
   * Calculate code complexity score
   */
  calculateComplexity(code) {
    let complexity = 0;
    
    // Control flow complexity
    const controlFlow = code.match(/\b(if|else|elif|for|while|switch|case|when|match|try|catch)\b/gi);
    if (controlFlow) complexity += controlFlow.length;
    
    // Method/function definitions
    const methods = code.match(/\b(function|def|fn|public|private|protected)\s+\w+/gi);
    if (methods) complexity += methods.length;
    
    // Nested structures
    const openBraces = (code.match(/[{([]/g) || []).length;
    complexity += Math.floor(openBraces / 3); // Rough nesting estimate
    
    return Math.min(complexity, 20); // Cap at 20 for sanity
  }

  /**
   * Detect programming language from code patterns
   */
  detectLanguage(code) {
    // Java patterns
    if (/\b(public\s+class|private\s+\w+|@\w+|System\.out\.println)\b/i.test(code)) {
      return 'java';
    }
    
    // JavaScript/TypeScript patterns (modern syntax, imports/exports, TS types)
    if (/(\bimport\s+.+\s+from\s+['"])|(\bexport\s+(default|const|function|class))|=>|:\s*(string|number|boolean|any|unknown|never|void)\b|\binterface\s+\w+\b|\benum\s+\w+\b|\b(function\s+\w+|const\s+\w+|console\.log|require\s*\()\b/i.test(code)) {
      return 'javascript';
    }
    
    // Python patterns (incl. type hints, explicit from-import)
    if (/(\bdef\s+\w+\(.*\)\s*->\s*\w+\s*:)|\b(def\s+\w+\()|\b(from\s+\w+(?:\.\w+)*\s+import\s+\w+)\b|\bprint\s*\(|__\w+__\b/i.test(code)) {
      return 'python';
    }
    
    // C++ patterns
    if (/\b(#include|using\s+namespace|std::|cout\s*<<)\b/i.test(code)) {
      return 'cpp';
    }
    
    // C# patterns
    if (/\b(using\s+System|Console\.WriteLine|public\s+static\s+void)\b/i.test(code)) {
      return 'csharp';
    }
    
    // Go patterns
    if (/\b(package\s+main|func\s+\w+|fmt\.Println|import\s+\()\b/i.test(code)) {
      return 'go';
    }
    
    // Rust patterns
    if (/\b(fn\s+\w+|let\s+mut|println!|use\s+std::)\b/i.test(code)) {
      return 'rust';
    }
    
    return 'unknown';
  }

  /**
   * Detect specific implementation patterns regardless of language
   */
  detectSpecificPatterns(code) {
    const patterns = [];
    const lowerCode = code.toLowerCase();
    
    // API/Web patterns
    if (lowerCode.includes('api') || lowerCode.includes('http') || lowerCode.includes('rest')) {
      patterns.push('API Development');
    }
    
    // Database patterns
    if (lowerCode.includes('sql') || lowerCode.includes('database') || lowerCode.includes('select') || lowerCode.includes('insert')) {
      patterns.push('Database Operations');
    }
    
    // Framework patterns
    if (lowerCode.includes('spring') || lowerCode.includes('@') || lowerCode.includes('controller')) {
      patterns.push('Framework Usage');
    }
    
    return patterns;
  }

  // 🧵 CONVERSATION THREADING SYSTEM
  
  /**
   * Update conversation threading after each interaction
   */
  updateConversationThreading(sessionId, messageType, content, metadata = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    // 🔧 CRITICAL FIX: Ensure session shapes before accessing properties
    this.ensureSessionShapes(session);

    const { conversationThreads, conversationNarrative, topicProgression, candidatePersonality, conversationContext } = session;
    
    // Add to conversation narrative timeline
    const narrativeEntry = {
      timestamp: new Date().toISOString(),
      messageType, // 'question', 'answer', 'engagement'
      content: content.substring(0, 200), // Store preview
      fullLength: content.length,
      extractedTopics: this.extractTopicsFromMessage(content),
      mood: this.detectMessageMood(content),
      technicalDepth: this.analyzeTechnicalDepth(content),
      ...metadata
    };
    
    conversationNarrative.push(narrativeEntry);
    
    // Update conversation threads for each topic
    narrativeEntry.extractedTopics.forEach(topic => {
      if (!conversationThreads.has(topic)) {
        conversationThreads.set(topic, {
          firstMentioned: narrativeEntry.timestamp,
          mentions: [],
          depth: 'surface',
          candidateEngagement: 'neutral',
          relatedTopics: new Set()
        });
      }
      
      const thread = conversationThreads.get(topic);
      thread.mentions.push({
        timestamp: narrativeEntry.timestamp,
        messageType,
        context: content.substring(0, 100)
      });
      
      // Update thread depth and engagement
      if (narrativeEntry.technicalDepth > thread.depth) {
        thread.depth = narrativeEntry.technicalDepth;
      }
      
      // Track recent mentions for natural callbacks
      conversationContext.recentMentions.set(topic, narrativeEntry.timestamp);
    });
    
    // Update candidate personality analysis
    this.updateCandidatePersonality(session, messageType, content, narrativeEntry);
    
    // Update conversation context
    this.updateConversationContext(session, narrativeEntry);
    
    // Clean old recent mentions (older than 10 minutes)
    this.cleanOldMentions(conversationContext.recentMentions);
    
    console.log(`🧵 Threading updated: ${narrativeEntry.extractedTopics.length} topics, ${conversationThreads.size} total threads`);
  }

  /**
   * Extract topics and themes from message content
   */
  extractTopicsFromMessage(content) {
    const topics = new Set();
    const lowerContent = content.toLowerCase();
    
    // Technical topics
    const technicalKeywords = [
      'java', 'spring', 'api', 'database', 'sql', 'rest', 'json', 'xml',
      'authentication', 'security', 'validation', 'exception', 'error handling',
      'performance', 'optimization', 'caching', 'logging', 'testing',
      'microservices', 'docker', 'aws', 'cloud', 'deployment'
    ];
    
    technicalKeywords.forEach(keyword => {
      if (lowerContent.includes(keyword)) {
        topics.add(keyword);
      }
    });
    
    // Conversation themes
    if (lowerContent.includes('understand') || lowerContent.includes('explain')) {
      topics.add('understanding');
    }
    if (lowerContent.includes('implement') || lowerContent.includes('code')) {
      topics.add('implementation');
    }
    if (lowerContent.includes('best practice') || lowerContent.includes('optimize')) {
      topics.add('best_practices');
    }
    if (lowerContent.includes('challenge') || lowerContent.includes('difficult')) {
      topics.add('challenges');
    }
    
    return Array.from(topics);
  }

  /**
   * Detect emotional tone/mood of message
   */
  detectMessageMood(content) {
    const lowerContent = content.toLowerCase();
    
    // Positive indicators
    if (lowerContent.includes('good') || lowerContent.includes('great') || 
        lowerContent.includes('excellent') || lowerContent.includes('perfect')) {
      return 'positive';
    }
    
    // Uncertain indicators
    if (lowerContent.includes('not sure') || lowerContent.includes('maybe') || 
        lowerContent.includes('think') || lowerContent.includes('might')) {
      return 'uncertain';
    }
    
    // Confident indicators
    if (lowerContent.includes('definitely') || lowerContent.includes('exactly') || 
        lowerContent.includes('clearly') || lowerContent.includes('obviously')) {
      return 'confident';
    }
    
    return 'neutral';
  }

  /**
   * Analyze technical depth of content
   */
  analyzeTechnicalDepth(content) {
    const lowerContent = content.toLowerCase();
    let depth = 0;
    
    // Surface level indicators
    if (lowerContent.includes('basic') || lowerContent.includes('simple')) {
      depth += 1;
    }
    
    // Intermediate indicators
    if (lowerContent.includes('implement') || lowerContent.includes('configure') ||
        lowerContent.includes('setup') || lowerContent.includes('integration')) {
      depth += 2;
    }
    
    // Advanced indicators
    if (lowerContent.includes('optimization') || lowerContent.includes('performance') ||
        lowerContent.includes('architecture') || lowerContent.includes('scalability')) {
      depth += 3;
    }
    
    // Expert indicators
    if (lowerContent.includes('internals') || lowerContent.includes('low-level') ||
        lowerContent.includes('algorithm') || lowerContent.includes('complexity')) {
      depth += 4;
    }
    
    return Math.min(depth, 4); // Cap at expert level
  }

  /**
   * Update candidate personality profile based on communication patterns
   */
  updateCandidatePersonality(session, messageType, content, narrativeEntry) {
    const { candidatePersonality } = session;
    
    if (messageType === 'answer') {
      // Analyze communication style
      if (content.length > 200) {
        candidatePersonality.communicationStyle = 'detailed';
      } else if (content.length < 50) {
        candidatePersonality.communicationStyle = 'concise';
      }
      
      // Track technical depth preference
      if (narrativeEntry.technicalDepth >= 3) {
        candidatePersonality.technicalDepth = 'deep';
      } else if (narrativeEntry.technicalDepth >= 2) {
        candidatePersonality.technicalDepth = 'intermediate';
      }
      
      // Track interests and concerns
      if (narrativeEntry.mood === 'positive') {
        narrativeEntry.extractedTopics.forEach(topic => 
          candidatePersonality.interests.add(topic)
        );
      } else if (narrativeEntry.mood === 'uncertain') {
        narrativeEntry.extractedTopics.forEach(topic => 
          candidatePersonality.concerns.add(topic)
        );
      }
      
      // Track response patterns
      candidatePersonality.responsePatterns.push({
        length: content.length,
        mood: narrativeEntry.mood,
        technicalDepth: narrativeEntry.technicalDepth,
        timestamp: narrativeEntry.timestamp
      });
      
      // Keep only last 10 patterns
      if (candidatePersonality.responsePatterns.length > 10) {
        candidatePersonality.responsePatterns = candidatePersonality.responsePatterns.slice(-10);
      }
    }
  }

  /**
   * Update conversation context and phase
   */
  updateConversationContext(session, narrativeEntry) {
    const { conversationContext, conversationNarrative } = session;
    
    // Update current main topic
    if (narrativeEntry.extractedTopics.length > 0) {
      conversationContext.currentMainTopic = narrativeEntry.extractedTopics[0];
    }
    
    // Update session phase based on conversation progression
    const totalInteractions = conversationNarrative.length;
    if (totalInteractions <= 3) {
      conversationContext.sessionPhase = 'introduction';
    } else if (totalInteractions <= 10) {
      conversationContext.sessionPhase = 'exploration';
    } else if (totalInteractions <= 20) {
      conversationContext.sessionPhase = 'deep_dive';
    } else {
      conversationContext.sessionPhase = 'conclusion';
    }
    
    // Update conversation mood based on recent interactions
    const recentMoods = conversationNarrative.slice(-3).map(entry => entry.mood);
    if (recentMoods.includes('uncertain')) {
      conversationContext.conversationMood = 'supportive';
    } else if (recentMoods.includes('confident')) {
      conversationContext.conversationMood = 'challenging';
    } else {
      conversationContext.conversationMood = 'encouraging';
    }
  }

  /**
   * Clean old mentions from recent mentions map
   */
  cleanOldMentions(recentMentions) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    for (const [topic, timestamp] of recentMentions.entries()) {
      if (timestamp < tenMinutesAgo) {
        recentMentions.delete(topic);
      }
    }
  }

  /**
   * Generate natural conversation callbacks using threading data
   */
  generateConversationCallback(session, currentTopic) {
    const { conversationThreads, conversationNarrative, conversationContext } = session;
    
    // Find related topics mentioned earlier
    const relatedThreads = Array.from(conversationThreads.entries())
      .filter(([topic, thread]) => 
        topic !== currentTopic && 
        thread.mentions.length > 0 &&
        this.isTopicRelated(currentTopic, topic)
      )
      .sort((a, b) => b[1].mentions.length - a[1].mentions.length); // Sort by mention frequency
    
    if (relatedThreads.length === 0) return null;
    
    const [relatedTopic, relatedThread] = relatedThreads[0];
    const timeSinceLastMention = this.getTimeSinceLastMention(relatedThread);
    
    // Generate natural callback based on relationship and timing
    const callbacks = [
      `Earlier you mentioned ${relatedTopic}, which relates nicely to what we're discussing now with ${currentTopic}.`,
      `This builds on what you shared about ${relatedTopic} before.`,
      `I'm seeing a connection between your ${relatedTopic} approach and this ${currentTopic} implementation.`,
      `Your understanding of ${relatedTopic} that you demonstrated earlier is really helping here.`
    ];
    
    return callbacks[Math.floor(Math.random() * callbacks.length)];
  }

  /**
   * Check if two topics are conceptually related
   */
  isTopicRelated(topic1, topic2) {
    const relations = {
      'java': ['spring', 'api', 'performance'],
      'spring': ['java', 'api', 'rest'],
      'api': ['rest', 'json', 'security'],
      'database': ['sql', 'performance', 'optimization'],
      'security': ['authentication', 'api', 'validation'],
      'performance': ['optimization', 'caching', 'database']
    };
    
    return relations[topic1]?.includes(topic2) || relations[topic2]?.includes(topic1);
  }

  /**
   * Get time since last mention of a topic
   */
  getTimeSinceLastMention(thread) {
    if (thread.mentions.length === 0) return null;
    
    const lastMention = thread.mentions[thread.mentions.length - 1].timestamp;
    return (new Date() - new Date(lastMention)) / (1000 * 60); // Minutes
  }

  /**
   * Generate personality-aware response based on threading data
   */
  generatePersonalityAwareResponse(session, baseMessage) {
    const { candidatePersonality, conversationContext } = session;
    
    let enhancedMessage = baseMessage;
    
    // Adapt to communication style - professional but human tone
    if (candidatePersonality.communicationStyle === 'detailed') {
      enhancedMessage += " Can you walk me through your reasoning in detail?";
    } else if (candidatePersonality.communicationStyle === 'concise') {
      enhancedMessage += " A high-level overview would be helpful.";
    }
    
    // Adapt to technical depth
    if (candidatePersonality.technicalDepth === 'deep') {
      enhancedMessage += " Let's explore the technical implementation.";
    } else if (candidatePersonality.technicalDepth === 'surface') {
      enhancedMessage += " Let's focus on the core concepts.";
    }
    
    // Add encouragement based on conversation mood - professional tone
    if (conversationContext.conversationMood === 'supportive') {
      enhancedMessage += " Take a moment to think through this.";
    } else if (conversationContext.conversationMood === 'encouraging') {
      enhancedMessage += " You're on the right track.";
    }
    
    return enhancedMessage;
  }

  /**
   * Update assessment progress in database
   */
  async updateAssessmentProgress(sessionId, parameterId, analysisResult) {
    try {
      const { data, error } = await this.supabase
        .from('assessment_sessions')
        .update({
          code_progress: {
            [`parameter_${parameterId}`]: {
              milestone: analysisResult.milestone,
              confidence: analysisResult.confidence,
              detectedImplementations: analysisResult.detectedImplementations,
              timestamp: new Date().toISOString()
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);

      if (error) {
        console.error('❌ Failed to update assessment progress:', error);
      }
    } catch (error) {
      console.error('❌ Database update error:', error);
    }
  }

  /**
   * Update parameter score in database
   */
  async updateParameterScore(sessionId, parameterId, depthLevel, score) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return;

      const currentScores = session.assessmentSession.parameter_scores || {};
      if (!currentScores[`parameter_${parameterId}`]) {
        currentScores[`parameter_${parameterId}`] = {};
      }
      currentScores[`parameter_${parameterId}`][`depth_${depthLevel}`] = score;

      const { error } = await this.supabase
        .from('assessment_sessions')
        .update({
          parameter_scores: currentScores,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);

      if (error) {
        console.error('❌ Failed to update parameter score:', error);
      }
    } catch (error) {
      console.error('❌ Database update error:', error);
    }
  }

  /**
   * Build approach-specific prompts based on detected patterns
   * @param {number} currentDepth - Question depth level (0, 1, 2)
   * @param {Object} detectedApproach - Detected approach from ApproachDetector
   * @param {Object} detectedProblem - Detected problem from ProblemDetector
   * @param {string} candidateCode - Candidate's code
   * @param {string} approachesContext - Context from stored solutions
   * @returns {string} Specific prompt for AI
   */
  buildApproachSpecificPrompt(currentDepth, detectedApproach, detectedProblem, candidateCode, approachesContext) {
    const approachType = detectedApproach.type || 'unknown';
    const problemType = detectedProblem.problemType || 'general_coding';
    const confidence = detectedApproach.confidence || 0;
    
    console.log(`🎯 LHIS: Building prompt for ${approachType} approach on ${problemType} problem`);
    
    let specificPrompt = '';
    
    if (currentDepth === 0) { // Approach & Logic Assessment
      specificPrompt = `
APPROACH-SPECIFIC ANALYSIS REQUIRED:
Detected Approach: ${approachType} (${(confidence * 100).toFixed(1)}% confidence)
Problem Type: ${problemType}
Code Characteristics: ${JSON.stringify(detectedApproach.details?.characteristics || [])}

GENERATE A SPECIFIC QUESTION THAT:
1. Explicitly mentions the candidate's detected approach (e.g., "I see you used ${approachType}...")
2. Asks WHY they chose this specific approach over alternatives
3. References actual code patterns they implemented
4. Sounds like a curious senior developer, not generic

EXAMPLES OF GOOD APPROACH-SPECIFIC QUESTIONS:
- "I notice you implemented this using recursive calls. What led you to choose recursion over an iterative approach here?"
- "You went with Express.js for this API. What factors influenced your decision over alternatives like Fastify or Koa?"
- "I see you're using React Hooks instead of class components. What advantages do you see for this specific use case?"

YOUR TASK: Generate a similar question that specifically addresses their ${approachType} approach for ${problemType}.
Make it conversational and technical, like a code review discussion.
`;
    } else if (currentDepth === 1) { // Trade-offs & Alternatives
      specificPrompt = `
TRADE-OFFS & ALTERNATIVES ANALYSIS:
Current Approach: ${approachType}
Problem Domain: ${problemType}
${approachesContext}

GENERATE A QUESTION THAT:
1. Acknowledges their approach has benefits
2. Probes about specific trade-offs and limitations
3. References alternative approaches from the context above
4. Asks about scenarios where alternatives might be better
5. Sounds like discussing real engineering decisions

EXAMPLES OF GOOD TRADE-OFF QUESTIONS:
- "Your recursive solution is clean and readable, but what about the trade-offs? How would an iterative approach compare in terms of memory usage and stack overflow risks?"
- "Express gives you flexibility, but what about performance? In what scenarios might you choose Fastify's speed over Express's ecosystem?"
- "Hooks provide great reusability, but they can be tricky to optimize. When might class components still be the better choice?"

YOUR TASK: Generate a question that explores the trade-offs of ${approachType} vs alternatives for ${problemType}.
Be specific about technical trade-offs, not generic pros/cons.
`;
    } else { // What-if Scenarios & Adaptability
      specificPrompt = `
REAL-WORLD SCALING & BUSINESS SCENARIOS:
Current Approach: ${approachType}
Problem Domain: ${problemType}
Technical Characteristics: ${JSON.stringify(detectedApproach.details?.complexity || 'Unknown complexity')}

GENERATE A WHAT-IF SCENARIO QUESTION THAT:
1. Presents a realistic business/technical challenge
2. Tests how their approach would handle scale, change, or constraints
3. Mentions specific technical concerns (performance, concurrency, maintainability)
4. Sounds like discussing production requirements with a senior engineer

EXAMPLES OF GOOD SCALING QUESTIONS:
- "Imagine this BST is used in a database index processing millions of insertions per day. How would your recursive approach handle that load? What modifications would you make?"
- "If this API needs to handle 10,000 requests per second in production, how would your Express setup perform? What would you change?"
- "In a large enterprise React app with complex state requirements, how would you evolve beyond basic hooks? What patterns would you introduce?"

YOUR TASK: Create a realistic scenario where ${approachType} for ${problemType} faces production challenges.
Ask how they would adapt their approach. Be specific about scale/constraints.
`;
    }
    
    return specificPrompt;
  }

  /**
   * 🧠 AI-GENERATED DEPTH QUESTIONS
   * Generate contextual depth questions on-the-fly using LHIS AI analysis
   * Now with dynamic approach detection and comparison!
   */
  async generateAIDepthQuestion(parameter, currentDepth, session) {
    console.log(`🚀 LHIS: generateAIDepthQuestion called - START`);
    console.log(`   Parameter: ${parameter?.name || 'unknown'}`);
    console.log(`   Depth: ${currentDepth}`);
    console.log(`   Session ID: ${session?.sessionId || 'unknown'}`);
    
    try {
      const sessionId = session.sessionId || 'unknown';
      
      // PREVENT CONCURRENT AI ANALYSIS
      if (this.aiAnalysisLocks.has(sessionId)) {
        console.log(`🔒 LHIS: AI analysis already in progress for session ${sessionId}, using fallback`);
        return this.generateIntelligentFallbackQuestion(parameter, currentDepth, session);
      }
      
      // Set lock
      this.aiAnalysisLocks.set(sessionId, Date.now());
      
      try {
        // 🔧 CRITICAL FIX: Get the actual submitted code from stored session data
        // Always use the LATEST code to ensure questions match current implementation
        let candidateCode = '';
        
        if (session.currentCode) {
          // Priority: latest (most recent), then main, then master-problem, then any available
          candidateCode = session.currentCode['latest'] || 
                         session.currentCode['main'] || 
                         session.currentCode['master-problem'] || 
                         (Object.keys(session.currentCode).length > 0 ? 
                          session.currentCode[Object.keys(session.currentCode)[0]] : '') || '';
        }
        
        console.log(`🔍 LHIS: Code sources available:`, Object.keys(session.currentCode || {}));
        console.log(`🔍 LHIS: Using code length: ${candidateCode.length}`);
        
        if (candidateCode.length > 0) {
          console.log(`🔍 LHIS: Code preview: ${candidateCode.substring(0, 150)}...`);
          
          // ✅ VALIDATION: Check if code matches expected approach
          // This helps catch mismatches between code and questions
          const codeLower = candidateCode.toLowerCase();
          const hasSQL = codeLower.includes('sql') || codeLower.includes('select') || codeLower.includes('insert') || codeLower.includes('orm');
          const hasStack = codeLower.includes('stack') || (codeLower.includes('push') && codeLower.includes('pop') && codeLower.includes('peek'));
          const hasQueue = codeLower.includes('queue') || (codeLower.includes('enqueue') && codeLower.includes('dequeue'));
          const hasTree = codeLower.includes('tree') || codeLower.includes('treenode') || codeLower.includes('bst');
          
          if (hasSQL && !hasStack && !hasQueue && !hasTree) {
            console.log(`✅ LHIS: Code appears to be SQL/database-related`);
          } else if (hasStack) {
            console.log(`✅ LHIS: Code appears to be Stack implementation - questions should be Stack-related`);
          } else if (hasQueue) {
            console.log(`✅ LHIS: Code appears to be Queue implementation`);
          } else if (hasTree) {
            console.log(`✅ LHIS: Code appears to be Tree/BST implementation`);
          }
        } else {
          console.log(`❌ LHIS: NO CODE AVAILABLE - This will cause generic questions!`);
        }
        
        // 🎯 DYNAMIC APPROACH & PROBLEM DETECTION
        console.log(`🔍 LHIS: Starting dynamic approach detection...`);
        
        let detectedApproach, detectedProblem;
        
        // UNIVERSAL APPROACH DETECTION - Works for all languages
        detectedApproach = this.detectApproachUniversal(candidateCode, session.language);
        detectedProblem = this.detectProblemUniversal(candidateCode, session.language);
        
        // Update session with detected information
        session.detectedApproach = detectedApproach;
        session.detectedProblemType = detectedProblem;
        session.currentProblemId = detectedProblem.problemId;
        
        console.log(`🔍 LHIS: Dynamic Detection Results:`);
        console.log(`   Approach: ${detectedApproach.type} (${(detectedApproach.confidence * 100).toFixed(1)}%)`);
        console.log(`   Problem: ${detectedProblem.problemType} (ID: ${detectedProblem.problemId})`);
        console.log(`   Category: ${detectedProblem.category}`);
        
        // Update parameter progress
        if (session.parameterProgress && session.parameterProgress['0']) {
          session.parameterProgress['0'].approachDetected = ApproachDetector.isValidApproach(detectedApproach);
          session.parameterProgress['0'].codeDetected = candidateCode.length > 100;
        }
        
        // 🎯 STRUCTURED 3-QUESTION ASSESSMENT FRAMEWORK
        const depthLabels = [
          'Approach & Logic Assessment',      // Q1: Why this approach? What's your thinking?
          'Trade-offs & Alternatives',        // Q2: Why this not that? What are the trade-offs?
          'What-if Scenarios & Adaptability'  // Q3: How would approach change if...?
        ];
        const currentDepthLabel = depthLabels[currentDepth] || `Depth ${currentDepth + 1}`;
        
        // Build comprehensive context for AI question generation
        // Enrich with stored approaches for comparative questioning (non-breaking if unavailable)
        let approachesContext = '';
        try {
          const ProblemSolutionsService = require('./problemSolutionsService');
          const { buildApproachComparisonContext } = require('./approachPromptUtil');
          
          // Use dynamically detected problem ID
          const problemId = detectedProblem.problemId;
          
          if (problemId && problemId !== 99) { // 99 is general_coding fallback
            console.log(`🔍 LHIS: Fetching solutions for detected problem ID: ${problemId}`);
            const approaches = await ProblemSolutionsService.fetchActiveApproachesByProblemId(problemId);
            if (approaches && approaches.length > 0) {
              console.log(`✅ LHIS: Found ${approaches.length} stored solutions for comparison`);
              approaches.forEach(a => console.log(`   - ${a.approach_key}: ${a.title}`));
              approachesContext = '\nCOMPARATIVE APPROACH CONTEXT:\n' + buildApproachComparisonContext(approaches, candidateCode, session.language || 'text') + '\n';
              
              // Mark solutions as compared
              if (session.parameterProgress && session.parameterProgress['0']) {
                session.parameterProgress['0'].solutionsCompared = true;
              }
            } else {
              console.log(`⚠️ LHIS: No solutions found for problem ID ${problemId}`);
            }
          } else {
            console.log(`⚠️ LHIS: Using general coding approach - no specific solutions available`);
          }
        } catch (e) {
          console.log('⚠️ LHIS: Unable to enrich prompt with approaches (non-breaking):', e.message);
        }

        // Build approach-specific prompt based on detection results
        const specificPrompt = this.buildApproachSpecificPrompt(currentDepth, detectedApproach, detectedProblem, candidateCode, approachesContext);
        
        // Provide a minimal comparative fallback even when approaches are unavailable
        if (!approachesContext) {
          approachesContext = '\nCOMPARATIVE APPROACH CONTEXT:\n- No stored approaches available.\n- Critically compare current approach against at least two plausible alternatives for this parameter.\n- Discuss trade-offs (time/space complexity, readability, maintainability, extensibility).\n';
        }

        // 🎯 Generate approach-specific question using dynamic detection results
        const questionPrompt = specificPrompt;

        console.log(`🔍 LHIS: Requesting AI depth question generation with approach-specific prompt...`);
        const aiService = require('./aiService');
        const aiResponse = await aiService.analyzeCode(
          candidateCode,
          session.language || 'java',
          questionPrompt
        );

        if (!aiResponse) {
          console.log(`❌ LHIS: No AI response received, using intelligent fallback`);
          return this.generateIntelligentFallbackQuestion(parameter, currentDepth, session);
        }
        
        console.log(`🔍 LHIS: Raw AI response for depth question:`, typeof aiResponse, 
          typeof aiResponse === 'string' ? aiResponse.substring(0, 200) : JSON.stringify(aiResponse).substring(0, 200));
        
        // Parse AI response - handle different formats
        let parsedResponse;
        try {
          // Handle different AI response formats
          let responseText = '';
          
          if (typeof aiResponse === 'string') {
            responseText = aiResponse;
          } else if (aiResponse && aiResponse.question && aiResponse.question.trim().length > 0) {
            // AI module returned question directly
            responseText = aiResponse.question;
          } else if (aiResponse && aiResponse.response) {
            responseText = aiResponse.response;
          } else if (aiResponse && aiResponse.type === 'error') {
            // AI module returned error - throw to trigger fallback
            console.log(`⚠️ LHIS: AI module returned error response:`, {
              error: aiResponse.error,
              type: aiResponse.type,
              context_preview: aiResponse.context ? aiResponse.context.substring(0, 100) + '...' : 'No context'
            });
            throw new Error(`AI module error: ${aiResponse.error || 'Unknown error'}`);
          } else {
            responseText = JSON.stringify(aiResponse);
          }
          
          console.log(`🔍 LHIS: Processing response text:`, responseText.substring(0, 100));
          
          // If responseText is empty or invalid, use fallback
          if (!responseText || responseText.length < 10) {
            throw new Error('Invalid or empty response text');
          }
          
          // Try to parse as JSON first
          const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            parsedResponse = JSON.parse(jsonMatch[1]);
          } else {
            // Try parsing the whole response as JSON
            try {
              parsedResponse = JSON.parse(responseText);
            } catch {
              // If not JSON, treat as direct question text
              let cleanQuestion = responseText.replace(/^["']|["']$/g, ''); // Remove outer quotes
              cleanQuestion = cleanQuestion.replace(/^"|"$/g, ''); // Remove double quotes
              cleanQuestion = cleanQuestion.trim();
              
              parsedResponse = {
                question: cleanQuestion,
                expected_concepts: ["technical understanding", "implementation details", "best practices"],
                assessment_criteria: ["technical accuracy", "depth of explanation", "practical application"]
              };
            }
          }
        } catch (parseError) {
          console.log(`⚠️ LHIS: All parsing failed, using fallback extraction`);
          parsedResponse = {
            question: this.extractQuestionFromResponse(aiResponse.toString(), parameter.name, currentDepthLabel),
            expected_concepts: ["technical understanding", "implementation details", "best practices"],
            assessment_criteria: ["technical accuracy", "depth of explanation", "practical application"]
          };
        }
        
        // Validate response structure
        if (!parsedResponse.question || typeof parsedResponse.question !== 'string') {
          throw new Error('AI response missing valid question');
        }
        
        console.log(`✅ LHIS: AI depth question generated successfully`);
        
        return {
          question: parsedResponse.question,
          correct_answer: `Comprehensive understanding of ${parameter.description} with focus on ${parsedResponse.expected_concepts?.join(', ') || 'technical concepts'}`,
          assessment_criteria: parsedResponse.assessment_criteria || ["technical understanding", "implementation quality", "best practices knowledge"],
          ai_generated: true,
          depth_level: currentDepth + 1,
          generated_at: new Date().toISOString()
        };
        
      } finally {
        // Always remove lock
        this.aiAnalysisLocks.delete(sessionId);
      }
      
    } catch (error) {
      // Remove lock on error
      const sessionId = session.sessionId || 'unknown';
      this.aiAnalysisLocks.delete(sessionId);
      
      console.error(`❌ LHIS: AI depth question generation failed:`, error.message);
      
      // Intelligent fallback based on parameter and depth
      return this.generateIntelligentFallbackQuestion(parameter, currentDepth, session);
    }
  }

  /**
   * 🎯 BUILD STRUCTURED QUESTION PROMPT FOR SPECIFIC DEPTH LEVELS
   * Ensures we get exactly the 3 types of questions needed for comprehensive assessment
   */
  buildStructuredQuestionPrompt(parameter, currentDepth, currentDepthLabel, candidateCode, session, approachesContext) {
    const baseContext = `You are a technical interviewer. Generate a high-quality assessment question.

INTERVIEW CONTEXT:
- Parameter: ${parameter.name}
- Assessment Depth: ${currentDepthLabel} (Level ${currentDepth + 1}/3)

CANDIDATE'S CURRENT CODE:
\`\`\`${session.language || 'java'}
${candidateCode}
\`\`\`

${approachesContext}`;

    switch (currentDepth) {
      case 0: // Q1: APPROACH & LOGIC ASSESSMENT
        return `${baseContext}

🎯 QUESTION TYPE: APPROACH & LOGIC ASSESSMENT
Generate a conversational question that explores their THINKING and APPROACH:

FOCUS ON:
- WHY they chose this specific approach/algorithm
- WHAT was their thought process and reasoning
- HOW they broke down the problem mentally
- Their overall problem-solving methodology

EXAMPLE QUESTION STARTERS:
- "I see you went with [specific approach]. Walk me through your thinking..."
- "What made you choose this approach over..."
- "Can you explain your problem-solving process here..."
- "I'm curious about your logic - why did you decide to..."

Make it sound natural and curious about their mental approach. Reference their actual code.`;

      case 1: // Q2: TRADE-OFFS & ALTERNATIVES  
        return `${baseContext}

🎯 QUESTION TYPE: TRADE-OFFS & ALTERNATIVES
Generate a conversational question that explores ALTERNATIVES and TRADE-OFFS:

FOCUS ON:
- WHY this approach instead of other viable options
- WHAT are the trade-offs (time/space complexity, readability, maintainability)
- Alternative approaches they considered or could have used
- Pros and cons of their chosen vs alternative solutions

EXAMPLE QUESTION STARTERS:
- "This approach has [benefit], but what about [alternative]? What made you choose..."
- "I could see doing this with [alternative approach]. What are the trade-offs..."
- "Why this over a [different approach]? What would be the pros and cons..."
- "What other ways could you solve this, and why didn't you go that route..."

Focus on comparative analysis and decision-making rationale. Be specific about alternatives.`;

      case 2: // Q3: WHAT-IF SCENARIOS & ADAPTABILITY
        return `${baseContext}

🎯 QUESTION TYPE: WHAT-IF SCENARIOS & ADAPTABILITY  
Generate a conversational question that explores ADAPTABILITY and SCENARIOS:

FOCUS ON:
- HOW their approach would change under different constraints
- WHAT IF the requirements changed (scale, performance, etc.)
- How adaptable and extensible their solution is
- Real-world scenarios and edge cases

EXAMPLE QUESTION STARTERS:
- "What if we had [different constraint/requirement]? How would your approach change..."
- "If this needed to handle [scale/performance requirement], what would you modify..."
- "How would you adapt this if [scenario change]..."
- "What happens in your solution when [edge case/real-world scenario]..."

Focus on flexibility, scalability, and real-world application. Test their ability to adapt.`;

      default:
        return `${baseContext}

Generate a conversational technical question that explores deep understanding and practical application.`;
    }
  }

  /**
   * Get depth level guidelines for AI question generation (DEPRECATED - replaced by buildStructuredQuestionPrompt)
   */
  getDepthLevelGuidelines(currentDepth) {
    switch (currentDepth) {
      case 0: // Depth 1 - Approach & Logic Assessment
        return `Approach & Logic Assessment: Test conceptual knowledge, design decisions, and overall approach. Questions should explore WHY they chose this approach and HOW it fits the requirements.`;
      
      case 1: // Depth 2 - Trade-offs & Alternatives  
        return `Trade-offs & Alternatives: Dive into alternative approaches, comparative analysis, and decision rationale. Questions should explore WHAT other approaches exist and WHY they chose this specific one.`;
      
      case 2: // Depth 3 - What-if Scenarios & Adaptability
        return `What-if Scenarios & Adaptability: Focus on adaptability, scalability, and real-world application. Questions should explore HOW the approach would change under different constraints and scenarios.`;
      
      default:
        return `Advanced technical assessment focusing on deep understanding and practical application.`;
    }
  }

  /**
   * Extract question from raw AI response when JSON parsing fails
   */
  extractQuestionFromResponse(response, parameterName, depthLabel) {
    // Look for question-like patterns in the response
    const questionPatterns = [
      /(?:question['":]?\s*['":]?\s*)['"](.*?)['"]/i,
      /(?:Q:|Question:)\s*(.*?)(?:\n|$)/i,
      /(.*\?)/,  // Any sentence ending with ?
    ];
    
    for (const pattern of questionPatterns) {
      const match = response.match(pattern);
      if (match && match[1] && match[1].trim().length > 20) {
        return match[1].trim();
      }
    }
    
    // Ultimate fallback
    return `Looking at your current implementation of ${parameterName.toLowerCase()}, can you explain your approach and the key technical decisions you made for this ${depthLabel.toLowerCase()} aspect?`;
  }

  /**
   * Generate intelligent fallback when AI fails - Updated for 3-Question Structure
   */
  generateIntelligentFallbackQuestion(parameter, currentDepth, session) {
    console.log(`🔄 LHIS: Generating approach-aware fallback question for depth ${currentDepth}`);
    
    const candidateCode = session.currentCode['master-problem'] || session.currentCode['main'] || '';
    const paramName = parameter.name.toLowerCase();
    const codeUsed = candidateCode && candidateCode.length > 0
      ? candidateCode
      : (Object.values(session.currentCode || {}).reduce((longest, src) => {
          if (typeof src === 'string' && src.length > (longest?.length || 0)) return src;
          return longest;
        }, '') || '');
    const hasCode = (codeUsed && codeUsed.length > 200);
    
    console.log(`🔍 LHIS: Fallback - Code length: ${candidateCode.length}, hasCode: ${hasCode}`);
    console.log(`🔍 LHIS: Fallback - Detected approach: ${session.detectedApproach?.type || 'none'}`);
    console.log(`🔍 LHIS: Fallback - Detected problem: ${session.detectedProblemType?.problemType || 'none'}`);
    
    // Try to use approach-specific templates if available
    let QuestionTemplates;
    try {
      QuestionTemplates = require('./question-templates');
      console.log(`✅ LHIS: QuestionTemplates loaded successfully`);
    } catch (templateError) {
      console.error(`❌ LHIS: Error loading QuestionTemplates:`, templateError.message);
      QuestionTemplates = null;
    }
    
    const detectedApproach = session.detectedApproach;
    const detectedProblem = session.detectedProblemType;
    
    // Heuristic approach type if detection failed
    const effectiveApproachType = (() => {
      if (detectedApproach?.type && detectedApproach.type !== 'unknown') return detectedApproach.type;
      const codeLower = (codeUsed || '').toLowerCase();
      if (codeLower.includes('const express') || codeLower.includes('express()') || codeLower.includes('app.get(') || codeLower.includes('router.get(')) {
        return 'express_basic';
      }
      if (codeLower.includes('usestate(') || codeLower.includes('useeffect(') || codeLower.includes('react')) {
        return 'react_hooks';
      }
      if ((/class\s+treenode/.test(codeLower) && codeLower.includes('left') && codeLower.includes('right')) ||
          codeLower.includes('this.insert(') || codeLower.includes('this.insertnode') || codeLower.includes('binarysearchtree') || codeLower.includes('bst')) {
        return 'recursive_bst';
      }
      return 'unknown';
    })();
    
    let selectedQuestion = '';
    
    const approachTypeForTemplates = (detectedApproach?.type && detectedApproach.type !== 'unknown') ? detectedApproach.type : effectiveApproachType;
    if (QuestionTemplates && approachTypeForTemplates !== 'unknown' && QuestionTemplates.hasTemplatesForApproach(approachTypeForTemplates)) {
      console.log(`✅ LHIS: Using approach-specific template for ${approachTypeForTemplates}`);
      
      const context = {
        problemType: detectedProblem?.problemType,
        language: session.language,
        framework: this.extractFramework(codeUsed)
      };
      
      selectedQuestion = QuestionTemplates.getContextualizedQuestion(
        approachTypeForTemplates,
        currentDepth, 
        context
      );
      
      console.log(`✅ LHIS: Generated approach-specific question: "${selectedQuestion.substring(0, 50)}..."`);
    } else {
      console.log(`⚠️ LHIS: No approach-specific template available, using generic fallback`);
      console.log(`   detectedApproach: ${detectedApproach?.type || 'null'} (effective: ${approachTypeForTemplates})`);
      console.log(`   QuestionTemplates: ${QuestionTemplates ? 'loaded' : 'null'}`);
      console.log(`   hasTemplates(effective): ${QuestionTemplates ? QuestionTemplates.hasTemplatesForApproach(approachTypeForTemplates) : 'N/A'}`);
      
      // Enhanced fallback questions when no specific approach detected
      const depthQuestions = [
        // Q1: Approach & Logic Assessment
        hasCode 
          ? `I see ${approachTypeForTemplates !== 'unknown' ? `you used a ${approachTypeForTemplates.replace('_', ' ')} approach` : 'clear structural patterns in your code'}. Why this approach over a common alternative, and where in your code does that choice show up?`
          : `Can you explain your approach to implementing ${paramName} and what was your thought process behind this solution strategy?`,
        
        // Q2: Trade-offs & Alternatives
        hasCode
          ? `Looking at your ${paramName} implementation, what other approaches could you have taken, and what are the trade-offs of your chosen method versus those alternatives?`
          : `What alternative approaches did you consider for ${paramName}, and why did you decide against them? What are the main trade-offs?`,
        
        // Q3: What-if Scenarios & Adaptability
        hasCode
          ? `If the requirements for your ${paramName} solution changed - say we needed it to handle 10x the scale or different constraints - how would you adapt your approach?`
          : `What if the requirements for ${paramName} changed significantly - different scale, performance needs, or constraints - how would your approach need to evolve?`
      ];
      
      selectedQuestion = depthQuestions[currentDepth] || depthQuestions[0];
    }
    
    const questionTypes = [
      'Approach & Logic Assessment',
      'Trade-offs & Alternatives', 
      'What-if Scenarios & Adaptability'
    ];
    
    return {
      question: selectedQuestion,
      correct_answer: `Demonstrates solid understanding of ${parameter.description} with focus on ${questionTypes[currentDepth] || 'technical concepts'}`,
      assessment_criteria: ["technical understanding", "comparative analysis", "adaptability"],
      ai_generated: false,
      fallback_used: true,
      approach_specific: detectedApproach?.type || 'generic',
      depth_level: currentDepth + 1,
      question_type: questionTypes[currentDepth] || 'General Assessment'
    };
  }

  /**
   * Extract framework information from code for better contextualization
   * @param {string} code - Candidate code
   * @returns {string} Detected framework or empty string
   */
  extractFramework(code) {
    if (!code) return '';
    
    const codeNormalized = code.toLowerCase();
    
    if (codeNormalized.includes('spring') || codeNormalized.includes('@restcontroller')) return 'Spring Boot';
    if (codeNormalized.includes('express') || codeNormalized.includes('app.get')) return 'Express.js';
    if (codeNormalized.includes('fastify')) return 'Fastify';
    if (codeNormalized.includes('react') || codeNormalized.includes('usestate')) return 'React';
    if (codeNormalized.includes('vue') || codeNormalized.includes('ref(')) return 'Vue.js';
    if (codeNormalized.includes('prisma')) return 'Prisma';
    if (codeNormalized.includes('sequelize')) return 'Sequelize';
    
    return '';
  }

  /**
   * 🎯 CHECK 3-QUESTION ASSESSMENT COMPLETION STATUS
   * Provides detailed feedback on question progression for debugging and monitoring
   */
  getAssessmentCompletionStatus(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const { parameterProgress } = session;
    const assessmentStatus = {
      sessionId,
      totalParameters: Object.keys(parameterProgress).length,
      completedParameters: 0,
      parametersInProgress: 0,
      parametersNotStarted: 0,
      totalQuestionsAsked: 0,
      maxPossibleQuestions: Object.keys(parameterProgress).length * 3,
      parameterDetails: {}
    };

    for (const [parameterId, progress] of Object.entries(parameterProgress)) {
      const questionsAsked = progress.questionsAsked.length;
      const isComplete = questionsAsked >= 3;
      const isInProgress = questionsAsked > 0 && questionsAsked < 3;
      const isNotStarted = questionsAsked === 0;

      assessmentStatus.totalQuestionsAsked += questionsAsked;
      
      if (isComplete) assessmentStatus.completedParameters++;
      else if (isInProgress) assessmentStatus.parametersInProgress++;
      else if (isNotStarted) assessmentStatus.parametersNotStarted++;

      assessmentStatus.parameterDetails[parameterId] = {
        questionsAsked,
        isComplete,
        isInProgress,
        isNotStarted,
        codeDetected: progress.codeDetected,
        milestone: progress.milestone,
        nextQuestionType: questionsAsked < 3 ? [
          'Approach & Logic Assessment',
          'Trade-offs & Alternatives', 
          'What-if Scenarios & Adaptability'
        ][questionsAsked] : 'Assessment Complete'
      };
    }

    assessmentStatus.overallCompletionPercentage = Math.round(
      (assessmentStatus.totalQuestionsAsked / assessmentStatus.maxPossibleQuestions) * 100
    );

    return assessmentStatus;
  }

  /**
   * 🎯 LOG ASSESSMENT PROGRESS FOR DEBUGGING
   */
  logAssessmentProgress(sessionId) {
    const status = this.getAssessmentCompletionStatus(sessionId);
    if (status.error) {
      console.log(`❌ LHIS Assessment Status: ${status.error}`);
      return;
    }

    console.log(`📊 LHIS Assessment Progress for ${sessionId}:`);
    console.log(`   Overall: ${status.totalQuestionsAsked}/${status.maxPossibleQuestions} questions (${status.overallCompletionPercentage}%)`);
    console.log(`   Parameters: ${status.completedParameters} complete, ${status.parametersInProgress} in progress, ${status.parametersNotStarted} not started`);
    
    for (const [parameterId, details] of Object.entries(status.parameterDetails)) {
      const statusIcon = details.isComplete ? '✅' : details.isInProgress ? '🔄' : '⏳';
      console.log(`   ${statusIcon} Parameter ${parameterId}: ${details.questionsAsked}/3 questions - Next: ${details.nextQuestionType}`);
    }
  }

  /**
   * Generate dynamic depth transition response based on candidate's answer
   */
  generateDynamicDepthResponse(candidateAnswer, parameter, currentDepth) {
    const answer = candidateAnswer.toLowerCase();
    const parameterName = parameter.name;
    
    // Analyze answer quality and tone
    const isDetailed = candidateAnswer.length > 100;
    const isConfident = answer.includes('definitely') || answer.includes('exactly') || answer.includes('clearly');
    const isTechnical = answer.includes('implement') || answer.includes('architecture') || answer.includes('pattern');
    const showsUncertainty = answer.includes('think') || answer.includes('maybe') || answer.includes('not sure');
    
    // Generate contextual responses
    const responses = {
      confident_detailed: [
        "Excellent analysis! Let's dive deeper into the technical details.",
        "Great explanation! Now let's explore the implementation specifics.",
        "Perfect! Let's look at the more advanced aspects of this.",
        "Solid understanding! Time to tackle the next layer."
      ],
      confident_brief: [
        "Good grasp! Let's expand on that concept.",
        "Nice! Let's dig into the details now.",
        "Exactly! Let's explore this further.",
        "Right track! Let's go deeper."
      ],
      technical_focus: [
        "Strong technical insight! Let's examine the implementation side.",
        "Good technical thinking! Now for the practical details.",
        "I like your technical approach! Let's build on that.",
        "Solid technical foundation! Let's advance to specifics."
      ],
      uncertain_supportive: [
        "You're on the right path! Let's work through the details together.",
        "Good start! Let's explore this concept step by step.",
        "You're thinking correctly! Let's build on that understanding.",
        "That's a good direction! Let's develop it further."
      ],
      general_positive: [
        "Good! Let's explore the next dimension of this.",
        "Nice work! Ready for the next level?",
        "Well done! Let's advance to the next stage.",
        "Great! Time to tackle the next aspect."
      ]
    };
    
    // Select appropriate response category
    let selectedResponses;
    if (showsUncertainty) {
      selectedResponses = responses.uncertain_supportive;
    } else if (isConfident && isDetailed) {
      selectedResponses = responses.confident_detailed;
    } else if (isConfident) {
      selectedResponses = responses.confident_brief;
    } else if (isTechnical) {
      selectedResponses = responses.technical_focus;
    } else {
      selectedResponses = responses.general_positive;
    }
    
    // Return random response from selected category
    return selectedResponses[Math.floor(Math.random() * selectedResponses.length)];
  }

  /**
   * Generate dynamic parameter completion response
   */
  generateDynamicParameterCompletion(completedParameter, session) {
    const parameterName = completedParameter;
    const { conversationNarrative, candidatePersonality } = session;
    
    // Analyze overall performance on this parameter
    const parameterAnswers = conversationNarrative.filter(entry => 
      entry.messageType === 'answer' && entry.parameterName === parameterName
    );
    
    const wasConfident = candidatePersonality.communicationStyle === 'confident';
    const wasDetailed = candidatePersonality.communicationStyle === 'detailed';
    const hasTechnicalDepth = candidatePersonality.technicalDepth === 'deep';
    
    // Generate contextual completion messages
    const responses = {
      strong_performance: [
        `Excellent work on ${parameterName}! Your technical depth really shows.`,
        `Outstanding! You've demonstrated solid mastery of ${parameterName}.`,
        `Impressive understanding of ${parameterName}! Well executed.`,
        `Great job! Your ${parameterName} knowledge is clearly strong.`
      ],
      good_effort: [
        `Good work on ${parameterName}! You've covered the key concepts well.`,
        `Nice progress through ${parameterName}! Solid understanding shown.`,
        `Well done on ${parameterName}! You've grasped the important aspects.`,
        `Good job working through ${parameterName}! Clear thinking demonstrated.`
      ],
      encouraging: [
        `${parameterName} complete! You've made good progress.`,
        `Finished ${parameterName}! You're building good momentum.`,
        `${parameterName} wrapped up! You're working through this systematically.`,
        `Done with ${parameterName}! You're tackling this well.`
      ]
    };
    
    // Select response based on performance indicators
    let selectedResponses;
    if (wasConfident && hasTechnicalDepth) {
      selectedResponses = responses.strong_performance;
    } else if (wasDetailed || hasTechnicalDepth) {
      selectedResponses = responses.good_effort;
    } else {
      selectedResponses = responses.encouraging;
    }
    
    return selectedResponses[Math.floor(Math.random() * selectedResponses.length)];
  }

  /**
   * Generate natural question starters that avoid repetitive patterns
   */
  generateNaturalQuestionStarter(parameter, candidateCode, currentDepth) {
    const hasCode = candidateCode.length > 200;
    const paramName = parameter.name;
    
    // Analyze code context for natural starters
    const codeContext = {
      hasClasses: candidateCode.includes('class'),
      hasFunctions: candidateCode.includes('function') || candidateCode.includes('def'),
      hasVariables: candidateCode.includes('=') && candidateCode.includes('var'),
      hasImports: candidateCode.includes('import') || candidateCode.includes('require'),
      hasComments: candidateCode.includes('//') || candidateCode.includes('#'),
      recentCode: candidateCode.substring(Math.max(0, candidateCode.length - 100))
    };
    
    // Natural conversation starters that feel human
    const starters = {
      observation_based: [
        hasCode && codeContext.hasClasses ? "I notice you're building some classes here" : null,
        hasCode && codeContext.hasFunctions ? "I see you're working with functions" : null,
        hasCode && codeContext.hasImports ? "Looking at your imports and setup" : null,
        hasCode ? "Seeing your implementation take shape" : null,
        hasCode ? "I can see your approach developing" : null
      ].filter(Boolean),
      
      direct_inquiry: [
        "Tell me about your thinking on this",
        "Help me understand your approach here",
        "What's your strategy for this part",
        "How are you handling this aspect",
        "What's driving your design choices"
      ],
      
      collaborative: [
        "Let's talk about this section",
        "I'm curious about your approach to this",
        "Walk me through your thinking here",
        "Let's explore this part together",
        "Help me follow your logic on this"
      ],
      
      contextual: [
        `For the ${paramName.split(' ')[0]} part`,
        `Thinking about ${paramName.toLowerCase()}`,
        `Regarding your ${paramName.toLowerCase()} approach`,
        `On the ${paramName.toLowerCase()} side`,
        `Looking at ${paramName.toLowerCase()}`
      ]
    };
    
    // Select starter based on context and depth
    let selectedStarters;
    if (hasCode && currentDepth === 0) {
      selectedStarters = starters.observation_based.length > 0 ? starters.observation_based : starters.collaborative;
    } else if (currentDepth === 1) {
      selectedStarters = starters.direct_inquiry;
    } else {
      selectedStarters = starters.contextual;
    }
    
    return selectedStarters[Math.floor(Math.random() * selectedStarters.length)];
  }

  /**
   * Generate dynamic assessment completion message
   */
  generateDynamicAssessmentCompletion(session) {
    const { candidatePersonality, conversationNarrative, parameterProgress } = session;
    
    // Analyze overall session performance
    const totalAnswers = conversationNarrative.filter(entry => entry.messageType === 'answer').length;
    const strongAnswers = conversationNarrative.filter(entry => 
      entry.messageType === 'answer' && entry.technicalDepth >= 3
    ).length;
    
    const completedParams = Object.values(parameterProgress).filter(p => p.milestone === 'completed').length;
    const totalParams = Object.keys(parameterProgress).length;
    
    const strongPerformance = (strongAnswers / Math.max(totalAnswers, 1)) > 0.6;
    const allCompleted = completedParams === totalParams;
    const wasConfident = candidatePersonality.communicationStyle === 'confident';
    
    // Dynamic completion messages
    const responses = {
      excellent: [
        "Outstanding work! You've demonstrated excellent technical understanding across all areas.",
        "Exceptional performance! Your knowledge and problem-solving skills really shine through.",
        "Impressive! You've shown deep technical competency throughout this assessment.",
        "Excellent work! Your technical approach and reasoning have been consistently strong."
      ],
      strong: [
        "Great job! You've shown solid technical knowledge and good problem-solving approach.",
        "Well done! You've demonstrated good understanding across the technical parameters.",
        "Nice work! Your technical thinking and implementation approach are on point.",
        "Good work! You've tackled the assessment with solid technical reasoning."
      ],
      encouraging: [
        "Good work! You've covered all the key areas and shown your technical thinking process.",
        "Well done! You've worked through the assessment systematically and thoughtfully.",
        "Nice effort! You've demonstrated your approach to technical problem-solving.",
        "Good job! You've shown how you think through technical challenges."
      ]
    };
    
    // Select response based on performance
    let selectedResponses;
    if (strongPerformance && allCompleted && wasConfident) {
      selectedResponses = responses.excellent;
    } else if (strongPerformance || (allCompleted && totalAnswers > 6)) {
      selectedResponses = responses.strong;
    } else {
      selectedResponses = responses.encouraging;
    }
    
    return selectedResponses[Math.floor(Math.random() * selectedResponses.length)];
  }

  /**
   * Generate dynamic, personal welcome message that varies across sessions
   */
  generatePersonalWelcomeMessage(jobProfile, candidateId, language) {
    const jobType = jobProfile.title;
    const timeOfDay = this.getTimeOfDay();
    const sessionVariation = this.getSessionVariation();
    
    // Personal, tech-focused welcome messages
    const welcomeTemplates = [
      // Casual but professional
      {
        intro: `Hey there! ${timeOfDay}`,
        identity: `I'm here to walk through this ${jobType} challenge with you.`,
        approach: `${sessionVariation.approach} Feel free to think out loud as you work - I'm curious about your thought process.`,
        closer: `${sessionVariation.closer}`
      },
      {
        intro: `${timeOfDay}!`,
        identity: `Ready to dive into some ${jobType} problem-solving?`,
        approach: `${sessionVariation.approach} I'll be following along and might ask questions about your approach as we go.`,
        closer: `${sessionVariation.closer}`
      },
      {
        intro: `${timeOfDay}!`,
        identity: `I'm your technical interviewer for today's ${jobType} session.`,
        approach: `${sessionVariation.approach} Don't worry about getting everything perfect - I'm more interested in how you think through problems.`,
        closer: `${sessionVariation.closer}`
      },
      {
        intro: `Hey!`,
        identity: `Looking forward to seeing how you tackle this ${jobType} challenge.`,
        approach: `${sessionVariation.approach} Take your time to understand the problem, and feel free to ask clarifying questions.`,
        closer: `${sessionVariation.closer}`
      }
    ];
    
    // Select a template based on session hash to ensure variety
    const templateIndex = this.getSessionHash(candidateId) % welcomeTemplates.length;
    const template = welcomeTemplates[templateIndex];
    
    return `${template.intro} ${template.identity} ${template.approach} ${template.closer}`;
  }

  /**
   * Get time-appropriate greeting
   */
  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }

  /**
   * Get session-specific variations
   */
  getSessionVariation() {
    const variations = [
      {
        approach: "I like to see how candidates approach problems from first principles.",
        closer: "Let's see what you've got!"
      },
      {
        approach: "I'm particularly interested in your design decisions and trade-offs.",
        closer: "Ready when you are!"
      },
      {
        approach: "I'll be watching for both your technical skills and problem-solving process.",
        closer: "Take it step by step."
      },
      {
        approach: "I find it helpful when candidates explain their reasoning as they go.",
        closer: "No rush - quality over speed!"
      },
      {
        approach: "I'm curious to see your coding style and architectural thinking.",
        closer: "Let's build something good together."
      }
    ];
    
    const today = new Date().toDateString();
    const variationIndex = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % variations.length;
    return variations[variationIndex];
  }

  /**
   * Generate consistent hash for session variety
   */
  getSessionHash(candidateId) {
    const str = candidateId + new Date().toDateString();
    return str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  }
}

module.exports = new LivingAIInterviewer(); 