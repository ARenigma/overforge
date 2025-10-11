/**
 * Test the fallback question generation directly
 */

const io = require('socket.io-client');
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5001';
const SOCKET_URL = 'http://localhost:5001';

async function testFallbackOnly() {
    console.log('🔍 TESTING FALLBACK QUESTION GENERATION');
    console.log('This test will force the system to use fallback questions');
    console.log('=' .repeat(60));

    try {
        // Create session
        const sessionResponse = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
            language: 'javascript',
            experienceLevel: 'senior',
            userId: 'fallback-test'
        });

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Session created: ${sessionId}`);

        // Test the living AI interviewer fallback directly
        const testCode = `class TreeNode {
    insertNode(node, val) {
        this.insertNode(node.left, val); // RECURSIVE
    }
}`;

        console.log('📤 Testing approach detection on BST code...');
        
        // Test our modules directly first
        const ApproachDetector = require('./backend/src/services/approach-detector');
        const ProblemDetector = require('./backend/src/services/problem-detector');
        const QuestionTemplates = require('./backend/src/services/question-templates');
        
        const detectedApproach = ApproachDetector.detectApproach(testCode, 'javascript');
        const detectedProblem = ProblemDetector.detectProblemType(testCode, 'javascript');
        
        console.log(`✅ Direct Detection Results:`);
        console.log(`   Approach: ${detectedApproach.type} (${(detectedApproach.confidence * 100).toFixed(1)}%)`);
        console.log(`   Problem: ${detectedProblem.problemType} (ID: ${detectedProblem.problemId})`);
        
        if (QuestionTemplates.hasTemplatesForApproach(detectedApproach.type)) {
            console.log(`✅ Templates available for: ${detectedApproach.type}`);
            
            const question1 = QuestionTemplates.getQuestionForApproach(detectedApproach.type, 0);
            const question2 = QuestionTemplates.getQuestionForApproach(detectedApproach.type, 1);
            const question3 = QuestionTemplates.getQuestionForApproach(detectedApproach.type, 2);
            
            console.log(`\n📝 TEMPLATE QUESTIONS:`);
            console.log(`Q1: "${question1}"`);
            console.log(`Q2: "${question2}"`);
            console.log(`Q3: "${question3}"`);
            
            if (question1.includes('recursive') || question1.includes('iterative')) {
                console.log(`\n✅ SUCCESS! Template questions are approach-specific!`);
            } else {
                console.log(`\n❌ Templates are not approach-specific enough`);
            }
        } else {
            console.log(`❌ No templates for approach: ${detectedApproach.type}`);
        }

    } catch (error) {
        console.error('❌ Test error:', error.message);
        console.error('   Stack:', error.stack);
    }
}

testFallbackOnly();

