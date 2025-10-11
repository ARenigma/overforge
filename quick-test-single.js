const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

async function quickTest() {
    console.log('🚀 Quick Single Test - Binary Search Tree');
    
    try {
        // Create session
        const response = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
            language: 'javascript',
            experienceLevel: 'senior',
            userId: 'test-user-1'
        });
        
        const sessionId = response.data.sessionId;
        console.log(`✅ Session created: ${sessionId}`);
        
        // Connect to WebSocket
        const socket = io(SOCKET_URL);
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            
            // First join room to initialize parameter session
            socket.emit('joinRoom', {
                roomName: sessionId,
                userId: 'test-user-1',
                username: 'Test User',
                language: 'javascript',
                experienceLevel: 'senior'
            });

            // Then join assessment room for LHIS
            socket.emit('joinAssessmentRoom', {
                sessionId: sessionId,
                candidateId: 'test-user-1',
                role: 'candidate'
            });
        });
        
        socket.on('assessmentRoomJoined', (data) => {
            console.log('✅ Assessment room joined:', data);
            
            // Submit code after 2 seconds
            setTimeout(() => {
                console.log('📤 Submitting code...');
                socket.emit('assessmentCodeChange', {
                    sessionId: sessionId,
                    code: `// Binary Search Tree implementation
class TreeNode {
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
    
    insert(val) {
        if (!this.root) {
            this.root = new TreeNode(val);
            return;
        }
        this.insertNode(this.root, val);
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
}`,
                    language: 'javascript'
                });
            }, 2000);
        });
        
        socket.on('newMessage', (data) => {
            if (data.sender && data.sender.name === 'LHIS') {
                console.log('📝 Question received:');
                console.log(`   "${data.message.substring(0, 100)}..."`);
                
                // Submit answer after 5 seconds
                setTimeout(() => {
                    console.log('📝 Submitting answer...');
                    socket.emit('submitParameterAnswer', {
                        sessionId: sessionId,
                        parameterId: 0,
                        answer: "I chose a recursive approach for BST operations because it naturally maps to the tree structure. The insertion follows the BST property where smaller values go left and larger go right."
                    });
                }, 5000);
            }
        });
        
        socket.on('chatMessage', (data) => {
            if (data.message && data.message.includes('✅')) {
                console.log('💬 Feedback received:', data.message);
            }
        });
        
        // End test after 60 seconds
        setTimeout(() => {
            console.log('🏁 Test completed');
            socket.disconnect();
            process.exit(0);
        }, 60000);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

quickTest();
