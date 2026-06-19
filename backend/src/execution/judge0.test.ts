import { createJudge0Kernel, languageId, normalize, LANGUAGE_IDS } from './judge0';

const enc = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('judge0 language mapping', () => {
  test('maps known languages case-insensitively', () => {
    expect(languageId('python')).toBe(LANGUAGE_IDS.python);
    expect(languageId('JavaScript')).toBe(LANGUAGE_IDS.javascript);
  });
  test('throws on unsupported language', () => {
    expect(() => languageId('brainfuck')).toThrow(/Unsupported language/);
  });
});

describe('judge0 normalize', () => {
  test('decodes base64 fields and converts time to ms', () => {
    const r = normalize({
      stdout: enc('hello\n'),
      stderr: enc(''),
      compile_output: null,
      status: { id: 3, description: 'Accepted' },
      exit_code: 0,
      time: '0.123',
      memory: 2048,
    });
    expect(r).toEqual({
      stdout: 'hello\n',
      stderr: '',
      compileOutput: '',
      status: 'Accepted',
      exitCode: 0,
      timeMs: 123,
      memoryKb: 2048,
    });
  });
  test('tolerates missing fields', () => {
    const r = normalize({});
    expect(r.status).toBe('Unknown');
    expect(r.timeMs).toBeNull();
    expect(r.stdout).toBe('');
  });
});

describe('judge0 kernel run', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
  });

  test('posts base64 source/stdin + language_id and returns a normalized result', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stdout: enc('42\n'), status: { description: 'Accepted' }, time: '0.01', memory: 100 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const kernel = createJudge0Kernel({ baseUrl: 'http://judge0:2358', authToken: 'tok' });
    const result = await kernel.run({ language: 'python', source: 'print(42)', stdin: '7' });

    expect(result.stdout).toBe('42\n');
    expect(result.status).toBe('Accepted');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/submissions?base64_encoded=true&wait=true');
    expect((init as { headers: Record<string, string> }).headers['X-Auth-Token']).toBe('tok');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.language_id).toBe(LANGUAGE_IDS.python);
    expect(body.source_code).toBe(enc('print(42)'));
    expect(body.stdin).toBe(enc('7'));
  });

  test('throws on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;
    const kernel = createJudge0Kernel({ baseUrl: 'http://judge0:2358' });
    await expect(kernel.run({ language: 'python', source: 'x' })).rejects.toThrow(/Judge0 HTTP 500/);
  });

  test('throws when unconfigured', async () => {
    const kernel = createJudge0Kernel({ baseUrl: '' });
    await expect(kernel.run({ language: 'python', source: 'x' })).rejects.toThrow(/not configured/);
  });
});
