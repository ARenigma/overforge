#!/usr/bin/env node

/**
 * Minimal socket test to see if submitParameterAnswer is being received
 */

const { io } = require('socket.io-client');

const socket = io('http://localhost:5001');

socket.on('connect', () => {
  console.log('✅ Connected to backend');
  
  // Try to submit an answer and see what happens
  console.log('📤 Sending submitParameterAnswer...');
  socket.emit('submitParameterAnswer', {
    sessionId: 'test-session',
    answer: 'test answer',
    parameterId: 0,
    depthLevel: 1
  });
});

socket.onAny((eventName, data) => {
  console.log(`📡 Received: ${eventName}`, JSON.stringify(data).substring(0, 200));
});

socket.on('assessmentError', (error) => {
  console.log('❌ Assessment Error:', error);
  socket.disconnect();
  process.exit(0);
});

setTimeout(() => {
  console.log('⏰ Timeout - disconnecting');
  socket.disconnect();
  process.exit(0);
}, 5000);
