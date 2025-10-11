/**
 * Test LHIS integration with detailed logging
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

async function testLHISDebug() {
    console.log('🔍 LHIS INTEGRATION DEBUG TEST');
    console.log('=' .repeat(50));

    try {
        // Create session
        const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
            language: 'javascript',
            experienceLevel: 'senior',
            userId: 'lhis-debug'
        });

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Session created: ${sessionId}`);

        const socket = io(SOCKET_URL);
        
        // Listen for ALL events to see what's happening
        socket.onAny((eventName, data) => {
            if (eventName !== 'ping' && eventName !== 'pong') {
                console.log(`📡 Event: ${eventName}`, data ? JSON.stringify(data).substring(0, 100) + '...' : '');
            }
        });
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            
            // Join rooms
            socket.emit('joinRoom', {
                roomName: sessionId,
                userId: 'lhis-debug',
                username: 'Debug User',
                language: 'javascript',
                experienceLevel: 'senior'
            });

            socket.emit('joinAssessmentRoom', {
                sessionId: sessionId,
                candidateId: 'lhis-debug',
                role: 'candidate'
            });
        });

        socket.on('assessmentRoomJoined', () => {
            console.log('✅ Assessment room joined');
            
            // Submit code that should trigger approach detection
            setTimeout(() => {
                const testCode = `class TreeNode {
    constructor(val) {
        this.val = val;
        this.left = null;
        this.right = null;
    }
}

class BST {
    insertNode(node, val) {
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
    
    search(val) {
        return this.searchNode(this.root, val);
    }
    
    searchNode(node, val) {
        if (!node) return false;
        if (val === node.val) return true;
        return val < node.val ? 
            this.searchNode(node.left, val) : 
            this.searchNode(node.right, val);
    }
}`;
                
                console.log('📤 Submitting BST code with clear recursive patterns...');
                console.log('   Code length:', testCode.length);
                console.log('   Contains "insertNode":', testCode.includes('insertNode'));
                console.log('   Contains "this.insertNode":', testCode.includes('this.insertNode'));
                console.log('   Contains "TreeNode":', testCode.includes('TreeNode'));
                
                socket.emit('assessmentCodeChange', {
                    sessionId: sessionId,
                    code: testCode,
                    language: 'javascript'
                });
            }, 2000);
        });

        // Timeout and cleanup
        setTimeout(() => {
            console.log('\n⏰ Test completed - disconnecting');
            socket.disconnect();
        }, 20000);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testLHISDebug();

