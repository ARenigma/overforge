// Mocks must be defined before requiring the module under test
const capturedPrompts = [];

jest.mock('../problemSolutionsService', () => ({
  fetchActiveApproachesByProblemId: jest.fn(async (problemId) => {
    if (!problemId) return [];
    return [
      {
        approach_key: 'two-pointer',
        title: 'Two Pointer',
        summary: 'Scan from both ends to meet constraints.',
        pros: ['O(n)', 'Low memory'],
        cons: ['Harder to reason about in branching cases'],
        time_complexity: 'O(n)',
        space_complexity: 'O(1)'
      },
      {
        approach_key: 'hashmap',
        title: 'Hash Map',
        summary: 'Use a map for constant-time lookups.',
        pros: ['Clear logic', 'Handles duplicates well'],
        cons: ['Extra memory', 'Potential collisions'],
        time_complexity: 'O(n)',
        space_complexity: 'O(n)'
      }
    ];
  })
}));

jest.mock('../aiService', () => ({
  performAIAnalysis: jest.fn(async (prompt) => {
    capturedPrompts.push(prompt);
    // Used by the parameter-detection path.
    return { analysis: { detected: true, confidence: 90, reasoning: 'Two-pointer pattern detected.' } };
  }),
  // generateAIDepthQuestion sends the approach-specific (comparative) prompt here,
  // as the 3rd argument.
  analyzeCode: jest.fn(async (code, language, prompt) => {
    capturedPrompts.push(prompt);
    return 'Why a two-pointer approach over a hash map in this case?';
  })
}));

const LivingAIInterviewer = require('../living-ai-interviewer');

describe('LHIS flow - comparative questioning using stored approaches', () => {
  test('from code analysis to depth question with comparative context', async () => {
    // Prevent open handle from internal timeouts in Promise.race
    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0);
    const sessionId = 'sess-flow-1';

    // Minimal job profile with one parameter
    const jobProfile = {
      title: 'Engineer',
      parameters: [
        { id: 0, name: 'Problem Solving', description: 'Choose appropriate algorithm and justify trade-offs.' }
      ]
    };

    const instance = LivingAIInterviewer; // singleton export
    // Stub IO and storage to avoid emissions during test
    instance.setSocketIO({ to: () => ({ emit: () => {} }) });
    instance.setStorageFunction(() => {});

    // The source derives the problem id dynamically from the candidate's code via
    // detectProblemUniversal; pin it to a known seeded problem (id 6, not the 99
    // general-coding fallback) so the comparative approach context is built.
    const detectSpy = jest.spyOn(instance, 'detectProblemUniversal').mockReturnValue({
      problemType: 'two-pointer', problemId: 6, confidence: 0.95, category: 'arrays'
    });

    // Prepare session
    const parameterProgress = instance.initializeParameterProgress(jobProfile.parameters);
    instance.activeSessions.set(sessionId, {
      sessionId,
      language: 'javascript',
      jobProfile,
      parameterProgress,
      currentCode: { main: '' },
      currentProblemId: 6, // seeded problem
      awaitingAnswer: null,
      conversationThreads: new Map(),
      conversationHistory: [],
      conversationContext: {},
      conversationNarrative: [],
      recentMentions: new Map()
      ,candidatePersonality: { communicationStyle: 'concise', technicalDepth: 'surface' }
    });

    // Comparative approach context is injected at depth 1 (Trade-offs & Alternatives),
    // not the first question (depth 0). Seed one prior question so the next one is depth 1.
    parameterProgress[0].questionsAsked.push('depth-0-question');

    // Provide enough code to exceed any reasonable threshold
    const code = ('function solve(arr){ let i=0,j=arr.length-1; while(i<j){ /* ... */ i++; j--; } return arr; }\n').repeat(6);

    // 1) Analyze code -> should mark parameter detected
    const detected = await instance.analyzeCodeProgress(sessionId, 'main', code, 'javascript');
    expect(detected).toBe(true);

    // 2) Trigger parameter assessment -> should build comparative prompt and return question
    // Stub threading to avoid unrelated state requirements
    const threadingStub = jest.spyOn(instance, 'updateConversationThreading').mockImplementation(() => {});
    const qData = await instance.triggerParameterAssessment(sessionId, 0);
    // We can’t assert qData shape directly because triggerParameterAssessment returns void after sending chat typically
    // but generateAIDepthQuestion returns internally. Instead, assert that our AI mock received a comparative prompt.
    const hasComparativePrompt = capturedPrompts.some(p => typeof p === 'string' && p.includes('KNOWN APPROACHES FOR THIS PROBLEM') && p.includes('Two Pointer') && p.includes('Hash Map'));
    expect(hasComparativePrompt).toBe(true);

    timeoutSpy.mockRestore();
    threadingStub.mockRestore();
    detectSpy.mockRestore();
  });
});


