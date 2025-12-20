const livingAIInterviewer = require('../services/living-ai-interviewer');
const { parameterDetectionConfig } = require('../config/lhis-detection-rules'); // Import config

class AssessmentSocketHandler {
  constructor(io) {
    this.io = io;
    this.lastAnalysisTime = new Map(); // Track last analysis time per session to prevent rapid calls
    this.lastCodeSnapshot = new Map(); // Track last analyzed code for each session
    
    // Pass socket IO instance to LHIS so it can emit contextual responses
    livingAIInterviewer.setSocketIO(io);
    
    this.setupLHISHandlers();
    this.startQuestionTimer(); // Start periodic question checking
  }

  setupLHISHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 LHIS Assessment socket connected: ${socket.id}`);

      // LHIS - Initialize assessment
      socket.on('initializeAssessment', async (data) => {
        try {
          const { sessionId, candidateId, jobProfileId } = data;
          
          console.log(`🎯 LHIS: Initializing assessment for session ${sessionId}`);
          
          const result = await livingAIInterviewer.initializeAssessment(
            sessionId, 
            candidateId, 
            jobProfileId, 
            'java', 
            '5+ Years'
          );

          if (result.success) {
            // Send complete assessment data including master problem
            socket.emit('assessmentInitialized', {
              success: true,
              sessionId,
              jobProfile: result.jobProfile, // Contains title, description, parameters, masterProblem
              assessmentCriteria: result.assessmentCriteria,
              initialMessage: result.initialMessage
            });
            
            console.log(`✅ LHIS: Assessment initialized with master problem for session ${sessionId}`);
          } else {
            socket.emit('assessmentError', { error: 'Failed to initialize assessment' });
          }

        } catch (error) {
          console.error('❌ LHIS: Assessment initialization error:', error);
          socket.emit('assessmentError', { error: 'Assessment initialization failed' });
        }
      });

      // LHIS - Join assessment room
      socket.on('joinAssessmentRoom', async (data) => {
        try {
          const { sessionId, candidateId, role = 'candidate' } = data;
          
          console.log(`👥 LHIS: ${role} joining assessment room: ${sessionId}`);
          console.log(`🔍 LHIS: joinAssessmentRoom data:`, JSON.stringify(data));
          
          socket.join(`assessment-${sessionId}`);
          socket.assessmentSessionId = sessionId;
          socket.assessmentRole = role;

          socket.emit('assessmentRoomJoined', {
            sessionId,
            role,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          console.error('❌ LHIS: Error joining assessment room:', error);
          socket.emit('assessmentError', { error: 'Failed to join assessment room' });
        }
      });

      // LHIS - Code change monitoring (handles both codeChange and assessmentCodeChange)
      const handleCodeChange = async (data) => {
        try {
          const { sessionId, questionId, code, language } = data;
          
          if (!sessionId || !code || code.trim().length < parameterDetectionConfig.codeThresholds.minimumCharacters) {
            return; // Skip analysis for short code
          }

          // THROTTLING: Prevent rapid AI analysis calls (minimum 3 seconds between calls)
          const now = Date.now();
          const lastAnalysis = this.lastAnalysisTime.get(sessionId) || 0;
          const timeSinceLastAnalysis = now - lastAnalysis;
          
          // SMART THROTTLING: Allow analysis for meaningful code changes, throttle rapid typing
          const isSignificantChange = this.isSignificantCodeChange(code, sessionId);
          const minInterval = isSignificantChange ? 1500 : 4000; // 1.5s for significant, 4s for minor changes
          
          if (timeSinceLastAnalysis < minInterval) {
            console.log(`⏱️ LHIS: Smart throttling for session ${sessionId} (${timeSinceLastAnalysis}ms since last, need ${minInterval}ms) - Significant: ${isSignificantChange}`);
            return;
          }
          
          this.lastAnalysisTime.set(sessionId, now);
          console.log(`📝 LHIS: Code change detected (${code.length} chars)`);

          // CONSOLIDATED FLOW: Analyze code and immediately check for questions
          // This prevents duplicate AI module calls
          const parameterDetected = await livingAIInterviewer.analyzeCodeProgress(
            sessionId, 
            questionId || 'main', 
            code, 
            language || 'java'
          );

          // Always check for questions after code analysis to ensure flow continues
          console.log(`🎯 LHIS: Code analysis complete, checking for questions`);
          await this.checkForParameterQuestion(sessionId);

        } catch (error) {
          console.error('❌ LHIS: Code change error:', error);
        }
      };

      // Register both event handlers to the same function
      socket.on('assessmentCodeChange', handleCodeChange);
      socket.on('codeChange', async (data) => {
        // Convert codeChange format to assessmentCodeChange format
        const convertedData = {
          sessionId: data.roomName || data.sessionId,
          questionId: data.questionId || 'main',
          code: data.code,
          language: data.language
        };
        console.log(`🔄 LHIS: Converting codeChange to assessmentCodeChange for ${convertedData.sessionId}`);
        await handleCodeChange(convertedData);
      });

      // LHIS - Submit parameter answer
      socket.on('submitParameterAnswer', async (data) => {
        try {
          const { sessionId, answer, parameterId, depthLevel } = data;
          
          console.log(`💬 LHIS: Processing parameter answer for session ${sessionId}`);
          console.log(`💬 LHIS: Full data received:`, JSON.stringify(data, null, 2));
          
          // Check if session exists - if not, create it
          let session = livingAIInterviewer.activeSessions.get(sessionId);
          console.log(`💬 LHIS: Session exists:`, !!session);
          
          if (!session) {
            console.log(`⚠️ LHIS: Session not found, creating parameter session for ${sessionId}`);
            const result = await livingAIInterviewer.initializeParameterAssessment(
              sessionId,
              'socket-user',
              'python',
              'mid'
            );
            
            if (result.success) {
              session = livingAIInterviewer.activeSessions.get(sessionId);
              console.log(`✅ LHIS: Session created successfully`);
            } else {
              console.error(`❌ LHIS: Failed to create session:`, result.error);
              socket.emit('assessmentError', { error: 'Failed to create session' });
              return;
            }
          }
          
          if (session) {
            console.log(`💬 LHIS: Session parameterProgress keys:`, Object.keys(session.parameterProgress || {}));
            console.log(`💬 LHIS: Session awaitingAnswer:`, !!session.awaitingAnswer);
          }
          
          // DON'T emit user's answer here - it's already handled by frontend
          // This prevents duplicate messages in chat
          
          const result = await livingAIInterviewer.processAnswer(sessionId, answer);

          if (result.action === 'next_depth') {
            // Continue to next depth question - add dynamic feedback first, then trigger next question
            const session = livingAIInterviewer.activeSessions.get(sessionId);
            const parameter = session?.jobProfile?.parameters?.find((p, idx) => {
              const pKey = p.id !== undefined ? p.id : idx;
              return pKey === result.parameterId;
            });
            
            const dynamicResponse = livingAIInterviewer.generateDynamicDepthResponse(
              answer, 
              parameter, 
              result.nextDepth - 1
            );
            
            const feedbackMessage = {
              id: `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              userId: 'lhis',
              username: 'LHIS',
              message: `✅ ${dynamicResponse}`,
              timestamp: new Date().toISOString(),
              sender: { id: 'lhis', name: 'LHIS', type: 'feedback' }
            };
            this.io.to(sessionId).emit('chatMessage', feedbackMessage);
            
            // Trigger next depth question with delay to prevent race conditions
            setTimeout(async () => {
              await this.checkForParameterQuestion(sessionId);
            }, 1500);

          } else if (result.action === 'next_parameter') {
            // Move to next parameter - add transition message first
            const transitionMessage = {
              id: `transition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              userId: 'lhis',
              username: 'LHIS',
              message: livingAIInterviewer.generatePhaseTransition(result.completedParameter, 'next_parameter'),
              timestamp: new Date().toISOString(),
              sender: { id: 'lhis', name: 'LHIS', type: 'transition' }
            };
            this.io.to(sessionId).emit('chatMessage', transitionMessage);
            
            // Trigger next parameter question with delay
            setTimeout(async () => {
              await this.checkForParameterQuestion(sessionId);
            }, 2000);

          } else if (result.action === 'assessment_complete') {
            // Assessment complete
            const completeMessage = {
              id: `complete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              userId: 'lhis',
              username: 'LHIS',
              message: result.message || 'Assessment complete! Great work on all parameters.',
              timestamp: new Date().toISOString(),
              sender: { id: 'lhis', name: 'LHIS', type: 'completion' }
            };
            this.io.to(sessionId).emit('chatMessage', completeMessage);

          } else if (result.action === 'retry') {
            // Show retry guidance - no next question needed, same question remains active
            const retryMessage = {
              id: `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              userId: 'lhis',
              username: 'LHIS',
              message: result.guidance,
              timestamp: new Date().toISOString(),
              sender: { id: 'lhis', name: 'LHIS', type: 'guidance' }
            };
            this.io.to(sessionId).emit('chatMessage', retryMessage);
          }

        } catch (error) {
          console.error('❌ LHIS: Parameter answer error:', error);
          console.error('❌ LHIS: Error stack:', error.stack);
          console.error('❌ LHIS: Data received:', data);
          socket.emit('assessmentError', { error: 'Failed to process answer', details: error.message });
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 LHIS Assessment socket disconnected: ${socket.id}`);
      });
    });
  }

  // Check if we should force the next question regardless of code changes
  shouldForceNextQuestion(session, parameterId, progress) {
    const now = Date.now();
    const sessionStart = session.sessionStartTime || now;
    const timeSinceStart = now - sessionStart;
    
    // Force questions based on different criteria
    const questionsAsked = progress.questionsAsked.length;
    
    // Force Q2 after 90 seconds if only Q1 asked
    if (questionsAsked === 1 && timeSinceStart > 90000) {
      return { reason: "90s elapsed since session start, forcing Q2" };
    }
    
    // Force Q3 after 150 seconds if only Q1+Q2 asked  
    if (questionsAsked === 2 && timeSinceStart > 150000) {
      return { reason: "150s elapsed since session start, forcing Q3" };
    }
    
    // Force next question if code has grown significantly (solution likely complete)
    const totalCodeLength = Object.values(session.currentCode || {}).join('').length;
    if (totalCodeLength > 800 && questionsAsked === 1) {
      return { reason: "Code length >800 chars, solution likely substantial, forcing Q2" };
    }
    
    if (totalCodeLength > 1200 && questionsAsked === 2) {
      return { reason: "Code length >1200 chars, solution likely complete, forcing Q3" };
    }
    
    return false;
  }

  // Start periodic timer to ensure all 3 questions get asked
  startQuestionTimer() {
    setInterval(async () => {
      // Check all active sessions for pending questions
      const activeSessions = livingAIInterviewer.activeSessions;
      for (const [sessionId, session] of activeSessions.entries()) {
        if (session.parameterProgress) {
          await this.checkForParameterQuestion(sessionId);
        }
      }
    }, 30000); // Check every 30 seconds
    
    console.log('⏰ LHIS: Question timer started - checking every 30s for pending questions');
  }

  // LHIS - Check for parameter question (SIMPLIFIED - always works)
  async checkForParameterQuestion(sessionId) {
    try {
      const session = livingAIInterviewer.activeSessions.get(sessionId);
      if (!session) {
        console.log(`❌ LHIS: No session found for ${sessionId}`);
        return;
      }

      // Skip if already awaiting an answer
      if (session.awaitingAnswer) {
        console.log(`⏭️ LHIS: Already awaiting answer, skipping question check`);
        return;
      }

      // ✅ SIMPLIFIED: Check if we have valid code (quality filters already passed in analyzeCodeProgress)
      const hasValidCode = session.currentCode && 
                          Object.values(session.currentCode).some(c => c && c.trim().length >= 150);
      
      if (!hasValidCode) {
        console.log(`⏭️ LHIS: No valid code found, skipping question check`);
        return;
      }

      // Always use parameter 0 (Approach Analysis)
      const parameterId = 0;
      const progress = session.parameterProgress[parameterId] || {
        milestone: 'not_started',
        codeDetected: false,
        questionsAsked: [],
        approachDetected: false
      };
      
      // Ensure progress exists
      if (!session.parameterProgress[parameterId]) {
        session.parameterProgress[parameterId] = progress;
      }

      // Check if we should generate a question
      const currentDepth = progress.questionsAsked?.length || 0;
      
      if (currentDepth >= 3) {
        console.log(`✅ LHIS: Already asked 3 questions for this code block`);
        return;
      }

      // ✅ SIMPLIFIED: Generate question if we have valid code (no parameter detection check needed)
      console.log(`🎯 LHIS: Generating depth ${currentDepth + 1}/3 question based on approach`);
      
      // Get parameter (always use Approach Analysis)
      const parameter = session.jobProfile?.parameters?.[0] || {
        id: 0,
        name: 'Approach Analysis',
        description: 'Analyze candidate approach and compare against alternatives'
      };
      
      // Generate question
      const questionData = await livingAIInterviewer.triggerParameterAssessment(
        sessionId, 
        parameterId
      );
      
      if (questionData && questionData.question) {
        console.log(`✅ LHIS: Generated question for Depth ${questionData.depthLevel}`);
        
        // Send question
        const chatMessage = {
          id: `param-${parameterId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: 'lhis',
          username: 'LHIS',
          message: questionData.question,
          timestamp: new Date().toISOString(),
          sender: { id: 'lhis', name: 'LHIS', type: 'parameter_question' },
          questionLabel: questionData.questionLabel,
          threadingStatus: questionData.threadingStatus,
          questionContext: {
            type: 'parameter_question',
            parameterId: questionData.parameterId,
            parameterName: questionData.parameterName,
            depthLevel: questionData.depthLevel,
            badge: `Q${questionData.depthLevel}`
          }
        };
        
        this.io.to(sessionId).emit('newMessage', chatMessage);
        
        console.log(`📨 LHIS: Question sent: "${chatMessage.message.substring(0, 100)}..."`);
      } else {
        console.log(`❌ LHIS: Failed to generate question`);
      }

    } catch (error) {
      console.error('❌ LHIS: Parameter question check error:', error);
    }
  }

  /**
   * Determine if code change is significant enough to warrant immediate AI analysis
   * This allows continuous monitoring while optimizing API costs
   */
  isSignificantCodeChange(currentCode, sessionId) {
    const lastCode = this.lastCodeSnapshot.get(sessionId) || '';
    this.lastCodeSnapshot.set(sessionId, currentCode);
    
    if (!lastCode) return true; // First time analyzing
    
    const currentLines = currentCode.split('\n').filter(line => line.trim());
    const lastLines = lastCode.split('\n').filter(line => line.trim());
    
    // Significant change indicators
    const indicators = {
      // New function/class/method definitions
      newDefinitions: /^(def |class |async def |function |const \w+\s*=\s*\()/m.test(currentCode) && 
                     !/^(def |class |async def |function |const \w+\s*=\s*\()/m.test(lastCode),
      
      // New imports or significant structural changes
      newImports: /^(import |from .* import|require\()/m.test(currentCode) && 
                 !/^(import |from .* import|require\()/m.test(lastCode),
      
      // Completion of code blocks (new closing braces, return statements)
      blockCompletion: (currentCode.match(/return |}\s*$/gm) || []).length > 
                      (lastCode.match(/return |}\s*$/gm) || []).length,
      
      // Significant line count increase (new logic)
      significantGrowth: currentLines.length > lastLines.length + 2,
      
      // Implementation of core patterns (decorators, context managers, etc.)
      corePatterns: /@\w+|with\s+\w+|yield|async|await/.test(currentCode) && 
                   !/@\w+|with\s+\w+|yield|async|await/.test(lastCode),
      
      // Test or example code additions
      testCode: /test|example|demo/.test(currentCode.toLowerCase()) && 
               !/test|example|demo/.test(lastCode.toLowerCase())
    };
    
    const isSignificant = Object.values(indicators).some(Boolean);
    
    if (isSignificant) {
      const triggeredBy = Object.entries(indicators)
        .filter(([_, value]) => value)
        .map(([key, _]) => key);
      console.log(`🎯 LHIS: Significant code change detected for ${sessionId}. Triggers: ${triggeredBy.join(', ')}`);
    }
    
    return isSignificant;
  }
}

module.exports = AssessmentSocketHandler; 