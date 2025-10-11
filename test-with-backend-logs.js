/**
 * Test with backend log monitoring
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

async function testWithLogs() {
    console.log('🔍 TESTING WITH BACKEND LOG MONITORING');
    console.log('=' .repeat(60));
    console.log('NOTE: Check the backend console for debug messages like:');
    console.log('  - "🔍 LHIS: Starting dynamic approach detection..."');
    console.log('  - "🔍 LHIS: Dynamic Detection Results:"');
    console.log('=' .repeat(60));

    try {
        // Create session
        const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
            language: 'javascript',
            experienceLevel: 'senior',
            userId: 'backend-log-test'
        });

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Session created: ${sessionId}`);

        const socket = io(SOCKET_URL);
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            
            socket.emit('joinRoom', {
                roomName: sessionId,
                userId: 'backend-log-test',
                username: 'Log Test User',
                language: 'javascript',
                experienceLevel: 'senior'
            });

            socket.emit('joinAssessmentRoom', {
                sessionId: sessionId,
                candidateId: 'backend-log-test',
                role: 'candidate'
            });
        });

        socket.on('assessmentRoomJoined', () => {
            console.log('✅ Assessment room joined');
            
            setTimeout(() => {
                const testCode = `class TreeNode {
    constructor(val) {
        this.val = val;
        this.left = null;
        this.right = null;
    }
}

class BST {
    constructor() {
        this.root = null;
    }
    
    insertNode(node, val) {
        // This is a RECURSIVE implementation
        if (val < node.val) {
            if (!node.left) {
                node.left = new TreeNode(val);
            } else {
                this.insertNode(node.left, val); // RECURSIVE CALL
            }
        } else {
            if (!node.right) {
                node.right = new TreeNode(val);
            } else {
                this.insertNode(node.right, val); // RECURSIVE CALL
            }
        }
    }
}`;
                
                console.log('📤 Submitting BST code (should trigger approach detection)...');
                console.log('   Code contains "insertNode":', testCode.includes('insertNode'));
                console.log('   Code contains "this.insertNode":', testCode.includes('this.insertNode'));
                console.log('   Code contains "TreeNode":', testCode.includes('TreeNode'));
                console.log('   Code length:', testCode.length);
                
                socket.emit('assessmentCodeChange', {
                    sessionId: sessionId,
                    code: testCode,
                    language: 'javascript'
                });
                
                console.log('\n🔍 NOW CHECK THE BACKEND CONSOLE FOR:');
                console.log('   1. "🔍 LHIS: Starting dynamic approach detection..."');
                console.log('   2. "🔍 LHIS: Modules loaded, detecting approach for code length: XXX"');
                console.log('   3. "🔍 LHIS: Detection completed successfully"');
                console.log('   4. "🔍 LHIS: Dynamic Detection Results:"');
                console.log('   5. "   Approach: recursive_bst (XX.X%)"');
                console.log('\nIf you see error messages instead, that\'s the problem!');
            }, 2000);
        });

        socket.on('newMessage', (data) => {
            if (data.sender && data.sender.name === 'LHIS') {
                console.log('\n📝 QUESTION RECEIVED:');
                console.log(`"${data.message}"`);
                
                const questionLower = data.message.toLowerCase();
                if (questionLower.includes('recursive') || questionLower.includes('iterative') || 
                    questionLower.includes('bst') || questionLower.includes('tree')) {
                    console.log('\n✅ SUCCESS! Approach-specific question detected!');
                } else {
                    console.log('\n❌ STILL GENERIC - Check backend logs for errors');
                }
                
                socket.disconnect();
            }
        });

        // Timeout
        setTimeout(() => {
            console.log('\n⏰ Test completed');
            socket.disconnect();
        }, 15000);

    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

testWithLogs();

