import { createPistonKernel, normalize } from './piston';

describe('piston normalize', () => {
  test('accepted run', () => {
    const r = normalize({ run: { stdout: '42\n', stderr: '', code: 0 } });
    expect(r).toEqual({ stdout: '42\n', stderr: '', compileOutput: '', status: 'Accepted', exitCode: 0, timeMs: null, memoryKb: null });
  });
  test('runtime error (nonzero exit)', () => {
    expect(normalize({ run: { stdout: '', stderr: 'boom', code: 1 } }).status).toBe('Runtime Error');
  });
  test('signal → runtime error with signal', () => {
    expect(normalize({ run: { code: null, signal: 'SIGKILL' } }).status).toBe('Runtime Error (SIGKILL)');
  });
  test('compile failure → compilation error', () => {
    const r = normalize({ compile: { code: 1, stderr: 'syntax error' }, run: { code: 0 } });
    expect(r.status).toBe('Compilation Error');
    expect(r.compileOutput).toBe('syntax error');
  });
});

describe('piston kernel run', () => {
  const orig = global.fetch;
  afterEach(() => {
    global.fetch = orig;
  });

  test('resolves version from /runtimes then executes', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ language: 'python', version: '3.10.0', aliases: ['py'] }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ run: { stdout: 'ok\n', code: 0 } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const kernel = createPistonKernel({ baseUrl: 'http://piston:2000' });
    const result = await kernel.run({ language: 'python', source: 'print("ok")', stdin: '' });
    expect(result.stdout).toBe('ok\n');

    expect(fetchMock.mock.calls[0][0]).toContain('/api/v2/runtimes');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('/api/v2/execute');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.language).toBe('python');
    expect(body.version).toBe('3.10.0');
    expect(body.files[0].content).toBe('print("ok")');
  });

  test('maps cpp → c++ and throws for a language not installed', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [{ language: 'python', version: '3.10.0' }] }) as unknown as typeof fetch;
    const kernel = createPistonKernel({ baseUrl: 'http://piston:2000' });
    await expect(kernel.run({ language: 'cpp', source: 'int main(){}' })).rejects.toThrow(/not installed.*c\+\+/);
  });

  test('throws when unconfigured', async () => {
    await expect(createPistonKernel({ baseUrl: '' }).run({ language: 'python', source: 'x' })).rejects.toThrow(/not configured/);
  });
});
