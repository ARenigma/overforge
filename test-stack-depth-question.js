/**
 * Test script to reproduce depth-question behavior for the Stack question/answer
 *
 * Question: "Implement a simple Stack class with push(), pop(), peek(), and isEmpty() methods. Include proper error handling."
 * Answer (Java): Simple generic Stack implementation with error handling.
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

// This QUESTION_ID is mostly used to tag code per-question in the session
const QUESTION_ID = 'core-3';
const LANGUAGE = 'java';
const USER_ID = 'stack-depth-test-user';

// Exact Stack answer we provided to you
const STACK_CODE = `public class Stack<T> {
    private java.util.ArrayList<T> elements = new java.util.ArrayList<>();

    public void push(T item) {
        elements.add(item);
    }

    public T pop() {
        if (isEmpty()) {
            throw new IllegalStateException("Cannot pop from an empty stack");
        }
        return elements.remove(elements.size() - 1);
    }

    public T peek() {
        if (isEmpty()) {
            throw new IllegalStateException("Cannot peek on an empty stack");
        }
        return elements.get(elements.size() - 1);
    }

    public boolean isEmpty() {
        return elements.isEmpty();
    }
}`;

async function testStackDepthScenario() {
  console.log('🔍 TESTING STACK DEPTH QUESTION SCENARIO');
  console.log('='.repeat(60));
  console.log(`Language: ${LANGUAGE}`);
  console.log(`Code length: ${STACK_CODE.length} chars`);
  console.log('='.repeat(60));

  try {
    // 1) Create a fresh parameter-based session via API (this guarantees LHIS parameter flow)
    console.log('\n📤 Creating parameter-based session via API...');
    const sessionResponse = await axios.post(
      `${BACKEND_URL}/api/living-assessment/parameter-sessions`,
      {
        language: LANGUAGE,
        experienceLevel: '5+ Years',
        userId: USER_ID,
      }
    );

    const sessionId = sessionResponse.data.sessionId;
    console.log(`   ✅ Session created: ${sessionId}`);

    // 2) Connect socket
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
    });

    // Listen for ALL events for debugging
    socket.onAny((eventName, data) => {
      if (eventName === 'ping' || eventName === 'pong') return;
      console.log(`\n📡 [${new Date().toISOString()}] Event: ${eventName}`);
      if (data) {
        const dataStr =
          typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        console.log(
          dataStr.length > 800 ? dataStr.substring(0, 800) + '...' : dataStr
        );
      }
    });

    // Explicit listeners for depth questions
    socket.on('chatMessage', (data) => {
      console.log('\n🎯 chatMessage received (possible depth question):');
      console.log(JSON.stringify(data, null, 2));
    });

    socket.on('newMessage', (data) => {
      console.log('\n🎯 newMessage received (possible depth question):');
      console.log(JSON.stringify(data, null, 2));
    });

    socket.on('connect', () => {
      console.log('\n✅ WebSocket connected');

      // 3) Join main room and assessment room for this new session
      console.log(`\n📤 Step 1: Joining room: ${sessionId}...`);
      socket.emit('joinRoom', {
        roomName: sessionId,
        userId: USER_ID,
        username: 'Stack Test User',
        language: LANGUAGE,
        experienceLevel: '5+ Years',
      });

      console.log(`\n📤 Step 2: Joining assessment room: ${sessionId}...`);
      socket.emit('joinAssessmentRoom', {
        sessionId,
        candidateId: USER_ID,
        role: 'candidate',
      });

      // 4) After a short delay, send the Stack code
      setTimeout(() => {
        console.log('\n📤 Step 3: Sending Stack code...');
        console.log(`   Code length: ${STACK_CODE.length} chars`);
        console.log('   Threshold: 150 chars');
        console.log(
          `   ✅ Meets threshold: ${STACK_CODE.length >= 150} (parameterDetectionConfig.codeThresholds.minimumCharacters)`
        );

        // Emit standard codeChange (roomName-based)
        console.log(`\n📤 Emitting codeChange to ${sessionId}...`);
        socket.emit('codeChange', {
          roomName: sessionId,
          questionId: QUESTION_ID,
          code: STACK_CODE,
          language: LANGUAGE,
          userId: USER_ID,
        });

        // Emit assessmentCodeChange (assessment socket handler)
        console.log(`\n📤 Emitting assessmentCodeChange to ${sessionId}...`);
        socket.emit('assessmentCodeChange', {
          sessionId,
          questionId: QUESTION_ID,
          code: STACK_CODE,
          language: LANGUAGE,
        });

        console.log(
          '\n⏳ Waiting for backend to analyze code and (maybe) generate a depth question...'
        );
      }, 2500);

      // 5) After some time, print a summary & exit
      setTimeout(() => {
        console.log(
          '\n⏰ Test window elapsed (30s). If no depth question appeared above, the backend did not generate one for this Stack implementation.'
        );
        console.log('='.repeat(60));
        socket.disconnect();
        process.exit(0);
      }, 30000);
    });

    socket.on('error', (err) => {
      console.error('\n❌ Socket error:', err);
    });

    socket.on('disconnect', () => {
      console.log('\n🔌 Socket disconnected');
    });
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testStackDepthScenario();


