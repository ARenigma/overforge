#!/usr/bin/env node

/**
 * LHIS Multi-Problem Test Suite
 * Tests smart timing across different coding problems and patterns
 */

const io = require('socket.io-client');
const readline = require('readline');

const BACKEND_URL = 'http://localhost:5001';
const USER_ID = 'test-user-multi';

// Different problem scenarios with realistic coding patterns
const PROBLEM_SCENARIOS = {
  'binary-search': {
    name: 'Binary Search Algorithm',
    phases: [
      {
        name: "Phase 1: Function signature",
        code: `def binary_search(arr, target):`,
        expectedTrigger: "newDefinitions",
        pauseAfter: 2000
      },
      {
        name: "Phase 2: Initial setup",
        code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1`,
        expectedTrigger: "significantGrowth",
        pauseAfter: 1800
      },
      {
        name: "Phase 3: Main loop",
        code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2`,
        expectedTrigger: "significantGrowth",
        pauseAfter: 2200
      },
      {
        name: "Phase 4: Core logic",
        code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1`,
        expectedTrigger: "blockCompletion",
        pauseAfter: 2500
      },
      {
        name: "Phase 5: Return statement",
        code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1`,
        expectedTrigger: "blockCompletion",
        pauseAfter: 3000
      },
      {
        name: "Phase 6: Test cases",
        code: `def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1

# Test cases
arr = [1, 3, 5, 7, 9, 11, 13]
print(binary_search(arr, 7))  # Should return 3
print(binary_search(arr, 4))  # Should return -1`,
        expectedTrigger: "testCode",
        pauseAfter: 4000
      }
    ]
  },

  'fibonacci-recursive': {
    name: 'Fibonacci with Memoization',
    phases: [
      {
        name: "Phase 1: Basic recursive function",
        code: `def fibonacci(n):
    if n <= 1:
        return n`,
        expectedTrigger: "newDefinitions",
        pauseAfter: 2000
      },
      {
        name: "Phase 2: Recursive calls",
        code: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)`,
        expectedTrigger: "blockCompletion",
        pauseAfter: 2500
      },
      {
        name: "Phase 3: Add memoization decorator",
        code: `from functools import lru_cache

@lru_cache(maxsize=None)
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)`,
        expectedTrigger: "corePatterns",
        pauseAfter: 3000
      },
      {
        name: "Phase 4: Performance test",
        code: `from functools import lru_cache
import time

@lru_cache(maxsize=None)
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Performance test
start = time.time()
result = fibonacci(35)
end = time.time()
print(f"fibonacci(35) = {result}, took {end-start:.4f} seconds")`,
        expectedTrigger: "testCode",
        pauseAfter: 4000
      }
    ]
  },

  'context-manager': {
    name: 'Custom Context Manager',
    phases: [
      {
        name: "Phase 1: Class definition",
        code: `class TimingContext:
    def __init__(self, name):
        self.name = name`,
        expectedTrigger: "newDefinitions",
        pauseAfter: 2000
      },
      {
        name: "Phase 2: Enter method",
        code: `class TimingContext:
    def __init__(self, name):
        self.name = name
    
    def __enter__(self):
        import time
        self.start_time = time.time()
        print(f"Starting {self.name}...")
        return self`,
        expectedTrigger: "newDefinitions",
        pauseAfter: 2500
      },
      {
        name: "Phase 3: Exit method",
        code: `class TimingContext:
    def __init__(self, name):
        self.name = name
    
    def __enter__(self):
        import time
        self.start_time = time.time()
        print(f"Starting {self.name}...")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        import time
        end_time = time.time()
        duration = end_time - self.start_time
        print(f"{self.name} completed in {duration:.4f} seconds")`,
        expectedTrigger: "newDefinitions",
        pauseAfter: 3000
      },
      {
        name: "Phase 4: Usage example",
        code: `class TimingContext:
    def __init__(self, name):
        self.name = name
    
    def __enter__(self):
        import time
        self.start_time = time.time()
        print(f"Starting {self.name}...")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        import time
        end_time = time.time()
        duration = end_time - self.start_time
        print(f"{self.name} completed in {duration:.4f} seconds")

# Usage example
with TimingContext("Database operation"):
    import time
    time.sleep(0.1)  # Simulate work
    print("Processing data...")`,
        expectedTrigger: "corePatterns",
        pauseAfter: 4000
      }
    ]
  },

  'async-programming': {
    name: 'Async/Await Pattern',
    phases: [
      {
        name: "Phase 1: Async function",
        code: `import asyncio
import aiohttp

async def fetch_data(url):`,
        expectedTrigger: "newImports",
        pauseAfter: 2000
      },
      {
        name: "Phase 2: Async implementation",
        code: `import asyncio
import aiohttp

async def fetch_data(url):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.text()`,
        expectedTrigger: "corePatterns",
        pauseAfter: 3000
      },
      {
        name: "Phase 3: Multiple async calls",
        code: `import asyncio
import aiohttp

async def fetch_data(url):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.text()

async def fetch_multiple(urls):
    tasks = [fetch_data(url) for url in urls]
    results = await asyncio.gather(*tasks)
    return results`,
        expectedTrigger: "newDefinitions",
        pauseAfter: 2500
      },
      {
        name: "Phase 4: Main execution",
        code: `import asyncio
import aiohttp

async def fetch_data(url):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.text()

async def fetch_multiple(urls):
    tasks = [fetch_data(url) for url in urls]
    results = await asyncio.gather(*tasks)
    return results

# Example usage
if __name__ == "__main__":
    urls = ["https://httpbin.org/delay/1", "https://httpbin.org/delay/2"]
    results = asyncio.run(fetch_multiple(urls))
    print(f"Fetched {len(results)} responses")`,
        expectedTrigger: "testCode",
        pauseAfter: 4000
      }
    ]
  }
};

class MultiProblemTester {
  constructor() {
    this.results = {};
  }

  async testProblem(problemKey, scenario) {
    console.log(`\n🎯 Testing: ${scenario.name}`);
    console.log('='.repeat(50));

    const sessionId = `param-test-${Date.now()}-${problemKey}`;
    const socket = io(BACKEND_URL, { transports: ['websocket'] });
    const questionsReceived = [];
    const startTime = Date.now();

    // Setup event listeners
    socket.on('newMessage', (message) => {
      if (message.userId === 'lhis') {
        const timeSinceStart = Date.now() - startTime;
        console.log(`\n🎯 DEPTH QUESTION (${timeSinceStart}ms):`);
        console.log(`📝 "${message.message.substring(0, 80)}..."`);
        
        questionsReceived.push({
          question: message.message,
          timestamp: Date.now(),
          timeSinceStart
        });
      }
    });

    // Connect and join
    await new Promise(resolve => {
      socket.on('connect', resolve);
    });

    socket.emit('joinRoom', {
      roomName: sessionId,
      userId: USER_ID,
      username: 'Multi Tester',
      language: 'python',
      experienceLevel: 'mid',
      role: 'candidate'
    });

    socket.emit('joinAssessmentRoom', {
      sessionId,
      candidateId: USER_ID,
      role: 'candidate'
    });

    await this.sleep(1000);

    // Run through phases
    for (let i = 0; i < scenario.phases.length; i++) {
      const phase = scenario.phases[i];
      console.log(`\n📝 ${phase.name}`);
      console.log(`💡 Expected: ${phase.expectedTrigger}`);

      socket.emit('assessmentCodeChange', {
        sessionId,
        questionId: 'core-8',
        code: phase.code,
        language: 'python'
      });

      await this.sleep(phase.pauseAfter);
    }

    socket.disconnect();

    // Store results
    this.results[problemKey] = {
      name: scenario.name,
      phases: scenario.phases.length,
      questions: questionsReceived.length,
      duration: Date.now() - startTime,
      questionsReceived
    };

    console.log(`\n📊 ${scenario.name} Results:`);
    console.log(`   Phases: ${scenario.phases.length}`);
    console.log(`   Questions: ${questionsReceived.length}`);
    console.log(`   Duration: ${Date.now() - startTime}ms`);
  }

  async runAllTests() {
    console.log('🧪 LHIS Multi-Problem Test Suite');
    console.log('='.repeat(40));
    console.log('Testing smart timing across different problem types\n');

    const problems = Object.keys(PROBLEM_SCENARIOS);
    
    for (let i = 0; i < problems.length; i++) {
      const problemKey = problems[i];
      const scenario = PROBLEM_SCENARIOS[problemKey];
      
      await this.testProblem(problemKey, scenario);
      
      if (i < problems.length - 1) {
        console.log('\n⏳ Waiting 3s before next test...');
        await this.sleep(3000);
      }
    }

    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 COMPREHENSIVE TEST SUMMARY');
    console.log('='.repeat(50));

    let totalPhases = 0;
    let totalQuestions = 0;
    let totalDuration = 0;

    Object.entries(this.results).forEach(([key, result]) => {
      console.log(`\n🎯 ${result.name}:`);
      console.log(`   📝 Phases: ${result.phases}`);
      console.log(`   🎯 Questions: ${result.questions}`);
      console.log(`   ⏱️ Duration: ${result.duration}ms`);
      console.log(`   📈 Efficiency: ${((result.phases - result.questions) / result.phases * 100).toFixed(1)}% API savings`);
      
      if (result.questionsReceived.length > 0) {
        console.log(`   🕒 Question timings: ${result.questionsReceived.map(q => `${q.timeSinceStart}ms`).join(', ')}`);
      }

      totalPhases += result.phases;
      totalQuestions += result.questions;
      totalDuration += result.duration;
    });

    console.log(`\n🎉 OVERALL RESULTS:`);
    console.log(`   📝 Total Phases: ${totalPhases}`);
    console.log(`   🎯 Total Questions: ${totalQuestions}`);
    console.log(`   💰 Cost Savings: ${((totalPhases - totalQuestions) / totalPhases * 100).toFixed(1)}%`);
    console.log(`   ⏱️ Total Duration: ${totalDuration}ms`);
    console.log(`   📊 Questions/Phase Ratio: ${(totalQuestions / totalPhases).toFixed(2)}`);

    if (totalQuestions > 0) {
      console.log(`\n✅ LHIS Smart Timing System validated across multiple problem types!`);
      console.log(`🎯 System successfully identifies meaningful code milestones.`);
    } else {
      console.log(`\n⚠️ No questions generated. Check system configuration.`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Interactive runner
async function runInteractiveTest() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🧪 LHIS Multi-Problem Test Suite');
  console.log('='.repeat(35));
  console.log('Available tests:');
  Object.entries(PROBLEM_SCENARIOS).forEach(([key, scenario]) => {
    console.log(`  • ${key}: ${scenario.name} (${scenario.phases.length} phases)`);
  });
  
  const answer = await new Promise(resolve => {
    rl.question('\nRun all tests? (y/n): ', resolve);
  });
  
  rl.close();
  
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    const tester = new MultiProblemTester();
    await tester.runAllTests();
  } else {
    console.log('Tests cancelled.');
  }
}

if (require.main === module) {
  runInteractiveTest().catch(console.error);
}

module.exports = MultiProblemTester;

