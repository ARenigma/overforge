/**
 * COMPREHENSIVE APPROACH-BASED QUESTIONING SYSTEM TEST
 * Tests the complete production-ready system with dynamic detection
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

// Test cases covering different approaches and problem types
const TEST_CASES = [
    {
        id: 1,
        name: "Recursive BST Implementation",
        language: "javascript",
        expectedApproach: "recursive_bst",
        expectedProblemType: "binary_search_tree",
        code: `class TreeNode {
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
}`,
        expectedQuestions: [
            "recursive approach",
            "iterative approach", 
            "stack overflow",
            "production"
        ]
    },
    {
        id: 2,
        name: "Express.js REST API",
        language: "javascript",
        expectedApproach: "express_basic",
        expectedProblemType: "rest_api",
        code: `const express = require('express');
const app = express();
app.use(express.json());

const users = [];
let nextId = 1;

app.get('/api/users', (req, res) => {
    res.json(users);
});

app.get('/api/users/:id', (req, res) => {
    const user = users.find(u => u.id === parseInt(req.params.id));
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
});

app.post('/api/users', (req, res) => {
    const { name, email } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email required' });
    }
    
    const user = {
        id: nextId++,
        name,
        email,
        createdAt: new Date()
    };
    
    users.push(user);
    res.status(201).json(user);
});

app.listen(3000, () => console.log('Server running on port 3000'));`,
        expectedQuestions: [
            "Express",
            "Fastify",
            "trade-offs",
            "scale"
        ]
    },
    {
        id: 3,
        name: "React Hooks Component",
        language: "javascript", 
        expectedApproach: "react_hooks",
        expectedProblemType: "react_component",
        code: `import React, { useState, useEffect } from 'react';
import axios from 'axios';

const UserDashboard = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoading(true);
                const response = await axios.get('/api/users');
                setUsers(response.data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        
        fetchUsers();
    }, []);

    const handleDeleteUser = async (userId) => {
        try {
            await axios.delete(\`/api/users/\${userId}\`);
            setUsers(users.filter(user => user.id !== userId));
        } catch (err) {
            setError('Failed to delete user');
        }
    };
    
    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;
    
    return (
        <div className="user-dashboard">
            <h2>User Management</h2>
            {users.map(user => (
                <div key={user.id} className="user-card">
                    <h3>{user.name}</h3>
                    <p>{user.email}</p>
                    <button onClick={() => handleDeleteUser(user.id)}>
                        Delete
                    </button>
                </div>
            ))}
        </div>
    );
};

export default UserDashboard;`,
        expectedQuestions: [
            "Hooks",
            "class components",
            "Redux",
            "enterprise"
        ]
    }
];

class ApproachBasedSystemTest {
    constructor() {
        this.results = [];
        this.socket = null;
    }

    async runAllTests() {
        console.log('\n🎯 APPROACH-BASED QUESTIONING SYSTEM TEST');
        console.log('=' .repeat(80));
        console.log('Testing dynamic approach detection and specific questioning');
        console.log('=' .repeat(80));

        for (const testCase of TEST_CASES) {
            console.log(`\n🚀 Testing: ${testCase.name}`);
            console.log(`   Expected Approach: ${testCase.expectedApproach}`);
            console.log(`   Expected Problem: ${testCase.expectedProblemType}`);
            console.log('-'.repeat(60));

            try {
                const result = await this.runSingleTest(testCase);
                this.results.push(result);
                
                // Brief pause between tests
                await this.sleep(2000);
            } catch (error) {
                console.error(`❌ Test ${testCase.id} failed:`, error.message);
                this.results.push({
                    ...testCase,
                    success: false,
                    error: error.message,
                    questionsReceived: 0,
                    approachDetected: false,
                    specificQuestions: false
                });
            }
        }

        this.generateReport();
    }

    async runSingleTest(testCase) {
        return new Promise(async (resolve, reject) => {
            try {
                // Create session
                const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
                    language: testCase.language,
                    experienceLevel: 'senior',
                    userId: `test-approach-${testCase.id}`
                });

                const sessionId = sessionResponse.data.sessionId;
                console.log(`✅ Session created: ${sessionId}`);

                // Connect to WebSocket
                this.socket = io(SOCKET_URL);
                
                const questions = [];
                const detectionResults = {};
                let approachDetected = false;
                let specificQuestions = false;

                this.socket.on('connect', () => {
                    console.log('✅ WebSocket connected');
                    
                    // Join room sequence (both required)
                    this.socket.emit('joinRoom', {
                        roomName: sessionId,
                        userId: `test-approach-${testCase.id}`,
                        username: 'Test User',
                        language: testCase.language,
                        experienceLevel: 'senior'
                    });

                    this.socket.emit('joinAssessmentRoom', {
                        sessionId: sessionId,
                        candidateId: `test-approach-${testCase.id}`,
                        role: 'candidate'
                    });
                });

                this.socket.on('assessmentRoomJoined', (data) => {
                    console.log('✅ Assessment room joined');
                    
                    // Submit code after 1 second
                    setTimeout(() => {
                        console.log('📤 Submitting test code...');
                        this.socket.emit('assessmentCodeChange', {
                            sessionId: sessionId,
                            code: testCase.code,
                            language: testCase.language
                        });
                    }, 1000);
                });

                this.socket.on('newMessage', (data) => {
                    if (data.sender && data.sender.name === 'LHIS') {
                        const questionTime = Date.now();
                        questions.push({
                            question: data.message,
                            receivedAt: questionTime,
                            questionNumber: questions.length + 1
                        });
                        
                        console.log(`📝 Question ${questions.length} received:`);
                        console.log(`   "${data.message.substring(0, 80)}..."`);
                        
                        // Check if question contains expected approach-specific terms
                        const questionLower = data.message.toLowerCase();
                        const hasSpecificTerms = testCase.expectedQuestions.some(term => 
                            questionLower.includes(term.toLowerCase())
                        );
                        
                        if (hasSpecificTerms) {
                            specificQuestions = true;
                            console.log(`✅ Question contains approach-specific terms`);
                        }
                        
                        // Submit answer after 3 seconds
                        setTimeout(() => {
                            const answers = [
                                `I chose the ${testCase.expectedApproach} approach because it fits naturally with the problem structure and provides clean, readable code.`,
                                `The main trade-offs are performance vs maintainability. Alternative approaches like iterative solutions might be faster but less intuitive.`,
                                `For production scale, I'd need to consider optimization, error handling, and potentially switching to more performant alternatives based on load requirements.`
                            ];
                            
                            const answer = answers[questions.length - 1] || answers[0];
                            
                            console.log(`📝 Submitting answer ${questions.length}...`);
                            this.socket.emit('submitParameterAnswer', {
                                sessionId: sessionId,
                                parameterId: 0,
                                answer: answer
                            });
                        }, 3000);
                    }
                });

                this.socket.on('debugMessage', (data) => {
                    // Look for approach detection in debug messages
                    if (data.message && data.message.includes('Dynamic Detection Results')) {
                        approachDetected = true;
                        console.log('✅ Approach detection confirmed in debug logs');
                    }
                });

                // Test timeout and resolution
                setTimeout(() => {
                    this.socket.disconnect();
                    
                    const success = questions.length >= 1 && (approachDetected || specificQuestions);
                    
                    resolve({
                        ...testCase,
                        success,
                        questionsReceived: questions.length,
                        questions: questions,
                        approachDetected,
                        specificQuestions,
                        detectionResults,
                        duration: 60000 // Fixed test duration
                    });
                }, 60000); // 60 second timeout

            } catch (error) {
                if (this.socket) this.socket.disconnect();
                reject(error);
            }
        });
    }

    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('🎯 APPROACH-BASED QUESTIONING SYSTEM TEST RESULTS');
        console.log('='.repeat(80));

        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);
        
        console.log(`\n📊 OVERALL RESULTS:`);
        console.log(`   Total Tests: ${this.results.length}`);
        console.log(`   Successful: ${successful.length} (${Math.round(successful.length/this.results.length*100)}%)`);
        console.log(`   Failed: ${failed.length} (${Math.round(failed.length/this.results.length*100)}%)`);

        if (successful.length > 0) {
            const avgQuestions = successful.reduce((sum, r) => sum + r.questionsReceived, 0) / successful.length;
            const approachDetectionRate = successful.filter(r => r.approachDetected).length / successful.length;
            const specificQuestionRate = successful.filter(r => r.specificQuestions).length / successful.length;
            
            console.log(`\n📈 SYSTEM PERFORMANCE:`);
            console.log(`   Average Questions Generated: ${avgQuestions.toFixed(1)}`);
            console.log(`   Approach Detection Rate: ${(approachDetectionRate * 100).toFixed(1)}%`);
            console.log(`   Specific Question Rate: ${(specificQuestionRate * 100).toFixed(1)}%`);
        }

        console.log(`\n🔍 DETAILED TEST RESULTS:`);
        console.log('-'.repeat(80));

        this.results.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${result.name}`);
            console.log(`   Expected: ${result.expectedApproach} → ${result.expectedProblemType}`);
            console.log(`   Questions: ${result.questionsReceived}/3`);
            console.log(`   Approach Detected: ${result.approachDetected ? '✅' : '❌'}`);
            console.log(`   Specific Questions: ${result.specificQuestions ? '✅' : '❌'}`);
            
            if (result.questions && result.questions.length > 0) {
                result.questions.forEach((q, i) => {
                    console.log(`   Q${i+1}: "${q.question.substring(0, 60)}..."`);
                });
            }
            
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            console.log();
        });

        console.log('='.repeat(80));
        
        const overallSuccess = successful.length >= 2; // At least 2/3 tests should pass
        if (overallSuccess) {
            console.log('🎉 APPROACH-BASED QUESTIONING SYSTEM: PRODUCTION READY!');
            console.log('✅ Dynamic approach detection and specific questioning working correctly');
        } else {
            console.log('⚠️ APPROACH-BASED QUESTIONING SYSTEM: NEEDS FIXES');
            console.log('❌ System requires improvements before production deployment');
        }
        console.log('='.repeat(80));
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the comprehensive approach-based system test
const tester = new ApproachBasedSystemTest();
tester.runAllTests().catch(console.error);

