import { extractJsonObject } from './minimax';

describe('extractJsonObject', () => {
  const parse = (s: string) => JSON.parse(extractJsonObject(s));

  it('returns a plain JSON object unchanged', () => {
    expect(parse('{"followUp":true,"signal":0.8}')).toEqual({ followUp: true, signal: 0.8 });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"followUp":false,"reason":"ok"}\n```';
    expect(parse(raw)).toEqual({ followUp: false, reason: 'ok' });
  });

  it('strips bare ``` fences', () => {
    expect(parse('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts the object from surrounding prose', () => {
    const raw = 'Here is my assessment:\n{"followUp":true,"kind":"probe"}\nHope that helps.';
    expect(parse(raw)).toEqual({ followUp: true, kind: 'probe' });
  });

  it('is not fooled by braces inside string values', () => {
    const raw = '{"reason":"use a map { } here","signal":0.5}';
    expect(parse(raw)).toEqual({ reason: 'use a map { } here', signal: 0.5 });
  });

  it('is not fooled by escaped quotes inside strings', () => {
    const raw = '{"reason":"they said \\"yes\\" then {stopped}","signal":1}';
    expect(parse(raw)).toEqual({ reason: 'they said "yes" then {stopped}', signal: 1 });
  });

  it('returns the full top-level object when nested objects are present', () => {
    const raw = 'noise {"dimensions":[{"name":"depth","score":4}],"overall":4} trailing';
    expect(parse(raw)).toEqual({ dimensions: [{ name: 'depth', score: 4 }], overall: 4 });
  });

  it('leaves a truncated object unbalanced so JSON.parse throws (caller falls back)', () => {
    // Simulates the prod failure: a response cut off mid-string.
    const truncated = '{"followUp":true,"reason":"the candidate did not fully ad';
    expect(() => parse(truncated)).toThrow();
  });
});
