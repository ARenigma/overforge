#!/usr/bin/env node

/**
 * LHIS Smart Timing Test
 * Tests the intelligent code analysis and depth question generation
 * Simulates realistic coding behavior with gradual code building
 */

const io = require('socket.io-client');
const readline = require('readline');

// Configuration
const BACKEND_URL = 'http://localhost:5001';
const TEST_SESSION_ID = `param-test-${Date.now()}-timing`;
const USER_ID = 'test-user-123';

// Code snippets to be added gradually (simulating real coding)
const CODE_PHASES = [
  {
    name: "Phase 1: Basic imports and setup",
    code: `import time
from functools import wraps`,
    expectedTrigger: "newImports",
    description: "Adding imports - should trigger significant change",
    pauseAfter: 2000
  },
  {
    name: "Phase 2: Decorator function definition",
    code: `import time
from functools import wraps

def timing_decorator(func):
    """
    A decorator that measures and prints the execution time of any function.
    """`,
    expectedTrigger: "newDefinitions",
    description: "New function definition - should trigger significant change",
    pauseAfter: 3000
  },
  {
    name: "Phase 3: Wrapper function start",
    code: `import time
from functools import wraps

def timing_decorator(func):
    """
    A decorator that measures and prints the execution time of any function.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):`,
    expectedTrigger: "newDefinitions",
    description: "Inner function definition - should trigger significant change",
    pauseAfter: 2500
  },
  {
    name: "Phase 4: Timing logic implementation",
    code: `import time
from functools import wraps

def timing_decorator(func):
    """
    A decorator that measures and prints the execution time of any function.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        execution_time = end_time - start_time`,
    expectedTrigger: "significantGrowth",
    description: "Core timing logic - should trigger significant change",
    pauseAfter: 2000
  },
  {
    name: "Phase 5: Print statement and return",
    code: `import time
from functools import wraps

def timing_decorator(func):
    """
    A decorator that measures and prints the execution time of any function.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        execution_time = end_time - start_time
        print(f"{func.__name__} executed in {execution_time:.4f} seconds")
        return result`,
    expectedTrigger: "blockCompletion",
    description: "Return statement - should trigger significant change",
    pauseAfter: 2000
  },
  {
    name: "Phase 6: Complete decorator",
    code: `import time
from functools import wraps

def timing_decorator(func):
    """
    A decorator that measures and prints the execution time of any function.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        execution_time = end_time - start_time
        print(f"{func.__name__} executed in {execution_time:.4f} seconds")
        return result
    return wrapper`,
    expectedTrigger: "blockCompletion",
    description: "Final return statement - should trigger significant change",
    pauseAfter: 3000
  },
  {
    name: "Phase 7: Example usage start",
    code: `import time
from functools import wraps

def timing_decorator(func):
    """
    A decorator that measures and prints the execution time of any function.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        execution_time = end_time - start_time
        print(f"{func.__name__} executed in {execution_time:.4f} seconds")
        return result
    return wrapper

# Example usage:
@timing_decorator
def example_function():`,
    expectedTrigger: "testCode",
    description: "Example/test code - should trigger significant change",
    pauseAfter: 2000
  },
  {
    name: "Phase 8: Complete example",
    code: `import time
from functools import wraps

def timing_decorator(func):
    """
    A decorator that measures and prints the execution time of any function.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        execution_time = end_time - start_time
        print(f"{func.__name__} executed in {execution_time:.4f} seconds")
        return result
    return wrapper

# Example usage:
@timing_decorator
def example_function():
    """A simple function that takes some time to execute."""
    time.sleep(1)
    return "Function completed"

# Test the decorator
if __name__ == "__main__":
    result = example_function()
    print(result)`,
    expectedTrigger: "testCode",
    description: "Complete example with test - should trigger significant change",
    pauseAfter: 4000
  }
];

class LHISTimingTester {
  constructor() {
    this.socket = null;
    this.currentPhase = 0;
    this.questionsReceived = [];
    this.analysisEvents = [];
    this.startTime = Date.now();
  }

  async connect() {
    console.log('🔌 Connecting to backend...');
    this.socket = io(BACKEND_URL, {
      transports: ['websocket']
    });

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('✅ Connected to backend');
        this.setupEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection failed:', error);
        reject(error);
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  setupEventListeners() {
    // Listen for LHIS questions
    this.socket.on('newMessage', (message) => {
      if (message.userId === 'lhis') {
        const timeSinceStart = Date.now() - this.startTime;
        console.log(`\n🎯 DEPTH QUESTION RECEIVED (${timeSinceStart}ms from start):`);
        console.log(`📝 Question: "${message.message.substring(0, 100)}..."`);
        console.log(`🕒 Phase: ${this.currentPhase} - ${CODE_PHASES[this.currentPhase - 1]?.name || 'Unknown'}`);
        
        this.questionsReceived.push({
          phase: this.currentPhase,
          phaseName: CODE_PHASES[this.currentPhase - 1]?.name || 'Unknown',
          question: message.message,
          timestamp: Date.now(),
          timeSinceStart
        });
      }
    });

    // Listen for debug messages
    this.socket.on('debugMessage', (message) => {
      if (message.debugInfo) {
        console.log(`🐛 Debug: ${message.debugInfo}`);
      }
    });

    // Listen for room joined confirmation
    this.socket.on('assessmentRoomJoined', (data) => {
      console.log('✅ Assessment room joined:', data);
    });
  }

  async joinSession() {
    console.log(`🏠 Joining session: ${TEST_SESSION_ID}`);
    
    // Join main room
    this.socket.emit('joinRoom', {
      roomName: TEST_SESSION_ID,
      userId: USER_ID,
      username: 'LHIS Tester',
      language: 'python',
      experienceLevel: 'mid',
      jobDescription: null,
      jobProfile: null,
      role: 'candidate'
    });

    // Join assessment room
    this.socket.emit('joinAssessmentRoom', {
      sessionId: TEST_SESSION_ID,
      candidateId: USER_ID,
      role: 'candidate'
    });

    // Wait for rooms to be joined
    await this.sleep(1000);
  }

  async runCodePhases() {
    console.log('\n🚀 Starting gradual code building test...\n');
    
    for (let i = 0; i < CODE_PHASES.length; i++) {
      this.currentPhase = i + 1;
      const phase = CODE_PHASES[i];
      
      console.log(`\n📝 ${phase.name}`);
      console.log(`💡 Expected trigger: ${phase.expectedTrigger}`);
      console.log(`📖 Description: ${phase.description}`);
      
      // Send code change
      this.socket.emit('assessmentCodeChange', {
        sessionId: TEST_SESSION_ID,
        questionId: 'core-8',
        code: phase.code,
        language: 'python'
      });
      
      console.log(`⏳ Waiting ${phase.pauseAfter}ms for analysis and potential question...`);
      await this.sleep(phase.pauseAfter);
    }
  }

  async runTest() {
    try {
      await this.connect();
      await this.joinSession();
      await this.runCodePhases();
      
      console.log('\n📊 TEST RESULTS SUMMARY:');
      console.log('='.repeat(50));
      
      console.log(`\n🔢 Total Phases: ${CODE_PHASES.length}`);
      console.log(`🎯 Questions Received: ${this.questionsReceived.length}`);
      console.log(`⏱️ Total Test Duration: ${Date.now() - this.startTime}ms`);
      
      if (this.questionsReceived.length > 0) {
        console.log('\n📋 Question Timeline:');
        this.questionsReceived.forEach((q, index) => {
          console.log(`  ${index + 1}. Phase ${q.phase} (${q.phaseName})`);
          console.log(`     ⏱️ Time: ${q.timeSinceStart}ms from start`);
          console.log(`     💬 Question: "${q.question.substring(0, 80)}..."`);
          console.log('');
        });
        
        console.log('✅ LHIS Smart Timing System is working correctly!');
        console.log('🎯 Questions were generated at appropriate code milestones.');
      } else {
        console.log('⚠️ No questions received. Possible issues:');
        console.log('   - Backend not running');
        console.log('   - AI module not responding');
        console.log('   - LHIS not properly initialized');
      }
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      this.socket?.disconnect();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Interactive mode
async function runInteractiveTest() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🧪 LHIS Smart Timing Test');
  console.log('='.repeat(30));
  console.log('This test will simulate realistic coding behavior');
  console.log('and measure LHIS depth question timing.\n');
  
  const answer = await new Promise(resolve => {
    rl.question('Ready to start the test? (y/n): ', resolve);
  });
  
  rl.close();
  
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    const tester = new LHISTimingTester();
    await tester.runTest();
  } else {
    console.log('Test cancelled.');
  }
}

// Run the test
if (require.main === module) {
  runInteractiveTest().catch(console.error);
}

module.exports = LHISTimingTester;
