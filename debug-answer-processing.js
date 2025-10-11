#!/usr/bin/env node

/**
 * Debug Answer Processing - Focused test to see backend logs
 */

const { io } = require('socket.io-client');

console.log('🔍 Debug Answer Processing Test');

const socket = io('http://localhost:5001');
const sessionId = `debug-${Date.now()}`;

socket.on('connect', () => {
  console.log('✅ Socket connected');
  
  // Step 1: Join assessment room
  console.log('🏠 Joining assessment room...');
  socket.emit('joinAssessmentRoom', {
    sessionId: sessionId,
    userId: 'debug-user'
  });

  // Step 2: Submit code to trigger Q1 (after 2 seconds)
  setTimeout(() => {
    console.log('📤 Submitting code to trigger Q1...');
    socket.emit('assessmentCodeChange', {
      code: `def timing_decorator(func):
    import time
    from functools import wraps
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"Took {end - start:.4f}s")
        return result
    return wrapper`,
      language: 'python',
      sessionId: sessionId
    });
  }, 2000);

  // Step 3: Submit answer (after 8 seconds to let Q1 generate)
  setTimeout(() => {
    console.log('🤖 Submitting answer - WATCH BACKEND CONSOLE NOW!');
    console.log('📋 Session ID:', sessionId);
    console.log('📋 Answer data:');
    
    const answerData = {
      sessionId: sessionId,
      answer: 'I chose the decorator pattern because it provides clean separation of concerns. The timing logic is isolated from the business logic, making it reusable across multiple functions.',
      parameterId: 0,
      depthLevel: 1
    };
    
    console.log(JSON.stringify(answerData, null, 2));
    
    socket.emit('submitParameterAnswer', answerData);
  }, 8000);
});

socket.on('newMessage', (data) => {
  console.log('📝 Question received:', data.message?.substring(0, 80) + '...');
});

socket.on('assessmentError', (error) => {
  console.log('❌ Assessment Error:', error);
  console.log('🔍 Check backend console for detailed logs');
});

socket.on('assessmentRoomJoined', (data) => {
  console.log('🏠 Assessment room joined:', data.sessionId);
});

// Cleanup after 15 seconds
setTimeout(() => {
  console.log('⏰ Test complete - check backend logs');
  socket.disconnect();
  process.exit(0);
}, 15000);
