#!/usr/bin/env node

/**
 * 🔍 DEBUG ANSWER PROCESSING
 * Test if answers are being processed and scored correctly
 */

const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';
const SESSION_ID = `param-${Date.now()}-answerdebug`;

console.log('🔍 Starting Answer Processing Debug...');

const socket = io(BACKEND_URL);

socket.on('connect', () => {
  console.log('✅ Connected');
  
  socket.emit('joinRoom', {
    roomName: SESSION_ID,
    userId: 'debug-user',
    username: 'Debug User',
    language: 'python',
    experienceLevel: 'mid'
  });

  socket.emit('joinAssessmentRoom', {
    sessionId: SESSION_ID,
    userId: 'debug-user'
  });

  // Submit code to trigger Q1
  setTimeout(() => {
    console.log('📤 Submitting code...');
    socket.emit('assessmentCodeChange', {
      code: `def timing_decorator(func):
    def wrapper(*args, **kwargs):
        import time
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} took {end-start:.4f}s")
        return result
    return wrapper`,
      language: 'python',
      sessionId: SESSION_ID
    });
  }, 1000);

  // Submit a very detailed answer after Q1
  setTimeout(() => {
    console.log('🤖 Submitting detailed answer for Q1...');
    const detailedAnswer = `I chose the decorator approach for several key reasons:

1. **Separation of Concerns**: The timing functionality is completely separate from the business logic, following the single responsibility principle.

2. **Reusability**: Once defined, the decorator can be applied to any function with a simple @timing_decorator syntax, promoting code reuse.

3. **Non-intrusive**: The original function remains unchanged - we're not modifying existing code, just wrapping it with additional functionality.

4. **Metadata Preservation**: Using functools.wraps ensures the original function's __name__, __doc__, and other attributes are preserved.

5. **Clean Syntax**: The decorator syntax is pythonic and makes the intent clear - we want to time this function.

My thought process was to find a solution that would be both elegant and maintainable. I considered alternatives like manual timing around each function call, but that would lead to code duplication and make the timing logic scattered throughout the codebase. The decorator pattern centralizes this concern while keeping the interface clean.`;

    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: detailedAnswer,
      depthLevel: 0
    });
  }, 8000);

  // Submit detailed answer for Q2 if it comes
  setTimeout(() => {
    console.log('🤖 Submitting detailed answer for Q2...');
    const q2Answer = `I considered several alternatives before settling on the decorator approach:

**Context Managers**: 
- Pros: More explicit control, can handle exceptions gracefully, good for timing specific code blocks
- Cons: More verbose, requires 'with' statement for each use, not as reusable for function timing

**Manual Timing**:
- Pros: Simple, direct control
- Cons: Code duplication, easy to forget, scattered timing logic

**Class-based Decorators**:
- Pros: More stateful, can accumulate statistics
- Cons: More complex, overkill for simple timing

**Built-in Profiling Tools**:
- Pros: More comprehensive, professional-grade
- Cons: Heavyweight, not suitable for production timing of specific functions

The trade-offs I considered:
- **Performance vs Convenience**: Decorators have minimal overhead while providing maximum convenience
- **Flexibility vs Simplicity**: I chose simplicity for this use case, but the decorator can be extended
- **Reusability vs Customization**: The decorator is highly reusable but could be made more configurable

I chose decorators because they provide the best balance of clean syntax, reusability, and maintainability for this specific timing use case.`;

    socket.emit('submitParameterAnswer', {
      sessionId: SESSION_ID,
      parameterId: 0,
      answer: q2Answer,
      depthLevel: 1
    });
  }, 16000);
});

socket.on('newMessage', (data) => {
  if (data.sender && data.sender.name === 'LHIS') {
    console.log(`\n📝 Question received (Depth ${data.questionContext?.depthLevel}):`);
    console.log(`   ${data.message.substring(0, 150)}...`);
  }
});

socket.on('chatMessage', (data) => {
  if (data.sender && data.sender.name === 'LHIS') {
    console.log(`\n💬 Feedback: ${data.message}`);
  }
});

setTimeout(() => {
  console.log('\n⏰ Test complete');
  socket.disconnect();
  process.exit(0);
}, 25000);
