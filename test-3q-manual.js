#!/usr/bin/env node

/**
 * 🎯 MANUAL 3-QUESTION TEST
 * Manually trigger all 3 question types to validate the system
 */

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';
const SESSION_ID = `param-${Date.now()}-manual3q`;

console.log('🎯 Starting Manual 3-Question Test...');
console.log(`📋 Session ID: ${SESSION_ID}`);

const socket = io(BACKEND_URL, {
  transports: ['websocket']
});

let questionsReceived = [];

socket.on('connect', () => {
  console.log('✅ WebSocket connected');
  
  // Join room
  socket.emit('joinRoom', {
    roomName: SESSION_ID,
    userId: 'manual-user',
    username: 'Manual Test User',
    language: 'python',
    experienceLevel: 'mid'
  });

  socket.emit('joinAssessmentRoom', {
    sessionId: SESSION_ID,
    userId: 'manual-user'
  });

  // Submit initial code to trigger Q1
  setTimeout(() => {
    console.log('\n📤 Phase 1: Submitting basic decorator code...');
    const code1 = `import time
from functools import wraps

def timing_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        print(f"{func.__name__} took {end_time - start_time:.4f} seconds")
        return result
    return wrapper`;

    socket.emit('assessmentCodeChange', {
      code: code1,
      language: 'python',
      sessionId: SESSION_ID
    });
  }, 1000);

  // Answer Q1 and trigger Q2
  setTimeout(() => {
    console.log('\n🤖 Answering Q1 and requesting Q2...');
    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: "I chose the decorator approach because it provides clean separation of concerns. The timing logic is completely separate from the business logic, making it reusable across different functions. I used functools.wraps to preserve the original function's metadata.",
      depthLevel: 0
    });
    
    // Submit more complex code to potentially trigger Q2
    const code2 = `import time
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

# Example usage showing both approaches
@timing_decorator
def slow_function():
    time.sleep(1)
    return "Done"`;

    socket.emit('assessmentCodeChange', {
      code: code2,
      language: 'python',
      sessionId: SESSION_ID
    });
  }, 8000);

  // Answer Q2 and trigger Q3
  setTimeout(() => {
    console.log('\n🤖 Answering Q2 and requesting Q3...');
    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: "I considered context managers as an alternative, which I actually implemented alongside the decorator. The decorator is more convenient for permanent timing, while context managers offer more control for specific blocks. The trade-off is convenience vs flexibility.",
      depthLevel: 1
    });
    
    // Submit production-ready code to trigger Q3
    const code3 = `import time
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

# Production-ready usage with monitoring
@timing_decorator
def database_query():
    time.sleep(0.5)  # Simulate DB query
    return "Query result"

# Test both approaches
result = database_query()

with timer_context("Batch processing", threshold=0.3):
    time.sleep(0.2)
    print("Batch operation completed")`;

    socket.emit('assessmentCodeChange', {
      code: code3,
      language: 'python',
      sessionId: SESSION_ID
    });
  }, 16000);

  // Final answer for Q3
  setTimeout(() => {
    console.log('\n🤖 Answering Q3...');
    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: "If we needed to handle high-scale scenarios, I'd add async support, implement timing aggregation, and use more efficient timing mechanisms like time.perf_counter(). For different constraints, I'd add configuration options for output format and storage backends.",
      depthLevel: 2
    });
  }, 24000);
});

socket.on('newMessage', (data) => {
  if (data.sender && data.sender.name === 'LHIS') {
    const questionNumber = questionsReceived.length + 1;
    console.log(`\n📝 Question ${questionNumber} received:`);
    console.log(`   ${data.message.substring(0, 120)}...`);
    
    // Determine question type
    let questionType = 'Unknown';
    const lowerQuestion = data.message.toLowerCase();
    
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
    
    console.log(`   Type: ${questionType}`);
    console.log(`   Depth Level: ${data.questionContext?.depthLevel || 'Unknown'}`);
    
    questionsReceived.push({
      number: questionNumber,
      text: data.message,
      type: questionType,
      depthLevel: data.questionContext?.depthLevel,
      timestamp: new Date().toISOString()
    });
  }
});

// Summary after 30 seconds
setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 MANUAL 3-QUESTION TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log(`\n📊 Questions Received: ${questionsReceived.length}/3`);
  
  questionsReceived.forEach((q, index) => {
    console.log(`\nQ${q.number}: ${q.type}`);
    console.log(`   Depth Level: ${q.depthLevel}`);
    console.log(`   "${q.text.substring(0, 100)}..."`);
  });
  
  const expectedTypes = ['Approach & Logic Assessment', 'Trade-offs & Alternatives', 'What-if Scenarios & Adaptability'];
  const receivedTypes = questionsReceived.map(q => q.type);
  const coverage = expectedTypes.filter(type => receivedTypes.includes(type)).length;
  
  console.log(`\n🏆 Coverage: ${coverage}/3 question types (${Math.round(coverage/3*100)}%)`);
  
  if (questionsReceived.length === 3 && coverage === 3) {
    console.log('\n🎉 SUCCESS: All 3 question types received!');
  } else {
    console.log('\n⚠️ PARTIAL SUCCESS: Some questions missing');
  }
  
  console.log('\n' + '='.repeat(60));
  socket.disconnect();
  process.exit(0);
}, 30000);
