const { createClient } = require('@supabase/supabase-js');
const aiService = require('./aiService');
const timingConfig = require('../config/timingConfig');
const supabaseConfig = require('../config/supabase');
const { parameterDetectionConfig } = require('../config/lhis-detection-rules'); // Import config
const loggingConfig = require('../config/loggingConfig');

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
          masterProblem: jobProfile.master_problem?.description || jobProfile.master_problem
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
    if (!session || !code || code.trim().length < parameterDetectionConfig.codeThresholds.minimumCharacters) {
      return false; // Not enough code for analysis
    }

    const { jobProfile, parameterProgress } = session;
    let newParameterDetected = false;

    console.log(`🔍 LHIS: Analyzing ${code.length} chars for parameter detection`);
    console.log(`📊 LHIS: Available parameters: ${jobProfile.parameters?.length || 0}`);
    
    if (jobProfile.parameters) {
      jobProfile.parameters.forEach((param, index) => {
        console.log(`   Parameter ${index + 1}: ${param.name} (ID: ${param.id})`);
      });
    }

    // SEQUENTIAL ANALYSIS: Check parameters in order, one at a time
    // This prevents AI conflicts and ensures correct parameter detection
    for (let i = 0; i < (jobProfile.parameters || []).length; i++) {
      const parameter = jobProfile.parameters[i];
      const paramKey = parameter.id !== undefined ? parameter.id : i;
      const progress = parameterProgress[paramKey];
      
      console.log(`🔍 LHIS: Checking parameter ${parameter.name} (Key: ${paramKey})`);
      console.log(`   Progress: codeDetected=${progress?.codeDetected}, questionsAsked=${progress?.questionsAsked?.length || 0}`);
      console.log(`   Awaiting answer for: ${session.awaitingAnswer?.parameterId || 'none'}`);
      
      // Skip if parameter already has questions or is being processed
      if (progress?.codeDetected || session.awaitingAnswer?.parameterId == paramKey) {
        console.log(`   ⏭️ LHIS: Skipping ${parameter.name} - already detected or awaiting answer`);
        continue;
      }

      // Skip if parameter is already completed
      if (progress?.milestone === 'completed') {
        console.log(`   ⏭️ LHIS: Skipping ${parameter.name} - already completed`);
        continue;
      }

      // Skip if parameter has already asked all 3 questions
      if (progress?.questionsAsked && progress.questionsAsked.length >= 3) {
        console.log(`   ⏭️ LHIS: Skipping ${parameter.name} - all questions asked`);
        continue;
      }

      // FLEXIBLE CHECK: Allow analyzing any undetected parameter
      // This enables proper multi-parameter code analysis (e.g., AWS + DynamoDB code)
      const isParameterUndetected = !parameterProgress[paramKey]?.codeDetected && 
                                   parameterProgress[paramKey]?.milestone !== 'completed';
      
      if (!isParameterUndetected) {
        console.log(`   ⏭️ LHIS: Skipping ${parameter.name} - already detected or completed`);
        continue;
      }

      // Use AI detection - trust the LLM to correctly identify parameters
      console.log(`   🔍 LHIS: Running AI detection for ${parameter.name}`);
      const isImplemented = await this.fastParameterDetection(code, parameter, language);
      
      if (isImplemented) {
        console.log(`✅ LHIS: Parameter ${parameter.name} detected in code`);
        progress.codeDetected = true;
        progress.detectedAt = new Date().toISOString();
        progress.lastDetectedTimestamp = Date.now(); // Track detection time for transition logic
        newParameterDetected = true;
        
        // STOP after detecting one parameter to prevent conflicts
        break;
      } else {
        console.log(`   ❌ LHIS: Parameter ${parameter.name} not detected yet`);
      }
      
      // Continue to next parameter if this one wasn't detected
      // Only stop if we find a match to prevent conflicts
    }

    console.log(`📝 LHIS: Analysis complete. New parameter detected: ${newParameterDetected}`);
    return newParameterDetected;
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
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.log(`❌ LHIS: No session found for ${sessionId}`);
      return null;
    }

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

    if (!parameter || !progress.codeDetected) {
      console.log(`❌ LHIS: Parameter ${parameterKey} not found or not detected`);
      return null;
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

    console.log(`🎯 LHIS: Triggering ${parameter.name} - Depth ${parameterKey}.${currentDepth + 1}`);

    // Mark as awaiting answer
    session.awaitingAnswer = {
      parameterId: parameterKey,
      depthLevel: currentDepth,
      question: depthQuestion,
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
    let threadingStatus = 'active'; // 'active', 'error', 'offline'
    let hasThreading = conversationCallback || session.conversationThreads?.size > 0;
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
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.awaitingAnswer) {
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
    const passed = evaluation.score >= 0.3;
    
    // Store the result
    const progress = session.parameterProgress[parameterId];
    progress.questionsAsked.push({
      depthLevel,
      question: question.question,
      candidateAnswer: answer,
      correctAnswer: question.correct_answer,
      score: evaluation.score,
      passed,
      feedback: evaluation.feedback,
      timestamp: new Date().toISOString()
    });

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
        progress.milestone = 'completed';
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
        progress.milestone = 'failed';
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
      
      // Length and effort scoring
      const lengthScore = Math.min((candidateAnswer.length / 50) * 20, 20);
      
      // Technical keyword scoring
      const technicalWords = ['implement', 'design', 'architecture', 'pattern', 'service', 'data', 'security', 'performance'];
      const techScore = technicalWords.filter(word => answerLower.includes(word)).length * 5;
      
      const totalScore = Math.min((conceptScore + lengthScore + techScore) / 100, 1);
      
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
    
    // Python patterns
    if (/\b(def\s+\w+|import\s+\w+|print\s*\(|__\w+__)\b/i.test(code)) {
      return 'python';
    }
    
    // JavaScript patterns
    if (/\b(function\s+\w+|const\s+\w+|console\.log|=>|require\s*\()\b/i.test(code)) {
      return 'javascript';
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
   * 🧠 AI-GENERATED DEPTH QUESTIONS
   * Generate contextual depth questions on-the-fly using LHIS AI analysis
   * No database storage needed - pure AI intelligence!
   */
  async generateAIDepthQuestion(parameter, currentDepth, session) {
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
        const candidateCode = session.currentCode['master-problem'] || session.currentCode['main'] || '';
        const depthLabels = ['Foundation & Understanding', 'Implementation & Details', 'Optimization & Best Practices'];
        const currentDepthLabel = depthLabels[currentDepth] || `Depth ${currentDepth + 1}`;
        
        // Build comprehensive context for AI question generation
        const questionPrompt = `You are an expert technical interviewer conducting a live coding assessment. 

INTERVIEW CONTEXT:
- Parameter: ${parameter.name}
- Parameter Description: ${parameter.description}
- Assessment Depth: ${currentDepthLabel} (Level ${currentDepth + 1}/3)
- Session Language: ${session.language || 'java'}

CANDIDATE'S CURRENT CODE:
\`\`\`${session.language || 'java'}
${candidateCode}
\`\`\`

DEPTH LEVEL GUIDELINES:
${this.getDepthLevelGuidelines(currentDepth)}

TASK: Generate a high-quality assessment question that:
1. References the candidate's actual code implementation
2. Tests understanding at the ${currentDepthLabel} level
3. Is specific to ${parameter.name}
4. Sounds natural and conversational
5. Encourages detailed technical explanation

Respond with this exact JSON format:
{
  "question": "Your contextual interview question here",
  "expected_concepts": ["concept1", "concept2", "concept3"],
  "assessment_criteria": ["criteria1", "criteria2", "criteria3"]
}

Make the question intelligent, contextual, and worthy of a senior technical interview.`;

        console.log(`🔍 LHIS: Requesting AI depth question generation...`);
        const aiService = require('./aiService');
        
        // Add timeout and retry logic for AI depth questions
        let aiResponse;
        try {
          aiResponse = await Promise.race([
            aiService.performAIAnalysis(questionPrompt),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('AI question generation timeout')), 8000) // 8 second timeout
            )
          ]);
        } catch (timeoutError) {
          console.log(`⏰ LHIS: AI question generation timed out, using intelligent fallback`);
          return this.generateIntelligentFallbackQuestion(parameter, currentDepth, session);
        }
        
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
              parsedResponse = {
                question: responseText.replace(/^["']|["']$/g, ''), // Remove quotes
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
   * Get depth level guidelines for AI question generation
   */
  getDepthLevelGuidelines(currentDepth) {
    switch (currentDepth) {
      case 0: // Depth 1 - Foundation & Understanding
        return `Foundation & Understanding: Test conceptual knowledge, design decisions, and overall approach. Questions should explore WHY they chose this approach and HOW it fits the requirements.`;
      
      case 1: // Depth 2 - Implementation & Details  
        return `Implementation & Details: Dive into technical specifics, error handling, edge cases, and implementation patterns. Questions should explore WHAT specific techniques they're using and HOW they handle complexities.`;
      
      case 2: // Depth 3 - Optimization & Best Practices
        return `Optimization & Best Practices: Focus on production readiness, performance, scalability, and advanced patterns. Questions should explore optimization strategies, monitoring, and enterprise-level concerns.`;
      
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
   * Generate intelligent fallback when AI fails
   */
  generateIntelligentFallbackQuestion(parameter, currentDepth, session) {
    const candidateCode = session.currentCode['master-problem'] || session.currentCode['main'] || '';
    const hasCode = candidateCode.length > 200;
    const paramName = parameter.name.toLowerCase();
    
    const depthQuestions = [
      // Depth 1 - Foundation & Understanding
      hasCode 
        ? `I can see you're implementing ${paramName}. Can you walk me through your overall approach and explain the key design decisions you've made?`
        : `Can you explain your approach to implementing ${paramName} and what key considerations are guiding your design decisions?`,
      
      // Depth 2 - Implementation & Details
      hasCode
        ? `Looking at your ${paramName} implementation, how are you handling the technical complexities and what specific patterns are you using to ensure robustness?`
        : `What specific technical challenges do you anticipate with ${paramName} and how would you address implementation details like error handling and edge cases?`,
      
      // Depth 3 - Optimization & Best Practices
      hasCode
        ? `Thinking about production readiness for your ${paramName} solution, what optimization strategies would you implement and how would you monitor performance at scale?`
        : `How would you optimize ${paramName} for production use, and what advanced patterns would you consider for scalability and performance monitoring?`
    ];
    
    return {
      question: depthQuestions[currentDepth] || depthQuestions[0],
      correct_answer: `Demonstrates solid understanding of ${parameter.description}`,
      assessment_criteria: ["technical understanding", "practical application", "depth of knowledge"],
      ai_generated: false,
      fallback_used: true,
      depth_level: currentDepth + 1
    };
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