#!/usr/bin/env node

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';
const SESSION_ID = `param-${Date.now()}-websocket`; // Use param- prefix to trigger parameter session

console.log('🎯 Testing WebSocket Parameter Session Flow');
console.log(`📋 Session ID: ${SESSION_ID}`);

const socket = io(BACKEND_URL);

let questionReceived = false;

socket.on('connect', () => {
  console.log('✅ Connected to backend');
  
  // Join room with parameter session format
  console.log('🏠 Joining room to trigger parameter session creation...');
  socket.emit('joinRoom', {
    roomName: SESSION_ID,  // This should trigger parameter session creation
    userId: 'test-user',
    username: 'Test User',
    language: 'python',
    experienceLevel: 'mid'
  });

  socket.emit('joinAssessmentRoom', {
    sessionId: SESSION_ID,
    userId: 'test-user'
  });
});

socket.on('roomJoined', (data) => {
  console.log('✅ Room joined:', data);
  
  // Submit code after joining
  setTimeout(() => {
    console.log('\n📤 Submitting code to trigger parameter detection...');
    socket.emit('assessmentCodeChange', {
      code: `def timing_decorator(func):
    import time
    from functools import wraps
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} took {end - start:.4f} seconds")
        return result
    return wrapper

@timing_decorator
def slow_function():
    time.sleep(0.1)
    return "Done"

result = slow_function()`,
      language: 'python',
      sessionId: SESSION_ID
    });
  }, 2000);
});

socket.on('newMessage', (data) => {
  if (data.sender && (data.sender.name === 'LHIS' || data.sender.name === 'Technical Interviewer')) {
    console.log(`\n📝 Question received from ${data.sender.name}:`);
    console.log(`   "${data.message.substring(0, 100)}..."`);
    console.log(`   Question context:`, data.questionContext);
    questionReceived = true;
    
    // Submit answer after receiving question
    setTimeout(() => {
      console.log('\n🤖 Submitting answer...');
      socket.emit('submitParameterAnswer', {
        sessionId: SESSION_ID,
        parameterId: 0,  // Should match the initialized parameter
        answer: "I chose the decorator approach because it provides clean separation of concerns and is reusable across multiple functions. The timing logic is isolated from the business logic.",
        depthLevel: 0
      });
    }, 2000);
  }
});

socket.on('assessmentError', (error) => {
  console.log(`\n❌ Assessment Error:`, error);
  console.log('🔍 This tells us what went wrong with answer processing');
});

socket.on('chatMessage', (data) => {
  if (data.sender && data.sender.type === 'feedback') {
    console.log(`\n✅ Feedback received: ${data.message}`);
  }
});

// Summary after 25 seconds
setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 WebSocket Flow Test Summary');
  console.log('='.repeat(60));
  console.log(`Question received: ${questionReceived ? '✅' : '❌'}`);
  console.log('If question was received but answer processing failed,');
  console.log('then the issue is specifically in the processAnswer method.');
  console.log('='.repeat(60));
  
  socket.disconnect();
  process.exit(0);
}, 25000);

