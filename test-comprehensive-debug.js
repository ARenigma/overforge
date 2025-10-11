#!/usr/bin/env node

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';
const SESSION_ID = `param-${Date.now()}-debug`;

console.log('🔍 COMPREHENSIVE DEBUG TEST');
console.log(`📋 Session ID: ${SESSION_ID}`);
console.log('='.repeat(60));

const socket = io(BACKEND_URL);

let events = [];
function logEvent(event, data) {
  const timestamp = new Date().toISOString();
  events.push({ timestamp, event, data });
  console.log(`[${timestamp}] 📡 ${event}:`, typeof data === 'object' ? JSON.stringify(data).substring(0, 100) + '...' : data);
}

// Log all socket events
socket.onAny((eventName, ...args) => {
  logEvent(`RECEIVED: ${eventName}`, args[0]);
});

socket.on('connect', () => {
  logEvent('CONNECTED', 'WebSocket connection established');
  
  // Step 1: Join room
  console.log('\n🔄 STEP 1: Joining room...');
  socket.emit('joinRoom', {
    roomName: SESSION_ID,
    userId: 'debug-user',
    username: 'Debug User',
    language: 'python',
    experienceLevel: 'mid'
  });
  logEvent('SENT: joinRoom', SESSION_ID);
});

socket.on('roomJoined', (data) => {
  logEvent('ROOM_JOINED', data);
  
  // Step 2: Join assessment room
  console.log('\n🔄 STEP 2: Joining assessment room...');
  socket.emit('joinAssessmentRoom', {
    sessionId: SESSION_ID,
    userId: 'debug-user'
  });
  logEvent('SENT: joinAssessmentRoom', SESSION_ID);
});

socket.on('assessmentRoomJoined', (data) => {
  logEvent('ASSESSMENT_ROOM_JOINED', data);
  
  // Step 3: Submit code
  setTimeout(() => {
    console.log('\n🔄 STEP 3: Submitting code for parameter detection...');
    const code = `def timing_decorator(func):
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

result = slow_function()`;
    
    socket.emit('assessmentCodeChange', {
      code: code,
      language: 'python',
      sessionId: SESSION_ID
    });
    logEvent('SENT: assessmentCodeChange', `${code.length} chars`);
    
    // Also try regular code change
    socket.emit('codeChange', {
      code: code,
      language: 'python',
      sessionId: SESSION_ID
    });
    logEvent('SENT: codeChange', `${code.length} chars`);
  }, 2000);
});

socket.on('newMessage', (data) => {
  logEvent('NEW_MESSAGE', data);
  if (data.sender && (data.sender.name === 'LHIS' || data.sender.name === 'Technical Interviewer')) {
    console.log('\n✅ QUESTION RECEIVED!');
    console.log(`   From: ${data.sender.name}`);
    console.log(`   Message: "${data.message.substring(0, 150)}..."`);
    
    // Step 4: Submit answer
    setTimeout(() => {
      console.log('\n🔄 STEP 4: Submitting answer...');
      socket.emit('submitParameterAnswer', {
        sessionId: SESSION_ID,
        parameterId: 0,
        answer: "I chose the decorator approach because it provides clean separation of concerns.",
        depthLevel: 0
      });
      logEvent('SENT: submitParameterAnswer', 'Answer submitted');
    }, 3000);
  }
});

socket.on('assessmentError', (error) => {
  logEvent('ASSESSMENT_ERROR', error);
  console.log('\n❌ CRITICAL ERROR in answer processing!');
  console.log('   Error:', error.error);
  console.log('   Details:', error.details);
});

socket.on('connect_error', (error) => {
  logEvent('CONNECTION_ERROR', error.message);
});

socket.on('disconnect', (reason) => {
  logEvent('DISCONNECTED', reason);
});

// Final summary
setTimeout(() => {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 COMPREHENSIVE DEBUG SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\n📊 EVENT TIMELINE:');
  events.forEach((event, index) => {
    console.log(`${index + 1}. ${event.timestamp} - ${event.event}`);
  });
  
  const hasRoomJoined = events.some(e => e.event === 'RECEIVED: roomJoined');
  const hasAssessmentJoined = events.some(e => e.event === 'RECEIVED: assessmentRoomJoined');
  const hasQuestion = events.some(e => e.event === 'RECEIVED: newMessage');
  const hasError = events.some(e => e.event === 'RECEIVED: assessmentError');
  
  console.log('\n🔍 DIAGNOSIS:');
  console.log(`   Room Joined: ${hasRoomJoined ? '✅' : '❌'}`);
  console.log(`   Assessment Room Joined: ${hasAssessmentJoined ? '✅' : '❌'}`);
  console.log(`   Question Generated: ${hasQuestion ? '✅' : '❌'}`);
  console.log(`   Answer Processing Error: ${hasError ? '❌' : '✅'}`);
  
  if (!hasRoomJoined) {
    console.log('\n🚨 ISSUE: Room joining failed - check backend socket handlers');
  } else if (!hasAssessmentJoined) {
    console.log('\n🚨 ISSUE: Assessment room joining failed - check LHIS initialization');
  } else if (!hasQuestion) {
    console.log('\n🚨 ISSUE: No questions generated - check parameter detection and code analysis');
  } else if (hasError) {
    console.log('\n🚨 ISSUE: Answer processing failed - check processAnswer method');
  } else {
    console.log('\n🎉 SUCCESS: All systems working correctly!');
  }
  
  console.log('='.repeat(80));
  socket.disconnect();
  process.exit(0);
}, 30000);

