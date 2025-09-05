const livingAIInterviewer = require('../services/living-ai-interviewer');
const { parameterDetectionConfig } = require('../config/lhis-detection-rules'); // Import config

class AssessmentSocketHandler {
  constructor(io) {
    this.io = io;
    this.lastAnalysisTime = new Map(); // Track last analysis time per session to prevent rapid calls
    
    // Pass socket IO instance to LHIS so it can emit contextual responses
    livingAIInterviewer.setSocketIO(io);
    
    this.setupLHISHandlers();
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

      // LHIS - Code change monitoring (configurable char threshold)
      socket.on('assessmentCodeChange', async (data) => {
        try {
          const { sessionId, questionId, code, language } = data;
          
          if (!sessionId || !code || code.trim().length < parameterDetectionConfig.codeThresholds.minimumCharacters) {
            return; // Skip analysis for short code
          }

          // THROTTLING: Prevent rapid AI analysis calls (minimum 3 seconds between calls)
          const now = Date.now();
          const lastAnalysis = this.lastAnalysisTime.get(sessionId) || 0;
          const timeSinceLastAnalysis = now - lastAnalysis;
          
          if (timeSinceLastAnalysis < 3000) {
            console.log(`⏱️ LHIS: Throttling analysis for session ${sessionId} (${timeSinceLastAnalysis}ms since last)`);
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
      });

      // LHIS - Submit parameter answer
      socket.on('submitParameterAnswer', async (data) => {
        try {
          const { sessionId, answer } = data;
          
          console.log(`💬 LHIS: Processing parameter answer for session ${sessionId}`);
          
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
          socket.emit('assessmentError', { error: 'Failed to process answer' });
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 LHIS Assessment socket disconnected: ${socket.id}`);
      });
    });
  }

  // LHIS - Check for parameter question (clean, single responsibility)
  async checkForParameterQuestion(sessionId) {
    try {
      const session = livingAIInterviewer.activeSessions.get(sessionId);
      if (!session) return;

      // Skip if already awaiting an answer
      if (session.awaitingAnswer) {
        console.log(`⏭️ LHIS: Already awaiting answer, skipping question check`);
        return;
      }

      const { parameterProgress } = session;
      
      // Find the first parameter that needs a question (including next depth questions)
      for (const [parameterId, progress] of Object.entries(parameterProgress)) {
        if (progress.codeDetected && progress.questionsAsked.length < 3 && progress.milestone !== 'completed') {
          console.log(`🎯 LHIS: Found parameter ready for depth ${progress.questionsAsked.length + 1} question: ${parameterId}`);
          
          // Generate question
          const questionData = await livingAIInterviewer.triggerParameterAssessment(
            sessionId, 
            parseInt(parameterId)
          );
          
          if (questionData && questionData.question) {
            console.log(`✅ LHIS: Generated question for ${questionData.parameterName} Depth ${questionData.depthLevel}`);
            
            // Send clean, minimal chat message with unique ID
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
                badge: `P${parseInt(parameterId) + 1}.${questionData.depthLevel}`
              }
            };
            
            // Send to main room only (frontend joins this room)
            this.io.to(sessionId).emit('chatMessage', chatMessage);
            console.log(`📨 LHIS: Question sent to ${sessionId} room`);
            
            // Only process one question at a time
            break;
          }
        }
      }

    } catch (error) {
      console.error('❌ LHIS: Parameter question check error:', error);
    }
  }
}

module.exports = AssessmentSocketHandler; 