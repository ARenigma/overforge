jest.mock('child_process', () => ({ execFile: jest.fn() }));
import { execFile } from 'child_process';
import { createDockerKernel } from './docker';

const mockExec = execFile as unknown as jest.Mock;

// execFile(cmd, args, opts, cb) — drive cb how the test wants.
function onRun(
  impl: (args: string[], cb: (err: unknown, out: string, errOut: string) => void) => void
) {
  mockExec.mockImplementation(
    (
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: (e: unknown, o: string, s: string) => void
    ) => impl(args, cb)
  );
}

afterEach(() => mockExec.mockReset());

describe('docker execution kernel', () => {
  test('rejects an unsupported language', async () => {
    await expect(createDockerKernel().run({ language: 'cobol', source: 'x' })).rejects.toThrow(
      /Unsupported language/
    );
  });

  test('accepted run returns stdout + locked-down docker args', async () => {
    let captured: string[] = [];
    onRun((args, cb) => {
      captured = args;
      cb(null, '42\n', '');
    });
    const r = await createDockerKernel().run({
      language: 'python',
      source: 'print(40+2)',
      stdin: '',
    });
    expect(r.status).toBe('Accepted');
    expect(r.stdout).toBe('42\n');
    expect(r.exitCode).toBe(0);
    // sandbox flags present
    expect(captured).toEqual(
      expect.arrayContaining(['--network', 'none', '--read-only', '--cap-drop', 'ALL'])
    );
    expect(captured).toContain('python:3.12-slim');
    // source passed base64 via env, never interpolated into a shell
    const srcEnv = captured.find((a) => a.startsWith('B64SRC='));
    expect(srcEnv).toBe(`B64SRC=${Buffer.from('print(40+2)').toString('base64')}`);
  });

  test('go run gets writable scratch + a persistent warm GOCACHE volume', async () => {
    let captured: string[] = [];
    onRun((args, cb) => {
      captured = args;
      cb(null, 'ok\n', '');
    });
    await createDockerKernel().run({ language: 'go', source: 'package main' });
    // Scratch dirs writable (else "mkdir /tmp/go-build…: read-only file system"), and
    // GOCACHE on the pre-warmed shared volume (else the stdlib recompiles cold every run).
    expect(captured).toEqual(
      expect.arrayContaining([
        '-v',
        'of-go-cache:/gocache',
        '-e',
        'HOME=/work',
        '-e',
        'TMPDIR=/work',
        '-e',
        'GOCACHE=/gocache',
        '-e',
        'GOPATH=/work/go',
        '-e',
        'GOTMPDIR=/work',
      ])
    );
  });

  test('host-side kill → Time Limit Exceeded', async () => {
    onRun((_args, cb) => cb(Object.assign(new Error('killed'), { killed: true }), '', ''));
    const r = await createDockerKernel({ wallTimeoutMs: 50 }).run({
      language: 'python',
      source: 'while True: pass',
    });
    expect(r.status).toBe('Time Limit Exceeded');
  });

  test('in-container timeout exit 124 → Time Limit Exceeded', async () => {
    onRun((_args, cb) => cb(Object.assign(new Error('x'), { code: 124 }), '', ''));
    expect((await createDockerKernel().run({ language: 'go', source: 'x' })).status).toBe(
      'Time Limit Exceeded'
    );
  });

  test('nonzero exit → Runtime Error', async () => {
    onRun((_args, cb) => cb(Object.assign(new Error('x'), { code: 1 }), '', 'boom'));
    const r = await createDockerKernel().run({ language: 'javascript', source: 'throw 1' });
    expect(r.status).toBe('Runtime Error');
    expect(r.stderr).toBe('boom');
  });
});
