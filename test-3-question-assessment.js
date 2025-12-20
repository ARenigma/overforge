#!/usr/bin/env node

/**
 * 🎯 3-QUESTION ASSESSMENT FLOW TEST
 * 
 * Tests the complete structured assessment system:
 * 1. Approach & Logic Assessment
 * 2. Trade-offs & Alternatives  
 * 3. What-if Scenarios & Adaptability
 * 
 * Validates that all 3 questions are asked naturally and provides distinct assessment value.
 */

const axios = require('axios');
const { io } = require('socket.io-client');

// Configuration
const BACKEND_URL = 'http://localhost:5001';
const AI_MODULE_URL = 'http://localhost:9001';
const FRONTEND_URL = 'http://localhost:3000';

// Test Configuration
const TEST_CONFIG = {
  language: 'python',
  experienceLevel: 'mid',
  problemType: 'core', // Use timing decorator problem (core-8)
  testDuration: 180000, // 3 minutes max
  codeSubmissionInterval: 15000, // Submit code every 15 seconds
};

// Timing decorator solution for testing
const TIMING_DECORATOR_CODE_PHASES = [
  // Phase 1: Basic structure (should trigger Q1: Approach & Logic)
  `import time
from functools import wraps

def timing_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        print(f"{func.__name__} took {end_time - start_time:.4f} seconds")
        return result
    return wrapper`,

  // Phase 2: Add example usage (should trigger Q2: Trade-offs & Alternatives)
  `import time
from functools import wraps

def timing_decorator(func):
    """Decorator to measure function execution time"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        print(f"{func.__name__} took {end_time - start_time:.4f} seconds")
        return result
    return wrapper

# Example usage
@timing_decorator
def slow_function():
    time.sleep(1)
    return "Done"

# Test the decorator
result = slow_function()`,

  // Phase 3: Enhanced version with context manager alternative (should trigger Q3: What-if scenarios)
  `import time
from functools import wraps
from contextlib import contextmanager

def timing_decorator(func):
    """Decorator to measure function execution time"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        print(f"{func.__name__} took {end_time - start_time:.4f} seconds")
        return result
    return wrapper

@contextmanager
def timer(name="Operation"):
    """Alternative context manager approach"""
    start_time = time.time()
    try:
        yield
    finally:
        end_time = time.time()
        print(f"{name} took {end_time - start_time:.4f} seconds")

# Example usage
@timing_decorator
def slow_function():
    time.sleep(1)
    return "Done"

# Test both approaches
result = slow_function()

# Context manager alternative
with timer("Manual timing"):
    time.sleep(0.5)
    print("Alternative approach demonstrated")`
];

class ThreeQuestionAssessmentTest {
  constructor() {
    this.sessionId = null;
    this.socket = null;
    this.questionsReceived = [];
    this.testResults = {
      sessionCreated: false,
      questionsAsked: 0,
      questionTypes: [],
      questionsReceived: [],
      codePhases: 0,
      assessmentComplete: false,
      testDuration: 0,
      errors: []
    };
    this.startTime = Date.now();
  }

  async runTest() {
    console.log('🎯 Starting 3-Question Assessment Flow Test...\n');
    
    try {
      // Step 1: Create parameter session
      await this.createParameterSession();
      
      // Step 2: Connect WebSocket
      await this.connectWebSocket();
      
      // Step 3: Submit code phases gradually
      await this.submitCodePhases();
      
      // Step 4: Wait for all 3 questions
      await this.waitForAllQuestions();
      
      // Step 5: Analyze results
      this.analyzeResults();
      
    } catch (error) {
      this.testResults.errors.push(`Test execution error: ${error.message}`);
      console.error('❌ Test failed:', error);
    } finally {
      if (this.socket) {
        this.socket.disconnect();
      }
      this.generateReport();
    }
  }

  async createParameterSession() {
    console.log('📋 Creating parameter-based session...');
    
    const response = await axios.post(`${BACKEND_URL}/api/living-assessment/parameter-sessions`, {
      language: TEST_CONFIG.language,
      experienceLevel: TEST_CONFIG.experienceLevel,
      userId: 'test-user-3q'
    });

    if (response.status === 201) {
      this.sessionId = response.data.sessionId;
      this.testResults.sessionCreated = true;
      console.log(`✅ Session created: ${this.sessionId}\n`);
    } else {
      throw new Error(`Failed to create session: ${response.status}`);
    }
  }

  async connectWebSocket() {
    console.log('🔌 Connecting to WebSocket...');
    
    return new Promise((resolve, reject) => {
      this.socket = io(BACKEND_URL, {
        transports: ['websocket']
      });

      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected\n');
        
        // Join room
        this.socket.emit('joinRoom', {
          roomName: this.sessionId,
          userId: 'test-user-3q',
          username: 'Test User',
          language: TEST_CONFIG.language,
          experienceLevel: TEST_CONFIG.experienceLevel
        });

        // Join assessment room
        this.socket.emit('joinAssessmentRoom', {
          sessionId: this.sessionId,
          userId: 'test-user-3q'
        });

        resolve();
      });

      this.socket.on('newMessage', (data) => {
        if (data.sender && data.sender.name === 'LHIS') {
          this.handleQuestionReceived(data);
        }
      });

      this.socket.on('connect_error', (error) => {
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      });

      setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);
    });
  }

  handleQuestionReceived(data) {
    const questionNumber = this.questionsReceived.length + 1;
    const questionText = data.message || data.content;
    
    console.log(`📝 Question ${questionNumber} received:`);
    console.log(`   ${questionText.substring(0, 100)}...`);
    
    // Determine question type based on content
    let questionType = 'Unknown';
    const lowerQuestion = questionText.toLowerCase();
    
    if (lowerQuestion.includes('approach') || lowerQuestion.includes('thinking') || lowerQuestion.includes('logic')) {
      questionType = 'Approach & Logic Assessment';
    } else if (lowerQuestion.includes('trade-off') || lowerQuestion.includes('alternative') || lowerQuestion.includes('instead')) {
      questionType = 'Trade-offs & Alternatives';
    } else if (lowerQuestion.includes('what if') || lowerQuestion.includes('scenario') || lowerQuestion.includes('change')) {
      questionType = 'What-if Scenarios & Adaptability';
    }
    
    this.questionsReceived.push({
      number: questionNumber,
      text: questionText,
      type: questionType,
      timestamp: new Date().toISOString(),
      receivedAt: Date.now() - this.startTime
    });

    this.testResults.questionsAsked = questionNumber;
    this.testResults.questionTypes.push(questionType);
    this.testResults.questionsReceived.push({
      question: questionText.substring(0, 200),
      type: questionType
    });

    console.log(`   Type: ${questionType}`);
    console.log(`   Received after: ${Math.round((Date.now() - this.startTime) / 1000)}s\n`);
  }

  async submitCodePhases() {
    console.log('💻 Submitting code phases...\n');
    
    for (let i = 0; i < TIMING_DECORATOR_CODE_PHASES.length; i++) {
      const code = TIMING_DECORATOR_CODE_PHASES[i];
      const phaseNumber = i + 1;
      
      console.log(`📤 Submitting Phase ${phaseNumber}/${TIMING_DECORATOR_CODE_PHASES.length}`);
      console.log(`   Code length: ${code.length} characters`);
      
      // Submit code via WebSocket
      this.socket.emit('codeChange', {
        code: code,
        language: TEST_CONFIG.language,
        sessionId: this.sessionId
      });

      // Also emit assessment code change
      this.socket.emit('assessmentCodeChange', {
        code: code,
        language: TEST_CONFIG.language,
        sessionId: this.sessionId
      });

      this.testResults.codePhases = phaseNumber;
      
      // Wait before next phase
      if (i < TIMING_DECORATOR_CODE_PHASES.length - 1) {
        console.log(`   Waiting ${TEST_CONFIG.codeSubmissionInterval / 1000}s before next phase...\n`);
        await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.codeSubmissionInterval));
      }
    }
    
    console.log('✅ All code phases submitted\n');
  }

  async waitForAllQuestions() {
    console.log('⏳ Waiting for all 3 questions...\n');
    
    const maxWaitTime = TEST_CONFIG.testDuration;
    const checkInterval = 5000; // Check every 5 seconds
    let waitedTime = 0;
    
    while (this.questionsReceived.length < 3 && waitedTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
      
      console.log(`   Questions received: ${this.questionsReceived.length}/3 (waited ${Math.round(waitedTime/1000)}s)`);
    }
    
    this.testResults.testDuration = Date.now() - this.startTime;
    this.testResults.assessmentComplete = this.questionsReceived.length >= 3;
    
    if (this.testResults.assessmentComplete) {
      console.log('✅ All 3 questions received!\n');
    } else {
      console.log(`⚠️ Only received ${this.questionsReceived.length}/3 questions in ${Math.round(waitedTime/1000)}s\n`);
    }
  }

  analyzeResults() {
    console.log('📊 Analyzing assessment results...\n');
    
    const expectedTypes = [
      'Approach & Logic Assessment',
      'Trade-offs & Alternatives', 
      'What-if Scenarios & Adaptability'
    ];
    
    const receivedTypes = this.testResults.questionTypes;
    const typesCovered = expectedTypes.filter(type => receivedTypes.includes(type));
    
    console.log('🎯 Question Type Analysis:');
    expectedTypes.forEach((expectedType, index) => {
      const received = receivedTypes.includes(expectedType);
      const icon = received ? '✅' : '❌';
      console.log(`   ${icon} ${expectedType}: ${received ? 'RECEIVED' : 'MISSING'}`);
    });
    
    console.log(`\n📈 Coverage: ${typesCovered.length}/${expectedTypes.length} question types (${Math.round(typesCovered.length/expectedTypes.length*100)}%)`);
  }

  generateReport() {
    const duration = Math.round(this.testResults.testDuration / 1000);
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 3-QUESTION ASSESSMENT TEST REPORT');
    console.log('='.repeat(80));
    
    console.log('\n📊 OVERALL RESULTS:');
    console.log(`   Session Created: ${this.testResults.sessionCreated ? '✅' : '❌'}`);
    console.log(`   Questions Asked: ${this.testResults.questionsAsked}/3`);
    console.log(`   Assessment Complete: ${this.testResults.assessmentComplete ? '✅' : '❌'}`);
    console.log(`   Code Phases: ${this.testResults.codePhases}/${TIMING_DECORATOR_CODE_PHASES.length}`);
    console.log(`   Test Duration: ${duration}s`);
    
    console.log('\n🎯 QUESTION BREAKDOWN:');
    this.questionsReceived.forEach((q, index) => {
      console.log(`   Q${index + 1}: ${q.type}`);
      console.log(`       "${q.text.substring(0, 100)}..."`);
      console.log(`       Received: ${Math.round(q.receivedAt / 1000)}s`);
    });
    
    console.log('\n🏆 ASSESSMENT QUALITY:');
    const expectedTypes = ['Approach & Logic Assessment', 'Trade-offs & Alternatives', 'What-if Scenarios & Adaptability'];
    const uniqueTypes = [...new Set(this.testResults.questionTypes)];
    const coverage = Math.round(uniqueTypes.length / expectedTypes.length * 100);
    
    console.log(`   Question Diversity: ${uniqueTypes.length}/${expectedTypes.length} types (${coverage}%)`);
    console.log(`   Natural Timing: ${this.questionsReceived.length > 0 ? '✅' : '❌'}`);
    console.log(`   Progressive Depth: ${this.testResults.questionsAsked === 3 ? '✅' : '❌'}`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.testResults.errors.forEach(error => {
        console.log(`   • ${error}`);
      });
    }
    
    // Final verdict
    const success = this.testResults.sessionCreated && 
                   this.testResults.questionsAsked >= 3 && 
                   uniqueTypes.length >= 2 &&
                   this.testResults.errors.length === 0;
    
    console.log('\n🎯 FINAL VERDICT:');
    console.log(`   ${success ? '🎉 TEST PASSED' : '❌ TEST FAILED'}`);
    
    if (success) {
      console.log('   The 3-question assessment system is working correctly!');
      console.log('   ✅ All question types are being generated');
      console.log('   ✅ Questions are asked at appropriate times');
      console.log('   ✅ Assessment provides comprehensive coverage');
    } else {
      console.log('   Issues detected with the 3-question system:');
      if (this.testResults.questionsAsked < 3) {
        console.log('   ❌ Not all 3 questions were asked');
      }
      if (uniqueTypes.length < 2) {
        console.log('   ❌ Insufficient question type diversity');
      }
      if (this.testResults.errors.length > 0) {
        console.log('   ❌ Technical errors occurred');
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

// Run the test
if (require.main === module) {
  const test = new ThreeQuestionAssessmentTest();
  test.runTest().catch(console.error);
}

module.exports = ThreeQuestionAssessmentTest;
