#!/usr/bin/env node

/**
 * Single answer submission test to debug the exact error
 */

const { io } = require('socket.io-client');

const socket = io('http://localhost:5001');

socket.on('connect', () => {
  console.log('✅ Connected');
  
  // Join assessment room
  socket.emit('joinAssessmentRoom', {
    sessionId: 'param-debug-test',
    userId: 'test-user'
  });

  // Submit code to trigger Q1
  setTimeout(() => {
    console.log('📤 Submitting code...');
    socket.emit('assessmentCodeChange', {
      code: 'def test(): pass',
      language: 'python',
      sessionId: 'param-debug-test'
    });
  }, 2000);

  // Submit answer after question appears
  setTimeout(() => {
    console.log('🤖 Submitting answer...');
    socket.emit('submitParameterAnswer', {
      sessionId: 'param-debug-test',
      answer: 'Test answer',
      parameterId: 0,
      depthLevel: 1
    });
  }, 8000);
});

socket.onAny((eventName, data) => {
  console.log(`📡 ${eventName}:`, JSON.stringify(data).substring(0, 150) + '...');
});

setTimeout(() => {
  console.log('⏰ Test complete');
  socket.disconnect();
  process.exit(0);
}, 12000);
