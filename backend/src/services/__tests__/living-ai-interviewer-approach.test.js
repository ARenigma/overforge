const { buildApproachComparisonContext } = require('../approachPromptUtil');

describe('Approach prompt context builder', () => {
  test('includes titles, pros/cons; code preview optional', () => {
    const approaches = [{
      approach_key: 'two-pointer',
      title: 'Two Pointer',
      summary: 'Linear scan with two indices.',
      pros: ['O(n)', 'Low memory'],
      cons: ['Harder for branching'],
      time_complexity: 'O(n)',
      space_complexity: 'O(1)'
    }];
    const code = 'function solve(arr){ let i=0,j=arr.length-1; }';
    const ctx = buildApproachComparisonContext(approaches, code, 'javascript');
    expect(ctx).toMatch(/KNOWN APPROACHES/i);
    expect(ctx).toMatch(/Two Pointer/);
    expect(ctx).toMatch(/Pros:/);
    expect(ctx).toMatch(/Cons:/);
  });
});


