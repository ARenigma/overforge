// Auto-trigger path test for LHIS: checkAndTriggerParameterQuestion

jest.mock('../aiService', () => ({
  performAIAnalysis: jest.fn(async (prompt) => {
    if (typeof prompt === 'string' && prompt.includes('Respond with JSON')) {
      return { analysis: { detected: true, confidence: 90, reasoning: 'Detected by heuristics.' } };
    }
    return { question: 'Auto-triggered depth question' };
  })
}));

const LivingAIInterviewer = require('../living-ai-interviewer');
const { parameterDetectionConfig } = require('../../config/lhis-detection-rules');

describe('LHIS auto-trigger path', () => {
  test('checkAndTriggerParameterQuestion triggers first depth when codeDetected and not awaiting', async () => {
    const instance = LivingAIInterviewer;
    instance.setSocketIO({ to: () => ({ emit: () => {} }) });
    instance.setStorageFunction(() => {});
    const threadingStub = jest.spyOn(instance, 'updateConversationThreading').mockImplementation(() => {});

    const sessionId = 'sess-auto-1';
    const jobProfile = {
      title: 'Auto Test',
      parameters: [ { id: 0, name: 'JavaScript Core', description: 'Core JS' } ]
    };
    const parameterProgress = instance.initializeParameterProgress(jobProfile.parameters);
    instance.activeSessions.set(sessionId, {
      sessionId,
      jobProfile,
      parameterProgress,
      currentCode: { main: '' },
      assessmentSession: { retry_count: {}, assessment_state: { startTime: new Date().toISOString() } },
      awaitingAnswer: null,
      language: 'javascript',
      conversationThreads: new Map(),
      conversationHistory: [],
      conversationContext: {}
    });

    const minChars = parameterDetectionConfig.codeThresholds.minimumCharacters;
    const code = ('function f(){return 1;}\n').repeat(Math.ceil(minChars / 10) + 10);

    // Detect parameter
    const detected = await instance.analyzeCodeProgress(sessionId, 'main', code, 'javascript');
    expect(detected).toBe(true);

    // Auto-trigger
    await instance.checkAndTriggerParameterQuestion(sessionId);
    const awaiting = instance.activeSessions.get(sessionId).awaitingAnswer;
    expect(awaiting).not.toBeNull();
    expect(awaiting.depthLevel).toBe(0);

    // Should no-op while awaiting
    await instance.checkAndTriggerParameterQuestion(sessionId);
    expect(instance.activeSessions.get(sessionId).awaitingAnswer).not.toBeNull();

    threadingStub.mockRestore();
  });
});


