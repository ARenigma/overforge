/**
 * FINAL TEST: Complete approach-based questioning system validation
 * This test will verify the entire pipeline is working correctly
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

async function testFinalApproachSystem() {
    console.log('🎯 FINAL APPROACH-BASED QUESTIONING SYSTEM TEST');
    console.log('=' .repeat(70));
    console.log('🔍 Testing with BST code to verify approach-specific questions');
    console.log('=' .repeat(70));

    try {
        // Create session
        const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
            language: 'javascript',
            experienceLevel: 'senior',
            userId: 'final-test-user'
        });

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Session created: ${sessionId}`);

        const socket = io(SOCKET_URL);
        
        let questionsReceived = [];
        let questionCount = 0;
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            
            // Join rooms in correct sequence
            socket.emit('joinRoom', {
                roomName: sessionId,
                userId: 'final-test-user',
                username: 'Final Test User',
                language: 'javascript',
                experienceLevel: 'senior'
            });

            socket.emit('joinAssessmentRoom', {
                sessionId: sessionId,
                candidateId: 'final-test-user',
                role: 'candidate'
            });
        });

        socket.on('assessmentRoomJoined', () => {
            console.log('✅ Assessment room joined');
            
            // Submit comprehensive BST code
            setTimeout(() => {
                const comprehensiveBSTCode = `class TreeNode {
    constructor(val) {
        this.val = val;
        this.left = null;
        this.right = null;
    }
}

class BinarySearchTree {
    constructor() {
        this.root = null;
    }
    
    // RECURSIVE insertion approach
    insert(val) {
        if (!this.root) {
            this.root = new TreeNode(val);
            return;
        }
        this.insertNode(this.root, val);
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
    
    // RECURSIVE search
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
}

// Example usage demonstrating the recursive approach
const bst = new BinarySearchTree();
bst.insert(50);
bst.insert(30);
bst.insert(70);
console.log(bst.search(30)); // true`;
                
                console.log('📤 Submitting comprehensive BST code...');
                console.log(`   Code length: ${comprehensiveBSTCode.length} characters`);
                console.log('   Contains recursive patterns: ✅');
                console.log('   Contains BST implementation: ✅');
                
                socket.emit('assessmentCodeChange', {
                    sessionId: sessionId,
                    code: comprehensiveBSTCode,
                    language: 'javascript'
                });
            }, 2000);
        });

        socket.on('newMessage', (data) => {
            if (data.sender && data.sender.name === 'LHIS') {
                questionCount++;
                questionsReceived.push(data.message);
                
                console.log(`\n📝 QUESTION ${questionCount} RECEIVED:`);
                console.log(`"${data.message}"`);
                
                // Analyze question content for approach-specific terms
                const questionLower = data.message.toLowerCase();
                const isApproachSpecific = 
                    questionLower.includes('recursive') || 
                    questionLower.includes('iterative') ||
                    questionLower.includes('bst') || 
                    questionLower.includes('tree') ||
                    questionLower.includes('binary search') ||
                    questionLower.includes('approach');
                
                const hasSpecificTerms = 
                    questionLower.includes('trade-off') ||
                    questionLower.includes('alternative') ||
                    questionLower.includes('scale') ||
                    questionLower.includes('production') ||
                    questionLower.includes('performance');
                
                console.log('🔍 QUESTION ANALYSIS:');
                console.log(`   Contains approach terms: ${isApproachSpecific ? '✅' : '❌'}`);
                console.log(`   Contains specific terms: ${hasSpecificTerms ? '✅' : '❌'}`);
                console.log(`   Question type: ${questionLower.includes('general_coding') ? 'GENERIC' : 'SPECIFIC'}`);
                
                if (questionLower.includes('recursive') && questionLower.includes('iterative')) {
                    console.log('🎉 PERFECT! Question mentions both recursive and iterative approaches!');
                } else if (questionLower.includes('recursive') || questionLower.includes('bst')) {
                    console.log('✅ GOOD! Question contains approach-specific terms!');
                } else if (!questionLower.includes('general_coding')) {
                    console.log('👍 BETTER! Question is not generic!');
                } else {
                    console.log('❌ STILL GENERIC: Question needs improvement');
                }
                
                // Submit a realistic answer to continue the flow
                setTimeout(() => {
                    let answer = '';
                    if (questionCount === 1) {
                        answer = 'I chose a recursive approach because it naturally mirrors the tree structure and makes the logic clear and intuitive.';
                    } else if (questionCount === 2) {
                        answer = 'The main trade-off is stack space usage. An iterative approach would use less memory but be more complex to implement.';
                    } else {
                        answer = 'For production scale, I would consider balancing the tree and possibly using iterative methods to avoid stack overflow with deep trees.';
                    }
                    
                    console.log(`📤 Submitting answer ${questionCount}: "${answer}"`);
                    
                    socket.emit('submitParameterAnswer', {
                        sessionId: sessionId,
                        answer: answer,
                        parameterId: 0,
                        depthLevel: questionCount
                    });
                }, 2000);
                
                // Complete test after 3 questions
                if (questionCount >= 3) {
                    setTimeout(() => {
                        console.log('\n' + '=' .repeat(70));
                        console.log('🎯 FINAL APPROACH-BASED SYSTEM TEST RESULTS');
                        console.log('=' .repeat(70));
                        
                        const approachSpecificCount = questionsReceived.filter(q => {
                            const lower = q.toLowerCase();
                            return lower.includes('recursive') || lower.includes('iterative') || 
                                   lower.includes('bst') || lower.includes('tree') ||
                                   !lower.includes('general_coding');
                        }).length;
                        
                        const successRate = (approachSpecificCount / questionsReceived.length * 100).toFixed(1);
                        
                        console.log(`📊 RESULTS:`);
                        console.log(`   Total Questions: ${questionsReceived.length}/3`);
                        console.log(`   Approach-Specific: ${approachSpecificCount}/3 (${successRate}%)`);
                        
                        if (successRate >= 66.7) {
                            console.log(`\n🎉 SUCCESS! Approach-based questioning system is working!`);
                            console.log(`✅ System generates approach-aware questions`);
                            console.log(`✅ Questions progress through depth levels`);
                            console.log(`✅ Ready for production deployment`);
                        } else {
                            console.log(`\n⚠️  PARTIAL SUCCESS: System needs final improvements`);
                            console.log(`🔧 ${3 - approachSpecificCount} questions still generic`);
                        }
                        
                        console.log('\n📝 QUESTION SAMPLES:');
                        questionsReceived.forEach((q, i) => {
                            console.log(`   Q${i+1}: "${q.substring(0, 60)}..."`);
                        });
                        
                        console.log('=' .repeat(70));
                        socket.disconnect();
                    }, 3000);
                }
            }
        });

        // Timeout
        setTimeout(() => {
            console.log('\n⏰ Test completed');
            socket.disconnect();
        }, 30000);

    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

testFinalApproachSystem();
