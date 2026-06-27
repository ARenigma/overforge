import { FILLERS, getFillerCount, pickFillerIndex } from './fillers';
import { _clearFillerCache, getFillerAudio } from './fillerCache';
import { CartesiaConfig } from './cartesia';

const cfg: CartesiaConfig = { apiKey: 'k', voiceId: 'v', model: 'sonic-2', version: '2024-11-13' };

describe('fillers', () => {
  test('FILLERS is a non-empty frozen list of short phrases', () => {
    expect(FILLERS.length).toBeGreaterThan(0);
    expect(Object.isFrozen(FILLERS)).toBe(true);
    for (const p of FILLERS) {
      expect(p.trim().length).toBeGreaterThan(0);
      expect(p.length).toBeLessThan(40); // short acknowledgements, not sentences
    }
  });

  test('pickFillerIndex stays in range over many draws', () => {
    for (let i = 0; i < 1000; i++) {
      const idx = pickFillerIndex();
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(getFillerCount());
    }
  });
});

describe('fillerCache', () => {
  beforeEach(() => _clearFillerCache());

  test('synthesizes each index at most once across N requests', async () => {
    const synth = jest.fn(async (text: string) => Buffer.from(`wav:${text}`));
    for (let i = 0; i < 5; i++) await getFillerAudio(0, cfg, synth);
    expect(synth).toHaveBeenCalledTimes(1);
    expect(synth).toHaveBeenCalledWith(FILLERS[0], cfg);
  });

  test('concurrent first-calls for the same index coalesce to ONE synthesize', async () => {
    let calls = 0;
    const synth = jest.fn(async (text: string) => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return Buffer.from(text);
    });
    const results = await Promise.all([
      getFillerAudio(1, cfg, synth),
      getFillerAudio(1, cfg, synth),
      getFillerAudio(1, cfg, synth),
    ]);
    expect(calls).toBe(1);
    for (const b of results) expect(b.toString()).toBe(FILLERS[1]);
  });

  test('different indices synthesize independently', async () => {
    const synth = jest.fn(async (text: string) => Buffer.from(text));
    await getFillerAudio(0, cfg, synth);
    await getFillerAudio(2, cfg, synth);
    expect(synth).toHaveBeenCalledTimes(2);
  });

  test('out-of-range index rejects', async () => {
    await expect(getFillerAudio(999, cfg, jest.fn())).rejects.toThrow(/out of range/);
  });

  test('a failed synth is not cached (the next call retries)', async () => {
    const synth = jest
      .fn<Promise<Buffer>, [string, CartesiaConfig?]>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(Buffer.from('ok'));
    await expect(getFillerAudio(3, cfg, synth)).rejects.toThrow('boom');
    const b = await getFillerAudio(3, cfg, synth);
    expect(b.toString()).toBe('ok');
    expect(synth).toHaveBeenCalledTimes(2);
  });
});
