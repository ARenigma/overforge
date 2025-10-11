#!/usr/bin/env node

/**
 * 🔍 DEBUG 3-QUESTION SYSTEM
 * Simple test to debug why questions aren't coming through
 */

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';
const SESSION_ID = `param-${Date.now()}-debug`;

console.log('🔍 Starting Debug Test...');
console.log(`📋 Session ID: ${SESSION_ID}`);

const socket = io(BACKEND_URL, {
  transports: ['websocket']
});

// Listen for ALL events
socket.onAny((eventName, ...args) => {
  console.log(`📡 Received event: ${eventName}`, args);
});

socket.on('connect', () => {
  console.log('✅ WebSocket connected');
  
  // Join room
  console.log('🏠 Joining room...');
  socket.emit('joinRoom', {
    roomName: SESSION_ID,
    userId: 'debug-user',
    username: 'Debug User',
    language: 'python',
    experienceLevel: 'mid'
  });

  // Join assessment room
  console.log('🎯 Joining assessment room...');
  socket.emit('joinAssessmentRoom', {
    sessionId: SESSION_ID,
    userId: 'debug-user'
  });

  // Wait a bit then submit code
  setTimeout(() => {
    console.log('📤 Submitting test code...');
    
    const testCode = `import time
from functools import wraps

def timing_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        print(f"{func.__name__} took {end_time - start_time:.4f} seconds")
        return result
    return wrapper

@timing_decorator
def test_function():
    time.sleep(1)
    return "test"

result = test_function()`;

    // Submit both code change events
    socket.emit('codeChange', {
      code: testCode,
      language: 'python',
      sessionId: SESSION_ID
    });

    socket.emit('assessmentCodeChange', {
      code: testCode,
      language: 'python', 
      sessionId: SESSION_ID
    });

    console.log('📤 Code submitted, waiting for questions...');
  }, 2000);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
});

socket.on('newMessage', (data) => {
  console.log('📝 NEW MESSAGE:', data);
});

socket.on('chatMessage', (data) => {
  console.log('💬 CHAT MESSAGE:', data);
});

// Keep running for 30 seconds
setTimeout(() => {
  console.log('⏰ Test timeout - disconnecting');
  socket.disconnect();
  process.exit(0);
}, 30000);
