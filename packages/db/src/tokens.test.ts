import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashInvitationToken } from './tokens';

describe('generateInvitationToken', () => {
  it('returns a 43-character base64url token and its 64-hex SHA-256 hash', () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashInvitationToken(token));
  });

  it('returns a different token (and hash) every time', () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });
});

describe('hashInvitationToken', () => {
  it('is the SHA-256 hex of the token', () => {
    const token = 'Xy9'.repeat(14) + 'Z';
    expect(hashInvitationToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('is deterministic and differs for different tokens', () => {
    const token = 'Ab1'.repeat(14) + 'A';
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(token)).not.toBe(hashInvitationToken(`${token}x`));
  });
});
