import { generateToken, hashToken } from './token';

describe('candidate access token', () => {
  test('hashToken is deterministic and sha256-hex (64 chars)', () => {
    const t = 'some-raw-token';
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  test('generateToken is URL-safe and unique', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: no +, /, =
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});
