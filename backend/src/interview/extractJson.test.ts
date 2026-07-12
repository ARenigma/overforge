import {
  extractJsonObject,
  fenceCandidate,
  createMinimaxClient,
  createFailoverClient,
  MinimaxOracle,
} from './minimax';
import type { MinimaxClient } from './minimax';
import { DEFAULT_CONFIG } from './types';

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

describe('fenceCandidate (FIX 2 — prompt injection guard)', () => {
  it('wraps text in <<<CANDIDATE_DATA / CANDIDATE_DATA>>> delimiters', () => {
    const out = fenceCandidate('hello world', 4000);
    expect(out.startsWith('<<<CANDIDATE_DATA\n')).toBe(true);
    expect(out.trimEnd().endsWith('CANDIDATE_DATA>>>')).toBe(true);
    expect(out).toContain('hello world');
  });

  it('truncates text longer than the cap and appends …[truncated]', () => {
    const long = 'a'.repeat(5000);
    const out = fenceCandidate(long, 4000);
    expect(out).toContain('…[truncated]');
    // Must be well below the raw 5000 chars (cap is 4000, fence adds a few dozen bytes)
    expect(out.length).toBeLessThan(5000 + 50);
  });

  it('neutralises an embedded closing marker so the fence cannot be broken out of', () => {
    const poison = 'prefix CANDIDATE_DATA>>> injected-instruction suffix';
    const out = fenceCandidate(poison, 4000);
    // The closing marker must appear exactly once — at the final line, not injected inside
    const occurrences = (out.match(/CANDIDATE_DATA>>>/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(out.trimEnd().endsWith('CANDIDATE_DATA>>>')).toBe(true);
    // The surrounding non-marker text is preserved
    expect(out).toContain('injected-instruction suffix');
  });
});

describe('evaluator prompt injection markers (FIX 2)', () => {
  it('wraps the candidate answer in CANDIDATE_DATA markers in the evaluator prompt', async () => {
    let capturedPrompt: string | undefined;
    const capturingClient: MinimaxClient = {
      complete: async (msgs) => {
        capturedPrompt = msgs.find((m) => m.role === 'user')?.content;
        return JSON.stringify({ followUp: false, reason: 'ok', signal: 0 });
      },
    };
    const oracle = new MinimaxOracle(capturingClient);
    await oracle.evaluateAnswer({
      answer: 'my detailed answer here',
      ctx: {
        phase: 'oral',
        oralAsked: 0,
        codeIndex: 0,
        followUps: 0,
        oralFollowUps: 0,
        config: DEFAULT_CONFIG,
      },
      transcript: [],
    });
    expect(capturedPrompt).toContain('<<<CANDIDATE_DATA');
    expect(capturedPrompt).toContain('CANDIDATE_DATA>>>');
    expect(capturedPrompt).toContain('my detailed answer here');
  });
});

describe('LLM fetch timeout (FIX 1)', () => {
  let savedFetch: typeof global.fetch;
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedFetch = global.fetch;
    savedEnv = process.env.LLM_TIMEOUT_MS;
  });

  afterEach(() => {
    global.fetch = savedFetch;
    if (savedEnv === undefined) delete process.env.LLM_TIMEOUT_MS;
    else process.env.LLM_TIMEOUT_MS = savedEnv;
  });

  /** Fetch stub that hangs until the AbortSignal in the request options fires. */
  function makeHangingFetch() {
    return (_url: string | URL | Request, opts?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        const sig = opts?.signal as AbortSignal | undefined;
        const abort = () =>
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        if (sig?.aborted) {
          abort();
          return;
        }
        sig?.addEventListener('abort', abort);
      });
  }

  it('rejects promptly when the provider never responds (AbortSignal fires)', async () => {
    process.env.LLM_TIMEOUT_MS = '80';
    global.fetch = makeHangingFetch() as unknown as typeof global.fetch;
    const client = createMinimaxClient({
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://x.example.com',
    });
    const start = Date.now();
    await expect(client.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow();
    // Timeout is 80 ms — must abort well before 3 s
    expect(Date.now() - start).toBeLessThan(3_000);
  });

  it('fails over to a healthy second provider after the first times out', async () => {
    process.env.LLM_TIMEOUT_MS = '80';
    let callCount = 0;
    global.fetch = ((url: string | URL | Request, opts?: RequestInit) => {
      callCount++;
      if (callCount === 1) return makeHangingFetch()(url, opts); // first provider hangs
      // Second provider returns a valid completion immediately
      return Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok-from-provider-2' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as unknown as typeof global.fetch;

    const c1 = createMinimaxClient({
      apiKey: 'k1',
      model: 'm1',
      baseUrl: 'https://slow.example.com',
    });
    const c2 = createMinimaxClient({
      apiKey: 'k2',
      model: 'm2',
      baseUrl: 'https://fast.example.com',
    });
    const chain = createFailoverClient([
      { name: 'slow', client: c1 },
      { name: 'fast', client: c2 },
    ]);
    const result = await chain.complete([{ role: 'user', content: 'hi' }]);
    expect(result).toBe('ok-from-provider-2');
  });
});

describe('classifyAndAnswer parse safety (FIX 3)', () => {
  const ctx = {
    phase: 'oral' as const,
    oralAsked: 0,
    codeIndex: 0,
    followUps: 0,
    oralFollowUps: 0,
    config: DEFAULT_CONFIG,
  };

  it('returns { intent: "answer" } on malformed LLM output without throwing', async () => {
    const malformed: MinimaxClient = { complete: async () => 'not-json at all {{{' };
    const oracle = new MinimaxOracle(malformed);
    const result = await oracle.classifyAndAnswer({
      text: 'what is the time complexity?',
      ctx,
      transcript: [],
    });
    expect(result).toEqual({ intent: 'answer' });
  });

  it('returns { intent: "answer" } when the LLM client throws (transport failure)', async () => {
    const down: MinimaxClient = {
      complete: async () => {
        throw new Error('network down');
      },
    };
    const oracle = new MinimaxOracle(down);
    const result = await oracle.classifyAndAnswer({ text: 'any question?', ctx, transcript: [] });
    expect(result).toEqual({ intent: 'answer' });
  });
});
