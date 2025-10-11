#!/usr/bin/env node

console.log('🔍 Minimal test starting...');

const axios = require('axios').default;
const { io } = require('socket.io-client');

async function test() {
  try {
    // Step 1: Create session
    console.log('📋 Creating session...');
    const sessionResponse = await axios.post('http://localhost:5001/api/living-assessment/parameter-sessions', {
      language: 'python',
      experienceLevel: 'mid', 
      userId: 'test-user'
    }, { timeout: 5000 });
    
    const sessionId = sessionResponse.data.sessionId;
    console.log('✅ Session created:', sessionId);
    
    // Step 2: Connect socket
    console.log('🔌 Connecting socket...');
    const socket = io('http://localhost:5001', { timeout: 5000 });
    
    socket.on('connect', () => {
      console.log('✅ Socket connected');
      
      // Join assessment room
      socket.emit('joinAssessmentRoom', { sessionId, userId: 'test-user' });
      
      // Submit code to trigger question
      setTimeout(() => {
        console.log('📤 Submitting code...');
        socket.emit('assessmentCodeChange', {
          code: 'def test(): return "hello"',
          language: 'python',
          sessionId
        });
      }, 1000);
      
      // Submit answer
      setTimeout(() => {
        console.log('🤖 Submitting answer...');
        socket.emit('submitParameterAnswer', {
          sessionId,
          answer: 'I used a simple function approach',
          parameterId: 0,
          depthLevel: 1
        });
      }, 5000);
    });
    
    socket.on('newMessage', (data) => {
      console.log('📝 Question received:', data.message?.substring(0, 100));
    });
    
    socket.on('assessmentError', (error) => {
      console.log('❌ Assessment error:', error);
      socket.disconnect();
      process.exit(1);
    });
    
    socket.on('connect_error', (error) => {
      console.log('❌ Socket error:', error.message);
      process.exit(1);
    });
    
    // Cleanup
    setTimeout(() => {
      console.log('⏰ Test complete');
      socket.disconnect();
      process.exit(0);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.status, error.response.data);
    }
    process.exit(1);
  }
}

test();
