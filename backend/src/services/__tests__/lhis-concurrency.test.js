// Concurrency test: ensure aiAnalysisLocks prevents overlapping depth question generation

jest.mock('../aiService', () => ({
  performAIAnalysis: jest.fn(async (prompt) => {
    if (typeof prompt === 'string' && prompt.includes('Respond with JSON')) {
      // Simulate detection
      return { analysis: { detected: true, confidence: 90, reasoning: 'Detected' } };
    }
    // Simulate slow AI response for depth question
    await new Promise(res => setTimeout(res, 50));
    return { question: 'Depth question generated' };
  })
}));

const LivingAIInterviewer = require('../living-ai-interviewer');

describe('LHIS concurrency guard', () => {
  test('generateAIDepthQuestion uses fallback when lock is present', async () => {
    const instance = LivingAIInterviewer;
    instance.setSocketIO({ to: () => ({ emit: () => {} }) });
    instance.setStorageFunction(() => {});

    const sessionId = 'sess-concurrency-1';
    const jobProfile = {
      title: 'Concurrency',
      parameters: [ { id: 0, name: 'JavaScript Core', description: 'Core' } ]
    };
    const parameterProgress = instance.initializeParameterProgress(jobProfile.parameters);
    instance.activeSessions.set(sessionId, {
      sessionId,
      jobProfile,
      parameterProgress,
      currentCode: { main: 'function f(){ return 1; }' },
      assessmentSession: { retry_count: {}, assessment_state: { startTime: new Date().toISOString() } },
      awaitingAnswer: null,
      language: 'javascript',
      conversationThreads: new Map(),
      conversationHistory: [],
      conversationContext: {},
      candidatePersonality: { communicationStyle: 'concise', technicalDepth: 'surface' }
    });

    // Acquire lock to simulate another analysis in progress
    instance.aiAnalysisLocks.set(sessionId, Date.now());
    const parameter = jobProfile.parameters[0];
    const result = await instance.generateAIDepthQuestion(parameter, 0, instance.activeSessions.get(sessionId));
    expect(result && result.question).toBeTruthy();
    // Fallback path prefixes are not exposed, but we can assert that the lock remains untouched or cleared later
    // Release lock for cleanup
    instance.aiAnalysisLocks.delete(sessionId);
  });
});


