/**
 * Test script to reproduce the Fibonacci depth question issue
 * Exact scenario: session param-1765906716660-jjg14hb2b, question core-3, language java
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

// Exact session details from user's scenario
const SESSION_ID = 'param-1765906716660-jjg14hb2b';
const QUESTION_ID = 'core-3';
const LANGUAGE = 'java'; // User reported language as java, but code is JavaScript
const USER_ID = '96309db6-fcc6-49f1-9738-9fe2dd6b9640';

// Exact Fibonacci code the user wrote (188 chars - NOW ABOVE 150 char threshold!)
const FIBONACCI_CODE = `function fibonacci(n) {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const seq = [0, 1];
  for (let i = 2; i < n; i++) {
    seq.push(seq[i - 1] + seq[i - 2]);
  }
  return seq;
}`;

console.log(`\n✅ Using original Fibonacci code: ${FIBONACCI_CODE.length} chars (meets new 150 char threshold)`);

async function testFibonacciScenario() {
    console.log('🔍 TESTING FIBONACCI DEPTH QUESTION SCENARIO');
    console.log('='.repeat(60));
    console.log(`Session ID: ${SESSION_ID}`);
    console.log(`Question ID: ${QUESTION_ID}`);
    console.log(`Language: ${LANGUAGE}`);
    console.log(`Code length: ${FIBONACCI_CODE.length} chars`);
    console.log('='.repeat(60));

    try {
        const socket = io(SOCKET_URL, {
            transports: ['websocket'],
            reconnection: true
        });
        
        // Listen for ALL events to debug
        socket.onAny((eventName, data) => {
            if (eventName !== 'ping' && eventName !== 'pong') {
                console.log(`\n📡 [${new Date().toISOString()}] Event: ${eventName}`);
                if (data) {
                    const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
                    // Truncate very long messages
                    if (dataStr.length > 500) {
                        console.log(dataStr.substring(0, 500) + '...');
                    } else {
                        console.log(dataStr);
                    }
                }
            }
        });
        
        socket.on('connect', async () => {
            console.log('\n✅ WebSocket connected');
            
            // Step 0: Try to initialize parameter-based session first (if it doesn't exist)
            console.log('\n📤 Step 0: Initializing parameter-based session...');
            let actualSessionId = SESSION_ID;
            try {
                // Try API initialization first (creates session properly)
                const initResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
                    language: LANGUAGE,
                    experienceLevel: '5+ Years',
                    userId: USER_ID
                });
                actualSessionId = initResponse.data.sessionId;
                console.log('   ✅ Session initialized via API:', actualSessionId);
                console.log(`   📝 Using session ID: ${actualSessionId} (original was ${SESSION_ID})`);
            } catch (apiErr) {
                console.log('   ⚠️ API initialization failed (session may already exist):', apiErr.message);
                console.log(`   📝 Using original session ID: ${SESSION_ID}`);
                // Try socket initialization as fallback
                socket.emit('initializeAssessment', {
                    sessionId: SESSION_ID,
                    candidateId: USER_ID,
                    jobProfileId: null
                });
            }

            // Step 1: Join the room
            console.log(`\n📤 Step 1: Joining room: ${actualSessionId}...`);
            socket.emit('joinRoom', {
                roomName: actualSessionId,
                userId: USER_ID,
                username: 'Test User',
                language: LANGUAGE,
                experienceLevel: '5+ Years'
            });

            // Step 2: Join assessment room
            console.log(`\n📤 Step 2: Joining assessment room: ${actualSessionId}...`);
            socket.emit('joinAssessmentRoom', {
                sessionId: actualSessionId,
                candidateId: USER_ID,
                role: 'candidate'
            });

            // Step 3: Wait a bit, then send code change
            setTimeout(() => {
                console.log('\n📤 Step 3: Sending code change (assessmentCodeChange)...');
                console.log(`   Code length: ${FIBONACCI_CODE.length} chars`);
                console.log(`   Minimum required: 150 chars (updated threshold)`);
                console.log(`   ✅ Meets threshold: ${FIBONACCI_CODE.length >= 150}`);
                console.log(`   Code preview: ${FIBONACCI_CODE.substring(0, 100)}...`);
                console.log(`   ⚠️ Note: Language is ${LANGUAGE} but code is JavaScript - this mismatch might cause issues!`);
                
                // Use the actual session ID
                const sessionIdToUse = actualSessionId || SESSION_ID;
                
                // Send both events like the frontend does
                console.log(`\n📤 Sending codeChange event to session: ${sessionIdToUse}...`);
                socket.emit('codeChange', {
                    roomName: sessionIdToUse,
                    questionId: QUESTION_ID,
                    code: FIBONACCI_CODE,
                    language: LANGUAGE,
                    userId: USER_ID
                });

                // Also send assessmentCodeChange (frontend sends this when code >= 150 chars)
                console.log(`\n📤 Sending assessmentCodeChange event to session: ${sessionIdToUse}...`);
                socket.emit('assessmentCodeChange', {
                    sessionId: sessionIdToUse,
                    questionId: QUESTION_ID,
                    code: FIBONACCI_CODE,
                    language: LANGUAGE
                });
                
                console.log(`\n⏳ Waiting for backend to process code analysis...`);
                console.log(`   Backend should check if code meets quality filters and detect parameters`);
            }, 3000); // Increased delay to allow session initialization

            // Step 4: Wait and check for depth question
            setTimeout(() => {
                console.log('\n⏰ Step 4: Waiting for depth question (5 seconds elapsed)...');
                console.log('   If no question received, checking session state...');
            }, 5000);

            // Step 5: Check session state via API if available
            setTimeout(async () => {
                try {
                    console.log('\n📊 Step 5: Checking session state...');
                    // Try to get session info if API exists
                    // This is optional - main test is socket events
                } catch (err) {
                    console.log('   (No API endpoint available for session check)');
                }
            }, 8000);
        });

        socket.on('error', (error) => {
            console.error('\n❌ Socket error:', error);
        });

        socket.on('disconnect', () => {
            console.log('\n🔌 Socket disconnected');
        });

        // Listen specifically for chat messages (depth questions)
        socket.on('chatMessage', (data) => {
            console.log('\n🎯 DEPTH QUESTION RECEIVED!');
            console.log(JSON.stringify(data, null, 2));
        });

        socket.on('newMessage', (data) => {
            console.log('\n🎯 NEW MESSAGE RECEIVED!');
            console.log(JSON.stringify(data, null, 2));
        });

        // Keep test running for 30 seconds
        setTimeout(() => {
            console.log('\n\n⏰ Test completed after 30 seconds');
            console.log('='.repeat(60));
            console.log('SUMMARY:');
            console.log('- Check logs above for:');
            console.log('  1. Code analysis completion');
            console.log('  2. Parameter detection');
            console.log('  3. Depth question generation');
            console.log('  4. Question emission');
            socket.disconnect();
            process.exit(0);
        }, 30000);

    } catch (error) {
        console.error('\n❌ Test error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testFibonacciScenario();

