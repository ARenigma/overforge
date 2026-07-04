import { Pcm16Aligner, SseEventParser, prepareTranscript, splitSentences } from './cartesia';

describe('prepareTranscript (TTS spoken-text normalization)', () => {
  test('expands snake_case identifiers to spoken words', () => {
    expect(prepareTranscript('what max_attempts did you set')).toBe(
      'what max attempts did you set'
    );
    expect(prepareTranscript('retry_count and dag_id')).toBe('retry count and dag id');
  });

  test('splits camelCase / PascalCase identifiers', () => {
    expect(prepareTranscript('the ExternalTaskSensor timed out')).toBe(
      'the External Task Sensor timed out'
    );
    expect(prepareTranscript('set maxAttempts high')).toBe('set max Attempts high');
  });

  test('strips backticks', () => {
    expect(prepareTranscript('use the `retry` flag')).toBe('use the retry flag');
  });

  test('leaves ordinary prose untouched', () => {
    const prose = 'Can you walk me through the hardest decision and why you made it?';
    expect(prepareTranscript(prose)).toBe(prose);
  });

  test('does not mangle hyphenated words or all-caps acronyms', () => {
    expect(prepareTranscript('a state-of-the-art DAG on AWS')).toBe(
      'a state-of-the-art DAG on AWS'
    );
  });
});

describe('Pcm16Aligner', () => {
  test('passes even-length chunks through unchanged', () => {
    const a = new Pcm16Aligner();
    const out = a.push(Buffer.from([1, 2, 3, 4]));
    expect(out).not.toBeNull();
    expect([...out!]).toEqual([1, 2, 3, 4]);
  });

  test('carries a trailing odd byte into the next chunk', () => {
    const a = new Pcm16Aligner();
    const first = a.push(Buffer.from([1, 2, 3])); // odd — byte 3 carried
    expect([...first!]).toEqual([1, 2]);
    const second = a.push(Buffer.from([4, 5, 6])); // 3 + [4,5,6] = 4 even bytes
    expect([...second!]).toEqual([3, 4, 5, 6]);
  });

  test('a 1-byte chunk yields null until its partner arrives', () => {
    const a = new Pcm16Aligner();
    expect(a.push(Buffer.from([9]))).toBeNull();
    expect([...a.push(Buffer.from([10]))!]).toEqual([9, 10]);
  });

  test('reassembles the exact byte sequence across many odd splits', () => {
    const src = Buffer.from(Array.from({ length: 31 }, (_, i) => i));
    const a = new Pcm16Aligner();
    const out: Buffer[] = [];
    // Feed in awkward split sizes: 1, 3, 5, 7, ... bytes.
    let off = 0;
    for (let n = 1; off < src.length; n += 2) {
      const piece = a.push(src.subarray(off, Math.min(off + n, src.length)));
      if (piece) out.push(piece);
      off += n;
    }
    const joined = Buffer.concat(out);
    expect(joined.length % 2).toBe(0);
    expect([...joined]).toEqual([...src.subarray(0, joined.length)]);
    expect(src.length - joined.length).toBeLessThanOrEqual(1); // at most the final odd byte held
  });

  test('carried byte survives even when the source buffer is reused', () => {
    const scratch = Buffer.from([1, 2, 3]);
    const a = new Pcm16Aligner();
    a.push(scratch);
    scratch[2] = 99; // mutate after push — the aligner must have copied its carry
    expect([...a.push(Buffer.from([4]))!]).toEqual([3, 4]);
  });
});

describe('SseEventParser', () => {
  test('parses a single complete event', () => {
    const p = new SseEventParser();
    expect(p.push('data: {"type":"chunk"}\n\n')).toEqual(['{"type":"chunk"}']);
  });

  test('reassembles an event split across pushes', () => {
    const p = new SseEventParser();
    expect(p.push('data: {"type":"ch')).toEqual([]);
    expect(p.push('unk","data":"AA=="}\n\n')).toEqual(['{"type":"chunk","data":"AA=="}']);
  });

  test('returns multiple events from one push and ignores non-data lines', () => {
    const p = new SseEventParser();
    const events = p.push('event: chunk\ndata: {"a":1}\n\n: keepalive\n\nid: 7\ndata: {"b":2}\n\n');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  test('handles CRLF line endings', () => {
    const p = new SseEventParser();
    expect(p.push('data: {"done":true}\r\n\r\n')).toEqual(['{"done":true}']);
  });

  test('joins multi-line data fields with newlines', () => {
    const p = new SseEventParser();
    expect(p.push('data: line1\ndata: line2\n\n')).toEqual(['line1\nline2']);
  });
});

describe('splitSentences', () => {
  test('splits on sentence boundaries and merges tiny fragments', () => {
    const chunks = splitSentences('Hi. Welcome to the interview! How are you today?');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join(' ')).toBe('Hi. Welcome to the interview! How are you today?');
  });

  test('caps the number of chunks by folding overflow into the last', () => {
    const text = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i}.`).join(' ');
    const chunks = splitSentences(text, 4);
    expect(chunks.length).toBe(4);
    expect(chunks.join(' ')).toBe(text);
  });
});
