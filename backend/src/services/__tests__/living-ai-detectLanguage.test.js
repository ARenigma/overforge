const LivingAIInterviewer = require('../living-ai-interviewer');

describe('detectLanguage edge cases', () => {
  const instance = LivingAIInterviewer;

  test('TypeScript interface and typed params → javascript', () => {
    const tsCode = `
      interface User { id: string; name: string }
      export function greet(name: string): void { console.log(name) }
    `;
    expect(instance.detectLanguage(tsCode)).toBe('javascript');
  });

  test('Modern JS import/export and arrow → javascript', () => {
    const jsCode = `import x from 'y'; const f = (a) => a * 2; export default f;`;
    expect(instance.detectLanguage(jsCode)).toBe('javascript');
  });

  test('Python with type hints → python', () => {
    const pyCode = `from typing import List\n\n def f(a: List[int]) -> int:\n    return sum(a)`;
    expect(instance.detectLanguage(pyCode)).toBe('python');
  });
});


