const { buildApproachComparisonContext } = require('../approachPromptUtil');

describe('Approach prompt cap', () => {
  test('caps to top 3 by confidence and includes marker', () => {
    const approaches = [
      { title: 'A', confidence: 0.5, pros: ['p'], cons: ['c'] },
      { title: 'B', confidence: 0.9, pros: ['p'], cons: ['c'] },
      { title: 'C', confidence: 0.7, pros: ['p'], cons: ['c'] },
      { title: 'D', confidence: 0.6, pros: ['p'], cons: ['c'] },
    ];
    const txt = buildApproachComparisonContext(approaches, 'code sample', 'javascript');
    expect(txt).toContain('KNOWN APPROACHES FOR THIS PROBLEM');
    // Should include B, C, D (top 3) and not A
    expect(txt).toContain('B');
    expect(txt).toContain('C');
    expect(txt).toContain('D');
    expect(txt).not.toContain('Approach A1: A');
  });
});


