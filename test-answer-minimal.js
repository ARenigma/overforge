#!/usr/bin/env node

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';
const SESSION_ID = `param-${Date.now()}-minimal`;

console.log('🎯 Minimal Answer Processing Test');
console.log(`📋 Session ID: ${SESSION_ID}`);

const socket = io(BACKEND_URL);

socket.on('connect', () => {
  console.log('✅ Connected to backend');
  
  // Join rooms
  socket.emit('joinRoom', {
    roomName: SESSION_ID,
    userId: 'test-user',
    username: 'Test User',
    language: 'python',
    experienceLevel: 'mid'
  });

  socket.emit('joinAssessmentRoom', {
    sessionId: SESSION_ID,
    userId: 'test-user'
  });

  // Submit minimal code to trigger Q1
  setTimeout(() => {
    console.log('\n📤 Submitting code to trigger Q1...');
    socket.emit('assessmentCodeChange', {
      code: `def timing_decorator(func):
    import time
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        print(f"Took {time.time() - start:.4f}s")
        return result
    return wrapper`,
      language: 'python',
      sessionId: SESSION_ID
    });
  }, 2000);

  // Submit answer after Q1 is received
  setTimeout(() => {
    console.log('\n🤖 Submitting minimal answer...');
    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,  // Explicit integer
      answer: "I used a decorator pattern for timing because it's clean and reusable.",
      depthLevel: 0
    });
  }, 10000);
});

socket.on('newMessage', (data) => {
  if (data.sender && data.sender.name === 'LHIS') {
    console.log(`\n📝 Question received: ${data.message.substring(0, 100)}...`);
  }
});

socket.on('assessmentError', (error) => {
  console.log(`\n❌ Assessment Error:`, error);
  console.log('🔍 Error details:', JSON.stringify(error, null, 2));
});

socket.on('chatMessage', (data) => {
  if (data.sender && data.sender.type === 'feedback') {
    console.log(`\n✅ Feedback: ${data.message}`);
  }
});

// Summary after 20 seconds
setTimeout(() => {
  console.log('\n🎯 Test completed');
  socket.disconnect();
  process.exit(0);
}, 20000);

