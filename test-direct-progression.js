#!/usr/bin/env node

/**
 * 🎯 DIRECT PROGRESSION TEST
 * Test the exact progression flow with detailed logging
 */

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';
const SESSION_ID = `param-${Date.now()}-progression`;

console.log('🎯 Testing Direct Progression Flow...');
console.log(`📋 Session ID: ${SESSION_ID}`);

const socket = io(BACKEND_URL);
let questionCount = 0;

socket.onAny((eventName, ...args) => {
  console.log(`📡 Event: ${eventName}`, args.length > 0 ? JSON.stringify(args[0]).substring(0, 200) + '...' : '');
});

socket.on('connect', () => {
  console.log('✅ Connected');
  
  // Join room
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

  // Submit code to trigger Q1
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
    return wrapper

@timing_decorator
def test_func():
    import time
    time.sleep(0.1)
    return "done"

result = test_func()`,
      language: 'python',
      sessionId: SESSION_ID
    });
  }, 2000);

  // After Q1, submit answer and wait for Q2
  setTimeout(() => {
    console.log('\n🤖 Submitting answer for Q1, expecting Q2...');
    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: "I chose the decorator pattern because it provides clean separation of concerns and is reusable across multiple functions. The timing logic is completely isolated from the business logic.",
      depthLevel: 0
    });
  }, 10000);

  // After Q2, submit answer and wait for Q3
  setTimeout(() => {
    console.log('\n🤖 Submitting answer for Q2, expecting Q3...');
    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: "I considered context managers and manual timing as alternatives. Context managers would be more explicit but less convenient for function timing. Manual timing would lead to code duplication. The decorator provides the best balance of convenience and reusability.",
      depthLevel: 1
    });
  }, 20000);

  // Final answer for Q3
  setTimeout(() => {
    console.log('\n🤖 Submitting final answer for Q3...');
    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: "For production scenarios, I would add configurable logging levels, performance thresholds, and async support. If requirements changed to handle distributed systems, I would implement distributed tracing compatibility and add monitoring integration.",
      depthLevel: 2
    });
  }, 30000);
});

socket.on('newMessage', (data) => {
  if (data.sender && data.sender.name === 'LHIS') {
    questionCount++;
    console.log(`\n📝 Question ${questionCount} received:`);
    console.log(`   Depth: ${data.questionContext?.depthLevel || 'Unknown'}`);
    console.log(`   "${data.message.substring(0, 150)}..."`);
  }
});

socket.on('chatMessage', (data) => {
  if (data.sender && data.sender.name === 'LHIS' && data.sender.type === 'feedback') {
    console.log(`\n✅ Feedback received: ${data.message}`);
  }
});

// Summary after 40 seconds
setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 DIRECT PROGRESSION TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`📊 Questions Received: ${questionCount}/3`);
  
  if (questionCount === 3) {
    console.log('🎉 SUCCESS: All 3 questions received!');
  } else if (questionCount > 0) {
    console.log(`⚠️ PARTIAL: Only ${questionCount} questions received`);
  } else {
    console.log('❌ FAILED: No questions received');
  }
  
  console.log('='.repeat(60));
  socket.disconnect();
  process.exit(0);
}, 40000);
