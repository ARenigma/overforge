const { Server } = require('socket.io');
const { fetchInitialRoomQuestions } = require('../services/aiService');
const AssessmentSocketHandler = require('./assessment-socket');
const livingAIInterviewer = require('../services/living-ai-interviewer');

// Debounce map for joinRoom events to prevent API abuse
const joinRoomDebounce = new Map();

// Room management
const roomTimers = {}; // Store session context and timers

// Simple in-memory chat storage for Enhanced Chat Panel
const roomChatHistory = new Map(); // roomId -> array of messages

const sanitizeMessage = (msg) => {
  return msg?.trim()?.substring(0, 1000) || ''; // Limit message length
};

// Validation helper for session names
const isValidRoomName = (name) => /^[a-zA-Z0-9_.-]{3,128}$/.test(name); // Adjusted length for session IDs

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Initialize Assessment Socket Handler for Living AI Interviewer
  new AssessmentSocketHandler(io);
  
  // Custom emit wrapper that also stores messages in history (CREATE FIRST)
  io.emitAndStore = function(roomName, event, data) {
    // Store chat messages for history
    if (event === 'chatMessage' && data) {
      if (!roomChatHistory.has(roomName)) {
        roomChatHistory.set(roomName, []);
      }
      const messages = roomChatHistory.get(roomName);
      messages.push({
        id: data.id || Date.now().toString(),
        userId: data.userId || 'system',
        username: data.username || data.sender?.name || 'System',
        content: data.message || data.content,
        timestamp: data.timestamp || new Date().toISOString(),
        sender: data.sender,
        questionContext: data.questionContext
      });
      
      // Keep only last 50 messages per room to prevent memory issues
      if (messages.length > 50) {
        messages.splice(0, messages.length - 50);
      }
      
      console.log(`💾 Stored chat message for room ${roomName}. Total messages: ${messages.length}`);
    }
    
    // Emit normally
    return io.to(roomName).emit(event, data);
  };

  // Pass socket IO instance to Living AI Interviewer for chat emission (AFTER storage function exists)
  livingAIInterviewer.setSocketIO(io);

  // Pass the storage function directly to LHIS
  livingAIInterviewer.setStorageFunction(io.emitAndStore);

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a session (roomName is sessionId)
    socket.on('joinRoom', async (data) => {
      console.log(`🔍 JOIN DEBUG: Received joinRoom data:`, JSON.stringify(data));
      const { roomName, userId, username, language, experienceLevel, jobDescription, jobProfile, role } = data;
      // Prevent duplicate join room calls (API abuse protection)
      const joinKey = `${roomName}-${userId}`;
      const lastJoinTime = joinRoomDebounce.get(joinKey);
      
      if (lastJoinTime && Date.now() - lastJoinTime < 5000) {
        console.log(`⚠️  Debouncing duplicate joinRoom call for ${joinKey}`);
        return;
      }
      
      // Update debounce timestamp
      joinRoomDebounce.set(joinKey, Date.now());
      
      // Clean up old entries periodically
      if (joinRoomDebounce.size > 100) {
        const now = Date.now();
        for (const [key, timestamp] of joinRoomDebounce.entries()) {
          if (now - timestamp > 60000) { // Remove entries older than 1 minute
            joinRoomDebounce.delete(key);
          }
        }
      }
      
      if (!isValidRoomName(roomName)) {
        console.error(`Invalid session ID format: ${roomName}`);
        socket.emit('joinRoomError', { message: 'Invalid session ID format.' });
        return;
      }
      if (!language || !experienceLevel) {
        console.error(`Language or experience level missing for session ${roomName}. Lang: ${language}, Exp: ${experienceLevel}`);
        socket.emit('joinRoomError', { message: 'Language or experience level must be provided to start the session.' });
        return;
      }

      try {
        socket.join(roomName);
        socket.roomName = roomName;
        socket.userId = userId;
        socket.username = username;
        console.log(`User ${userId} (${username}) joined session ${roomName} with Lang: ${language}, Exp: ${experienceLevel}`);
        socket.to(roomName).emit('userJoined', { userId, username });
        
        // Check if this is a parameter-based session (starts with 'param-')
        const isParameterSession = roomName.startsWith('param-');
        const hasJobAssessment = jobDescription || jobProfile;
        
        if (hasJobAssessment) {
          console.log(`🎯 Job assessment detected for session ${roomName} - LHIS will handle this`);
          
          // Store basic session info for LHIS
            roomTimers[roomName] = { 
              languageId: language, 
              experience: experienceLevel,
              assessmentMode: true,
            jobProfileId: jobProfile
          };
          
          // Let LHIS handle the assessment initialization
          return;
        }
        
        if (isParameterSession) {
          console.log(`📋 Parameter-based session detected: ${roomName} - using database problems`);
          
          // Store session info for parameter-based sessions
          roomTimers[roomName] = { 
            languageId: language, 
            experience: experienceLevel,
            assessmentMode: true,  // Enable assessment mode for LHIS depth questions
            parameterSession: true
          };
          
          // Initialize LHIS for parameter-based sessions to enable depth questions
          try {
            console.log(`🎯 LHIS: Initializing parameter-based assessment for ${roomName}`);
            await livingAIInterviewer.initializeParameterAssessment(
              roomName, 
              userId, 
              language, 
              experienceLevel
            );
            console.log(`✅ LHIS: Parameter assessment initialized for ${roomName}`);
          } catch (error) {
            console.log(`⚠️ LHIS: Parameter assessment initialization failed (non-blocking): ${error.message}`);
          }
          
          // No need to fetch AI questions - parameter system will load database problems
          return;
        }

        // FALLBACK: Basic question generation for legacy non-assessment sessions
        console.log(`Session ${roomName}: Fetching initial questions for Lang=${language}, Exp=${experienceLevel}`);
        const aiQuestions = await fetchInitialRoomQuestions(language, experienceLevel);
        
        if (aiQuestions && aiQuestions.length > 0) {
          const fetchedQuestions = aiQuestions.map((q, index) => ({
            id: `q${index + 1}`,
            title: q.title || `Question ${index + 1}`,
            description: q.problem || q.description || 'Coding challenge',
            language: q.language || language,
          }));
          
          console.log(`Successfully fetched ${fetchedQuestions.length} initial questions for session ${roomName}`);
          
          roomTimers[roomName] = { 
            languageId: language, 
            experience: experienceLevel,
            assessmentMode: false,
            initialQuestions: fetchedQuestions
          };

          socket.emit('initialRoomQuestions', fetchedQuestions);
        } else {
          console.error(`❌ No initial questions generated by AI for session ${roomName}`);
          socket.emit('joinRoomError', { message: 'AI service is unavailable. Please ensure the AI module is running and accessible.' });
          return;
        }

      } catch (error) {
        console.error(`Error in joinRoom handler for ${roomName}:`, error);
        socket.emit('joinRoomError', { message: 'Failed to process session entry.' });
      }
    });

    // Leave a session
    socket.on('leaveRoom', ({ roomName, userId, username }) => {
      if (roomName) {
        socket.leave(roomName);
        console.log(`User ${userId} (${username}) left session ${roomName}`);
        socket.to(roomName).emit('userLeft', { userId, username });
        if (io.sockets.adapter.rooms.get(roomName)?.size === 0) {
            delete roomTimers[roomName];
          console.log(`Cleaned up session ${roomName}`);
        }
      }
    });

    // Code change handler - Routes to Living AI Interviewer
    socket.on('codeChange', async ({ roomName, questionId, code, language, userId }) => {
      console.log(`📝 CodeChange received for session ${roomName}:`);
      console.log(`   Question ID: ${questionId}`);
      console.log(`   Code length: ${code?.length}`);
      console.log(`   User ID: ${userId}`);
      console.log(`   Language: ${language}`);

      if (!roomName) {
        console.log('❌ CodeChange event missing roomName parameter');
        return;
      }

      // BULLETPROOF: Always check for active LHIS sessions first
      const lhisSession = livingAIInterviewer.activeSessions.get(roomName);
      if (lhisSession) {
        console.log(`🎯 LHIS session detected for ${roomName}, delegating to assessment socket`);
        // Assessment socket will handle this - do not process here to prevent duplicates
        return;
      }

      // Also check room timers for legacy support
      if (roomTimers[roomName]?.assessmentMode || roomTimers[roomName]?.jobProfileId) {
        console.log(`🎯 Assessment mode detected for ${roomName}, delegating to assessment socket`);
        // Assessment socket will handle this - do not process here to prevent duplicates
            return;
      }

      // Basic session: Just relay code changes
      try {
        socket.to(roomName).emit('codeChange', { questionId, code, language, userId });
        console.log(`✅ Code change relayed for session ${roomName}`);
      } catch (error) {
        console.error(`❌ Error processing code change for session ${roomName}:`, error);
      }
    });

    // Language change handler
    socket.on('languageChange', ({ roomName, language, userId }) => {
      console.log(`🔧 Language changed in room ${roomName} by ${userId} to: ${language}`);
      if (roomName && language) {
        socket.to(roomName).emit('languageChange', { language, userId });
        
        // Update room info if exists
        if (roomTimers[roomName]) {
          roomTimers[roomName].languageId = language;
        }
      }
    });

    // Framework change handler
    socket.on('frameworkChange', ({ roomName, framework, userId }) => {
      console.log(`🏗️ Framework changed in room ${roomName} by ${userId} to: ${framework}`);
      if (roomName && framework) {
        socket.to(roomName).emit('frameworkChange', { framework, userId });
        
        // Update room info if exists
        if (roomTimers[roomName]) {
          roomTimers[roomName].framework = framework;
        }
      }
    });

    // Code execution handler
    socket.on('executeCode', async ({ roomName, code, language, framework, userId }) => {
      console.log(`▶️ Code execution request in room ${roomName}:`);
      console.log(`   Language: ${language}, Framework: ${framework}`);
      console.log(`   Code length: ${code?.length}`);
      
      try {
        // Import execution router
        const executionRouter = require('../services/execution-router');
        
        // Determine problem type based on framework
        const problemType = framework && framework !== 'none' ? 'framework' : 'algorithm';
        
        const executionRequest = {
          sessionId: roomName,
          type: problemType,
          language,
          framework,
          sourceCode: code,
          config: {
            production: process.env.NODE_ENV === 'production',
            userId: userId
          }
        };
        
        console.log(`🚀 Routing execution via ${problemType} system`);
        const result = await executionRouter.executeCode({
          problemType,
          language,
          sourceCode: code,
          framework,
          config: { sessionId: roomName, production: process.env.NODE_ENV === 'production', userId }
        });
        
        const isSuccess = !!result && result.success !== false;
        if (isSuccess) {
          const output = result.output || result.result?.output || (result.type === 'judge0' ? 'Submission sent to Judge0' : 'Execution completed');
          const webUrl = result.webUrl || result.result?.webUrl;
          const executionTime = result.executionTime || result.result?.executionTime;
          socket.emit('executionResult', { output, webUrl, executionTime });
          socket.to(roomName).emit('executionResult', { output, userId });
        } else {
          const errorMessage = result?.error || (result?.type === 'judge0' ? 'Submission sent to Judge0' : 'Execution failed');
          socket.emit('executionResult', { output: result?.output || '', error: errorMessage });
        }
        
      } catch (error) {
        console.error(`❌ Code execution error in room ${roomName}:`, error);
        socket.emit('executionResult', {
          output: '',
          error: `Execution error: ${error.message}`
        });
      }
    });

    // Simplified chat functionality with storage
    socket.on('chatMessage', async ({ roomName, message, userId, username }) => {
      try {
        const sanitizedMessage = sanitizeMessage(message);
        if (!sanitizedMessage) return;

        const chatMessage = {
          id: Date.now(), // Simple timestamp ID
          userId,
          username,
          message: sanitizedMessage,
          timestamp: new Date().toISOString()
        };

        // Store and emit
        io.emitAndStore(roomName, 'chatMessage', chatMessage);
      } catch (error) {
        console.error('Chat message error:', error);
      }
    });

    // WebRTC signaling relay
    socket.on('signal', ({ roomName, from, to, data }) => {
      if (roomName && to) {
        for (const [id, s] of io.of('/').sockets) {
          if (s.roomName === roomName && s.userId === to) {
            s.emit('signal', { from, data });
            break;
          }
        }
      }
    });

    // User info getter
    socket.on('getUserInfo', (callback) => {
      if (typeof callback === 'function') {
        callback({
          id: socket.userId,
          name: socket.username
        });
      }
    });

    // Get chat history with actual stored messages
    socket.on('getChatHistory', (roomName, callback) => {
        if (typeof callback === 'function') {
        const messages = roomChatHistory.get(roomName) || [];
        console.log(`📚 Loading chat history for room ${roomName}: ${messages.length} messages`);
        callback(messages);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
  
  return io;
}

module.exports = { initializeSocket };