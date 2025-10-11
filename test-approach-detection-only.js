/**
 * Quick test to verify approach detection is working
 */

// Test the approach detector directly
const ApproachDetector = require('./backend/src/services/approach-detector');
const ProblemDetector = require('./backend/src/services/problem-detector');

console.log('🧪 TESTING APPROACH DETECTION DIRECTLY');
console.log('=' .repeat(60));

const testCases = [
    {
        name: "Recursive BST",
        code: `class TreeNode {
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
                this.insertNode(node.left, val);
            }
        }
    }
}`,
        expected: "recursive_bst"
    },
    {
        name: "Express API",
        code: `const express = require('express');
const app = express();

app.get('/api/users', (req, res) => {
    res.json(users);
});

app.post('/api/users', (req, res) => {
    const user = { name: req.body.name };
    users.push(user);
    res.json(user);
});`,
        expected: "express_basic"
    }
];

testCases.forEach((testCase, index) => {
    console.log(`\n🔍 Test ${index + 1}: ${testCase.name}`);
    console.log(`Expected: ${testCase.expected}`);
    
    try {
        const detectedApproach = ApproachDetector.detectApproach(testCase.code, 'javascript');
        const detectedProblem = ProblemDetector.detectProblemType(testCase.code, 'javascript');
        
        console.log(`✅ Detected Approach: ${detectedApproach.type} (${(detectedApproach.confidence * 100).toFixed(1)}%)`);
        console.log(`✅ Detected Problem: ${detectedProblem.problemType} (ID: ${detectedProblem.problemId})`);
        console.log(`   Characteristics: ${JSON.stringify(detectedApproach.details?.characteristics || [])}`);
        
        const success = detectedApproach.type === testCase.expected;
        console.log(`${success ? '✅' : '❌'} Detection ${success ? 'SUCCESS' : 'FAILED'}`);
        
    } catch (error) {
        console.error(`❌ Error:`, error.message);
    }
});

console.log('\n' + '=' .repeat(60));

