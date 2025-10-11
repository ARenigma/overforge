/**
 * Debug single question generation to see what's happening
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

async function debugSingleQuestion() {
    console.log('🔍 DEBUG: Single Question Generation');
    console.log('=' .repeat(50));

    try {
        // Create session
        const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
            language: 'javascript',
            experienceLevel: 'senior',
            userId: 'debug-user'
        });

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Session created: ${sessionId}`);

        const socket = io(SOCKET_URL);
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            
            // Join rooms
            socket.emit('joinRoom', {
                roomName: sessionId,
                userId: 'debug-user',
                username: 'Debug User',
                language: 'javascript',
                experienceLevel: 'senior'
            });

            socket.emit('joinAssessmentRoom', {
                sessionId: sessionId,
                candidateId: 'debug-user',
                role: 'candidate'
            });
        });

        socket.on('assessmentRoomJoined', () => {
            console.log('✅ Assessment room joined');
            
            // Submit BST code
            setTimeout(() => {
                const bstCode = `class TreeNode {
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
        if (val < node.val) {
            if (!node.left) {
                node.left = new TreeNode(val);
            } else {
                this.insertNode(node.left, val);
            }
        } else {
            if (!node.right) {
                node.right = new TreeNode(val);
            } else {
                this.insertNode(node.right, val);
            }
        }
    }
}`;
                
                console.log('📤 Submitting BST code...');
                socket.emit('assessmentCodeChange', {
                    sessionId: sessionId,
                    code: bstCode,
                    language: 'javascript'
                });
            }, 1000);
        });

        socket.on('newMessage', (data) => {
            if (data.sender && data.sender.name === 'LHIS') {
                console.log('\n📝 QUESTION RECEIVED:');
                console.log(`"${data.message}"`);
                console.log('\n🔍 ANALYSIS:');
                
                const questionLower = data.message.toLowerCase();
                console.log(`- Contains "recursive": ${questionLower.includes('recursive')}`);
                console.log(`- Contains "approach": ${questionLower.includes('approach')}`);
                console.log(`- Contains "bst" or "tree": ${questionLower.includes('bst') || questionLower.includes('tree')}`);
                console.log(`- Contains "iterative": ${questionLower.includes('iterative')}`);
                
                if (questionLower.includes('recursive') || questionLower.includes('iterative')) {
                    console.log('✅ APPROACH-SPECIFIC QUESTION DETECTED!');
                } else {
                    console.log('❌ GENERIC QUESTION - APPROACH DETECTION NOT WORKING IN INTEGRATION');
                }
                
                socket.disconnect();
            }
        });

        socket.on('debugMessage', (data) => {
            console.log('🐛 DEBUG:', data.message);
        });

        // Timeout
        setTimeout(() => {
            console.log('\n⏰ Test timeout - disconnecting');
            socket.disconnect();
        }, 30000);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugSingleQuestion();

