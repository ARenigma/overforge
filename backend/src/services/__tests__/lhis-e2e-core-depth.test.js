// Comprehensive E2E-style test for LHIS covering Python, Java, and JavaScript
// Simulates live user code updates, threshold-triggered analysis, and depth questions (1..3)

let mockCapturedPrompts = [];

// Mock approaches service to ensure comparative context is available
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

// Mock AI service to respond to comparative prompts with a question, otherwise return detection
jest.mock('../aiService', () => ({
  performAIAnalysis: jest.fn(async (prompt) => {
    mockCapturedPrompts.push(prompt);
    // Parameter detection style response
    return { analysis: { detected: true, confidence: 92, reasoning: 'Heuristic detection passed.' } };
  }),
  // generateAIDepthQuestion sends the approach-specific (comparative) prompt here (3rd arg).
  analyzeCode: jest.fn(async (code, language, prompt) => {
    mockCapturedPrompts.push(prompt);
    return 'Why this approach versus the alternatives for this problem?';
  })
}));

const LivingAIInterviewer = require('../living-ai-interviewer');
const { parameterDetectionConfig } = require('../../config/lhis-detection-rules');

// Utility to synthesize code strings near and above threshold
function makeCode(base, repeatChars) {
  const filler = ' '.repeat(Math.max(0, repeatChars));
  return (base + '\n' + filler);
}

describe('LHIS E2E - core languages and depth questions (reject-oriented)', () => {
  beforeEach(() => {
    mockCapturedPrompts = [];
  });

  test('JavaScript, Python, Java flows: thresholded code → depth Q1..Q3 with comparative context', async () => {
    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0);

    const instance = LivingAIInterviewer; // singleton
    instance.setSocketIO({ to: () => ({ emit: () => {} }) });
    instance.setStorageFunction(() => {});

    // Source derives the problem id dynamically from code; pin it to a known seeded
    // problem (id 6, not the 99 general-coding fallback) so comparative context is built.
    const detectSpy = jest.spyOn(instance, 'detectProblemUniversal').mockReturnValue({
      problemType: 'two-pointer', problemId: 6, confidence: 0.95, category: 'arrays'
    });

    const jobProfile = {
      title: 'Core Engineer',
      parameters: [
        { id: 0, name: 'JavaScript Core', description: 'JS implementation and design' },
        { id: 1, name: 'Python Core', description: 'Python implementation and design' },
        { id: 2, name: 'Java Core', description: 'Java implementation and design' }
      ],
      assessment_criteria: {}
    };

    // Initialize session with required state
    const sessionId = 'sess-e2e-core-1';
    const parameterProgress = instance.initializeParameterProgress(jobProfile.parameters);
    instance.activeSessions.set(sessionId, {
      sessionId,
      language: 'mixed',
      jobProfile,
      parameterProgress,
      currentCode: { main: '' },
      currentProblemId: 6,
      awaitingAnswer: null,
      assessmentSession: { retry_count: {} },
      conversationThreads: new Map(),
      conversationHistory: [],
      conversationContext: {},
      conversationNarrative: [],
      recentMentions: new Map(),
      candidatePersonality: { communicationStyle: 'concise', technicalDepth: 'surface' }
    });

    const minChars = parameterDetectionConfig.codeThresholds.minimumCharacters;

    // 1) JavaScript flow
    const jsBase = 'function solve(arr){ let i=0,j=arr.length-1; while(i<j){ i++; j--; } return arr; }';
    const jsBelow = makeCode(jsBase, Math.max(0, minChars - jsBase.length - 10));
    const jsAbove = (jsBase + '\n').repeat(6);

    // Below threshold should not trigger detection
    const noDetect = await instance.analyzeCodeProgress(sessionId, 'main', jsBelow, 'javascript');
    expect(noDetect).toBe(false);

    // Above threshold should detect
    const detectedJS = await instance.analyzeCodeProgress(sessionId, 'main', jsAbove, 'javascript');
    expect(detectedJS).toBe(true);

    // Stub threading to isolate from conversation context internals
    const threadingStub = jest.spyOn(instance, 'updateConversationThreading').mockImplementation(() => {});

    // Trigger depth 1
    await instance.triggerParameterAssessment(sessionId, 0);
    expect(instance.activeSessions.get(sessionId).awaitingAnswer).not.toBeNull();

    // Answer to proceed to depth 2
    await instance.processAnswer(sessionId, 'This is a detailed, technically rich explanation that definitely covers implementation, architecture, design patterns, algorithmic trade-offs, and optimization considerations across layers, ensuring clarity and correctness in reasoning.');
    expect(instance.activeSessions.get(sessionId).awaitingAnswer).toBeNull();

    // Trigger depth 2
    await instance.triggerParameterAssessment(sessionId, 0);
    expect(instance.activeSessions.get(sessionId).awaitingAnswer?.depthLevel).toBe(1);
    await instance.processAnswer(sessionId, 'Here are the implementation details: we implement specific modules, apply a layered architecture, and use proven patterns; the explanation is comprehensive and clearly articulated, ensuring technical depth.');

    // Trigger depth 3
    await instance.triggerParameterAssessment(sessionId, 0);
    expect(instance.activeSessions.get(sessionId).awaitingAnswer?.depthLevel).toBe(2);
    await instance.processAnswer(sessionId, 'Optimization and best practices include memory optimization, algorithmic improvements, clear error handling, and adherence to performance patterns; this answer is long, explicit, and technically reasoned to pass thresholds.');

    // After 3 questions, further triggers should noop
    const afterComplete = await instance.triggerParameterAssessment(sessionId, 0);
    expect(afterComplete).toBeNull();

    // Comparative prompts must have been sent
    const hasComparativeJS = mockCapturedPrompts.some(p => typeof p === 'string' && p.includes('KNOWN APPROACHES FOR THIS PROBLEM'));
    expect(hasComparativeJS).toBe(true);

    // 2) Python flow
    const pyBase = 'def solve(nums): i, j = 0, len(nums)-1\n    while i < j:\n        i += 1\n        j -= 1\n    return nums';
    const pyAbove = makeCode(pyBase.repeat(4), 40);
    const detectedPY = await instance.analyzeCodeProgress(sessionId, 'main', pyAbove, 'python');
    expect(detectedPY).toBe(true);
    await instance.triggerParameterAssessment(sessionId, 1);
    expect(instance.activeSessions.get(sessionId).awaitingAnswer).not.toBeNull();
    await instance.processAnswer(sessionId, 'In Python, we implement this with clear modularization, explicit error handling, time complexity analysis, and trade-offs; this detailed, confident, and technical answer references implementation, architecture, and patterns.');
    await instance.triggerParameterAssessment(sessionId, 1);
    await instance.processAnswer(sessionId, 'Deeper Python details including function-level patterns, data structures, algorithmic complexity, and best practices; the explanation is deliberately long and includes technical terminology to exceed scoring thresholds.');
    await instance.triggerParameterAssessment(sessionId, 1);
    await instance.processAnswer(sessionId, 'Python optimizations: vectorization where applicable, avoiding n^2 hot paths, caching, and pattern-driven refactors; the narrative is extensive, confident, and technically grounded.');

    // 3) Java flow
    const javaBase = 'public class Main { public static void main(String[] args){ System.out.println("Hi"); } }';
    const javaAbove = (javaBase + '\n').repeat(6);
    const detectedJAVA = await instance.analyzeCodeProgress(sessionId, 'main', javaAbove, 'java');
    expect(detectedJAVA).toBe(true);
    await instance.triggerParameterAssessment(sessionId, 2);
    expect(instance.activeSessions.get(sessionId).awaitingAnswer).not.toBeNull();
    await instance.processAnswer(sessionId, 'For Java, we implement with a clear package structure, explicit interfaces, and patterns like Strategy; this confident, detailed answer references implementation, architecture, and pattern usage.');
    await instance.triggerParameterAssessment(sessionId, 2);
    await instance.processAnswer(sessionId, 'Deeper Java details: we implement concrete classes, define interfaces, apply SOLID principles, and discuss architectural layering; comprehensive and technically precise to ensure passing thresholds.');
    await instance.triggerParameterAssessment(sessionId, 2);
    await instance.processAnswer(sessionId, 'Java optimizations: reduce allocations, leverage streams judiciously, apply caching, and select algorithms with better complexity; a long, explicit, and pattern-oriented explanation.');

    // Validate gating behavior: cannot trigger when awaiting answer
    // Set awaiting and ensure early return
    instance.activeSessions.get(sessionId).awaitingAnswer = { parameterId: 0, depthLevel: 0, question: { question: 'Q' } };
    const gated = await instance.triggerParameterAssessment(sessionId, 0);
    expect(gated).toBeNull();
    instance.activeSessions.get(sessionId).awaitingAnswer = null;

    // Ensure comparative prompts happened across flows
    const comparativeCount = mockCapturedPrompts.filter(p => typeof p === 'string' && p.includes('KNOWN APPROACHES FOR THIS PROBLEM')).length;
    expect(comparativeCount).toBeGreaterThanOrEqual(3);

    timeoutSpy.mockRestore();
    threadingStub.mockRestore();
    detectSpy.mockRestore();
  });
});


