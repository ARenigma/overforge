/**
 * Test if the new modules can be required correctly
 */

console.log('🧪 Testing module imports...');

try {
    const ApproachDetector = require('./backend/src/services/approach-detector');
    console.log('✅ ApproachDetector imported successfully');
    console.log('   Methods:', Object.getOwnPropertyNames(ApproachDetector).filter(name => typeof ApproachDetector[name] === 'function'));
    
    const ProblemDetector = require('./backend/src/services/problem-detector');
    console.log('✅ ProblemDetector imported successfully');
    console.log('   Methods:', Object.getOwnPropertyNames(ProblemDetector).filter(name => typeof ProblemDetector[name] === 'function'));
    
    const QuestionTemplates = require('./backend/src/services/question-templates');
    console.log('✅ QuestionTemplates imported successfully');
    console.log('   Methods:', Object.getOwnPropertyNames(QuestionTemplates).filter(name => typeof QuestionTemplates[name] === 'function'));
    
    // Test a simple call
    const testCode = 'class TreeNode { insertNode() { this.insertNode(); } }';
    const approach = ApproachDetector.detectApproach(testCode, 'javascript');
    console.log('✅ ApproachDetector.detectApproach works:', approach.type);
    
    const problem = ProblemDetector.detectProblemType(testCode, 'javascript');
    console.log('✅ ProblemDetector.detectProblemType works:', problem.problemType);
    
} catch (error) {
    console.error('❌ Error importing modules:', error.message);
    console.error('   Stack:', error.stack);
}

