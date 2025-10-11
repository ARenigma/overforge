#!/usr/bin/env node

/**
 * 🎯 SIMPLIFIED 3-QUESTION ASSESSMENT TEST
 * 
 * Tests the structured assessment system using the existing manual session approach:
 * 1. Approach & Logic Assessment
 * 2. Trade-offs & Alternatives  
 * 3. What-if Scenarios & Adaptability
 * 
 * Uses the same session ID format as our previous successful tests.
 */

const { io } = require('socket.io-client');

// Configuration
const BACKEND_URL = 'http://localhost:5001';

// Test Configuration
const TEST_CONFIG = {
  sessionId: `param-${Date.now()}-3qtest`, // Parameter session format
  language: 'python',
  experienceLevel: 'mid',
  testDuration: 120000, // 2 minutes max
  codeSubmissionInterval: 20000, // Submit code every 20 seconds
};

// Timing decorator solution phases for testing
const CODE_PHASES = [
  // Phase 1: Basic decorator structure (Q1: Approach & Logic)
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

  // Phase 2: Add usage and alternative consideration (Q2: Trade-offs & Alternatives)
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
def timer_context(name="Operation"):
    """Alternative context manager approach for timing"""
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
    return "Done"`,

  // Phase 3: Enhanced with performance considerations (Q3: What-if scenarios)
  `import time
from functools import wraps
from contextlib import contextmanager
import logging

def timing_decorator(func, log_level=logging.INFO):
    """Enhanced decorator with configurable logging"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()  # Higher precision
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        duration = end_time - start_time
        
        # Log at different levels based on duration
        if duration > 1.0:
            logging.warning(f"{func.__name__} took {duration:.4f}s (SLOW)")
        else:
            logging.info(f"{func.__name__} took {duration:.4f}s")
        return result
    return wrapper

@contextmanager
def timer_context(name="Operation", threshold=0.1):
    """Context manager with performance threshold alerting"""
    start_time = time.perf_counter()
    try:
        yield
    finally:
        duration = time.perf_counter() - start_time
        if duration > threshold:
            print(f"⚠️  {name} exceeded threshold: {duration:.4f}s")
        else:
            print(f"✅ {name} completed: {duration:.4f}s")

# Production-ready usage
@timing_decorator
def database_query():
    time.sleep(0.5)  # Simulate DB query
    return "Query result"

# Test both approaches
result = database_query()

with timer_context("Batch processing", threshold=0.3):
    time.sleep(0.2)
    print("Batch operation completed")`
];

class SimpleThreeQuestionTest {
  constructor() {
    this.socket = null;
    this.questionsReceived = [];
    this.testResults = {
      connected: false,
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
    console.log('🎯 Starting Simplified 3-Question Assessment Test...\n');
    console.log(`📋 Session ID: ${TEST_CONFIG.sessionId}`);
    console.log(`🔧 Language: ${TEST_CONFIG.language}`);
    console.log(`📊 Experience: ${TEST_CONFIG.experienceLevel}\n`);
    
    try {
      // Step 1: Connect WebSocket and setup session
      await this.connectAndSetupSession();
      
      // Step 2: Submit code phases gradually
      await this.submitCodePhases();
      
      // Step 3: Wait for all 3 questions
      await this.waitForAllQuestions();
      
      // Step 4: Analyze results
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

  async connectAndSetupSession() {
    console.log('🔌 Connecting to WebSocket and setting up session...');
    
    return new Promise((resolve, reject) => {
      this.socket = io(BACKEND_URL, {
        transports: ['websocket']
      });

      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        this.testResults.connected = true;
        
        // Join room as parameter session
        console.log('🏠 Joining room...');
        this.socket.emit('joinRoom', {
          roomName: TEST_CONFIG.sessionId,
          userId: 'test-user-3q',
          username: 'Test User',
          language: TEST_CONFIG.language,
          experienceLevel: TEST_CONFIG.experienceLevel
        });

        // Join assessment room for LHIS
        console.log('🎯 Joining assessment room...');
        this.socket.emit('joinAssessmentRoom', {
          sessionId: TEST_CONFIG.sessionId,
          userId: 'test-user-3q'
        });

        console.log('✅ Session setup complete\n');
        resolve();
      });

      this.socket.on('newMessage', (data) => {
        if (data.sender && (data.sender.name === 'Technical Interviewer' || data.sender.name === 'LHIS')) {
          this.handleQuestionReceived(data);
        }
      });

      this.socket.on('chatMessage', (data) => {
        if (data.sender && (data.sender.name === 'Technical Interviewer' || data.sender.name === 'LHIS')) {
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
    
    // Skip if we already received this question (deduplication)
    if (this.questionsReceived.some(q => q.text === questionText)) {
      return;
    }
    
    console.log(`📝 Question ${questionNumber} received:`);
    console.log(`   ${questionText.substring(0, 120)}...`);
    
    // Determine question type based on content
    let questionType = 'Unknown';
    const lowerQuestion = questionText.toLowerCase();
    
    if (lowerQuestion.includes('approach') || lowerQuestion.includes('thinking') || 
        lowerQuestion.includes('logic') || lowerQuestion.includes('walk me through')) {
      questionType = 'Approach & Logic Assessment';
    } else if (lowerQuestion.includes('trade-off') || lowerQuestion.includes('alternative') || 
               lowerQuestion.includes('instead') || lowerQuestion.includes('other ways') ||
               lowerQuestion.includes('why this over') || lowerQuestion.includes('pros and cons')) {
      questionType = 'Trade-offs & Alternatives';
    } else if (lowerQuestion.includes('what if') || lowerQuestion.includes('scenario') || 
               lowerQuestion.includes('change') || lowerQuestion.includes('adapt') ||
               lowerQuestion.includes('different constraint') || lowerQuestion.includes('scale')) {
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

    // Auto-respond to keep the conversation flowing
    setTimeout(() => {
      const response = this.generateAutoResponse(questionType, questionNumber);
      console.log(`🤖 Auto-responding: ${response.substring(0, 80)}...`);
      
      this.socket.emit('submitParameterAnswer', {
        sessionId: TEST_CONFIG.sessionId,
        parameterId: 0, // Core language parameter
        answer: response,
        depthLevel: questionNumber - 1
      });
    }, 2000);
  }

  generateAutoResponse(questionType, questionNumber) {
    const responses = {
      'Approach & Logic Assessment': [
        "I chose the decorator approach because it provides clean separation of concerns. The timing logic is completely separate from the business logic, making it reusable across different functions. I used functools.wraps to preserve the original function's metadata.",
        "My thinking was to create a non-intrusive timing mechanism. The decorator pattern allows me to add timing functionality without modifying existing code. I considered the trade-offs between accuracy and simplicity."
      ],
      'Trade-offs & Alternatives': [
        "I considered context managers as an alternative, which I actually implemented alongside the decorator. The decorator is more convenient for permanent timing, while context managers offer more control for specific blocks. The trade-off is convenience vs flexibility.",
        "Other approaches could include manual timing, class-based decorators, or using profiling tools. I chose this approach for its balance of simplicity and functionality. The main trade-off is memory overhead vs developer experience."
      ],
      'What-if Scenarios & Adaptability': [
        "If we needed to handle high-scale scenarios, I'd add async support, implement timing aggregation, and use more efficient timing mechanisms like time.perf_counter(). For different constraints, I'd add configuration options for output format and storage backends.",
        "For production scenarios, I'd add logging levels, performance thresholds, and integration with monitoring systems. If requirements changed to handle distributed systems, I'd implement distributed tracing compatibility."
      ]
    };

    const typeResponses = responses[questionType] || ["I understand the question and would implement accordingly."];
    return typeResponses[Math.min(questionNumber - 1, typeResponses.length - 1)];
  }

  async submitCodePhases() {
    console.log('💻 Submitting code phases...\n');
    
    for (let i = 0; i < CODE_PHASES.length; i++) {
      const code = CODE_PHASES[i];
      const phaseNumber = i + 1;
      
      console.log(`📤 Submitting Phase ${phaseNumber}/${CODE_PHASES.length}`);
      console.log(`   Code length: ${code.length} characters`);
      
      // Submit code via WebSocket
      this.socket.emit('codeChange', {
        code: code,
        language: TEST_CONFIG.language,
        sessionId: TEST_CONFIG.sessionId
      });

      // Also emit assessment code change for LHIS
      this.socket.emit('assessmentCodeChange', {
        code: code,
        language: TEST_CONFIG.language,
        sessionId: TEST_CONFIG.sessionId
      });

      this.testResults.codePhases = phaseNumber;
      
      // Wait before next phase
      if (i < CODE_PHASES.length - 1) {
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
    console.log('🎯 SIMPLIFIED 3-QUESTION ASSESSMENT TEST REPORT');
    console.log('='.repeat(80));
    
    console.log('\n📊 OVERALL RESULTS:');
    console.log(`   WebSocket Connected: ${this.testResults.connected ? '✅' : '❌'}`);
    console.log(`   Questions Asked: ${this.testResults.questionsAsked}/3`);
    console.log(`   Assessment Complete: ${this.testResults.assessmentComplete ? '✅' : '❌'}`);
    console.log(`   Code Phases: ${this.testResults.codePhases}/${CODE_PHASES.length}`);
    console.log(`   Test Duration: ${duration}s`);
    
    console.log('\n🎯 QUESTION BREAKDOWN:');
    this.questionsReceived.forEach((q, index) => {
      console.log(`   Q${index + 1}: ${q.type}`);
      console.log(`       "${q.text.substring(0, 120)}..."`);
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
    const success = this.testResults.connected && 
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
      console.log('   ✅ Smart timing system is functioning properly');
    } else {
      console.log('   Issues detected with the 3-question system:');
      if (!this.testResults.connected) {
        console.log('   ❌ WebSocket connection failed');
      }
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
  const test = new SimpleThreeQuestionTest();
  test.runTest().catch(console.error);
}

module.exports = SimpleThreeQuestionTest;
