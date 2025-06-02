const { analyzeCode } = require('../services/aiService');

// Simple debounce map for each room
const debounceTimers = {};

// Per-room AI question timer state and context
const roomTimers = {}; // { [roomName]: { timers: [], questionSets: 0, languageId, experience, code } }

const sanitizeMessage = (msg) => {
  if (typeof msg !== 'string') return '';
  // Remove HTML tags
  return msg.replace(/<[^>]*>/g, '').slice(0, 500);
};

const isValidRoomName = (name) => /^[a-zA-Z0-9_-]{3,32}$/.test(name);

module.exports.setupSockets = (io) => {
  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a Socket.io room
    socket.on('joinRoom', ({ roomName, userId, username }) => {
      if (isValidRoomName(roomName)) {
        socket.join(roomName);
        socket.roomName = roomName;
        socket.userId = userId;
        socket.username = username;
        console.log(`User ${userId} joined room ${roomName}`);
        socket.to(roomName).emit('userJoined', { userId, username });

        // Start AI question timers if not already started
        if (!roomTimers[roomName]) {
          roomTimers[roomName] = { timers: [], questionSets: 0, languageId: null, experience: null, code: "" };
          // First set at 2 min
          const t1 = setTimeout(async () => {
            if (io.sockets.adapter.rooms.has(roomName)) {
              await emitAIQuestions(roomName, io, 1);
              roomTimers[roomName].questionSets++;
            }
          }, 2 * 60 * 1000);
          // Second set at 4 min
          const t2 = setTimeout(async () => {
            if (io.sockets.adapter.rooms.has(roomName)) {
              await emitAIQuestions(roomName, io, 2);
              roomTimers[roomName].questionSets++;
            }
          }, 4 * 60 * 1000);
          roomTimers[roomName].timers = [t1, t2];
        }
      }
    });

    // Interview info: store language/experience for the room
    socket.on('interviewInfo', async ({ roomName, userId, username, languageId, experience }) => {
      if (roomTimers[roomName]) {
        roomTimers[roomName].languageId = languageId;
        roomTimers[roomName].experience = experience;
      }
      // Compose a prompt for the AI module
      const prompt = `Generate 2 technical real-world inspired coding interview questions for a candidate with ${experience} years of experience in language ID ${languageId}. Format as Q1: <question>\nQ2: <question>.`;
      // Call AI module (simulate code as empty string, pass language and experience)
      const aiResult = await analyzeCode({ code: prompt, language: languageId, userId, roomName });
      if (aiResult && aiResult.question) {
        // Split into two questions if possible
        const questions = aiResult.question.split(/Q[12]:/).map(q => q.trim()).filter(Boolean);
        questions.forEach(q => {
          io.to(roomName).emit('aiQuestion', { question: q, type: 'interview', context: { languageId, experience } });
        });
      }
    });

    // Leave a Socket.io room
    socket.on('leaveRoom', ({ roomName, userId, username }) => {
      if (roomName) {
        socket.leave(roomName);
        console.log(`User ${userId} left room ${roomName}`);
        socket.to(roomName).emit('userLeft', { userId, username });
        // Clean up timers if room is empty
        if (io.sockets.adapter.rooms.get(roomName)?.size === 0) {
          if (roomTimers[roomName]) {
            roomTimers[roomName].timers.forEach(clearTimeout);
            delete roomTimers[roomName];
          }
        }
      }
    });

    // WebRTC signaling relay
    socket.on('signal', ({ roomName, from, to, data }) => {
      if (roomName && to) {
        // Relay the signal to the intended recipient in the room
        for (const [id, s] of io.of('/').sockets) {
          if (s.roomName === roomName && s.userId === to) {
            s.emit('signal', { from, data });
          }
        }
      }
    });

    // Real-time code sync + AI analysis
    socket.on('codeChange', ({ roomName, code, language, userId }) => {
      if (roomName) {
        socket.to(roomName).emit('codeUpdate', { code });
        // Store latest code for the room
        if (roomTimers[roomName]) {
          roomTimers[roomName].code = code;
        }
        // Debounce AI analysis per room
        if (debounceTimers[roomName]) clearTimeout(debounceTimers[roomName]);
        debounceTimers[roomName] = setTimeout(async () => {
          const aiResult = await analyzeCode({ code, language, userId, roomName });
          if (aiResult && aiResult.question) {
            io.to(roomName).emit('aiQuestion', aiResult);
          }
        }, 1500); // 1.5s debounce
      }
    });

    // Real-time chat/messages
    socket.on('chatMessage', ({ roomName, userId, username, message, timestamp }) => {
      if (isValidRoomName(roomName) && message && typeof message === 'string') {
        const sanitized = sanitizeMessage(message);
        if (sanitized.length > 0) {
          io.to(roomName).emit('chatMessage', {
            userId,
            username,
            message: sanitized,
            timestamp: timestamp || new Date().toISOString()
          });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Clean up timers if this was the last user in the room
      const roomName = socket.roomName;
      if (roomName && io.sockets.adapter.rooms.get(roomName)?.size === 0) {
        if (roomTimers[roomName]) {
          roomTimers[roomName].timers.forEach(clearTimeout);
          delete roomTimers[roomName];
        }
      }
    });
  });
};

// Helper to emit 2 AI questions per set, using latest code and context
async function emitAIQuestions(roomName, io, setNum) {
  const ctx = roomTimers[roomName] || {};
  const code = ctx.code || "";
  const languageId = ctx.languageId || "";
  const experience = ctx.experience || "";
  const prompt = `Given the following code (language ID: ${languageId}, experience: ${experience}):\n\n${code}\n\nGenerate 2 technical interview questions about this code. Format as Q1: <question>\nQ2: <question>.`;
  const aiResult = await analyzeCode({ code: prompt, language: languageId, userId: null, roomName });
  if (aiResult && aiResult.question) {
    const questions = aiResult.question.split(/Q[12]:/).map(q => q.trim()).filter(Boolean);
    questions.forEach(q => {
      io.to(roomName).emit('aiQuestion', { question: q, type: 'interview', context: { set: setNum, languageId, experience } });
    });
  }
} 