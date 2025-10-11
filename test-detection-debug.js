/**
 * Test approach and problem detection with the exact code we're submitting
 */

const ApproachDetector = require('./backend/src/services/approach-detector');
const ProblemDetector = require('./backend/src/services/problem-detector');

console.log('🧪 TESTING APPROACH & PROBLEM DETECTION');
console.log('=' .repeat(60));

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

console.log('📝 Test Code:');
console.log('   Length:', testCode.length);
console.log('   Contains "TreeNode":', testCode.includes('TreeNode'));
console.log('   Contains "insertNode":', testCode.includes('insertNode'));
console.log('   Contains "this.insertNode":', testCode.includes('this.insertNode'));
console.log('   Contains "BST":', testCode.includes('BST'));

console.log('\n🔍 APPROACH DETECTION:');
try {
    const detectedApproach = ApproachDetector.detectApproach(testCode, 'javascript');
    console.log('✅ Success!');
    console.log('   Type:', detectedApproach.type);
    console.log('   Confidence:', (detectedApproach.confidence * 100).toFixed(1) + '%');
    console.log('   Characteristics:', JSON.stringify(detectedApproach.details?.characteristics || []));
    
    if (detectedApproach.type === 'recursive_bst') {
        console.log('✅ CORRECT: Detected as recursive_bst');
    } else {
        console.log(`❌ INCORRECT: Expected recursive_bst, got ${detectedApproach.type}`);
    }
} catch (error) {
    console.error('❌ Error:', error.message);
}

console.log('\n🔍 PROBLEM DETECTION:');
try {
    const detectedProblem = ProblemDetector.detectProblemType(testCode, 'javascript');
    console.log('✅ Success!');
    console.log('   Type:', detectedProblem.problemType);
    console.log('   ID:', detectedProblem.problemId);
    console.log('   Confidence:', (detectedProblem.confidence * 100).toFixed(1) + '%');
    console.log('   Category:', detectedProblem.category);
    
    if (detectedProblem.problemType === 'binary_search_tree') {
        console.log('✅ CORRECT: Detected as binary_search_tree');
    } else {
        console.log(`❌ INCORRECT: Expected binary_search_tree, got ${detectedProblem.problemType}`);
    }
} catch (error) {
    console.error('❌ Error:', error.message);
}

console.log('\n' + '=' .repeat(60));
