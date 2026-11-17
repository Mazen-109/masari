import { describe, expect, it } from 'vitest';
import { isAllowedAuthRequest } from './allowed-paths';

// contracts/http-and-env.md §1.2: only the email link targets, only with GET.

// A made-up 24-character reset token built from a pattern, so scanners don't mistake it for a secret.
const TOKEN = 'Ab1'.repeat(8);

describe('isAllowedAuthRequest', () => {
  it.each([
    '/api/auth/verify-email',
    '/api/auth/error',
    `/api/auth/reset-password/${TOKEN}`,
    '/api/auth/reset-password/abc_DEF-123',
  ])('allows GET %s', (pathname) => {
    expect(isAllowedAuthRequest('GET', pathname)).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'get', 'TRACE'])(
    'refuses %s on every allowed path',
    (method) => {
      for (const pathname of [
        '/api/auth/verify-email',
        '/api/auth/error',
        `/api/auth/reset-password/${TOKEN}`,
      ]) {
        expect(isAllowedAuthRequest(method, pathname)).toBe(false);
      }
    },
  );

  it.each([
    // The library's own endpoints
    '/api/auth/sign-up/email',
    '/api/auth/sign-in/email',
    '/api/auth/get-session',
    '/api/auth/sign-out',
    '/api/auth/request-password-reset',
    '/api/auth/reset-password',
    '/api/auth/send-verification-email',
    '/api/auth/ok',
    '/api/auth',
    '/api/auth/',
    // Trailing slashes and extra segments
    '/api/auth/verify-email/',
    '/api/auth/error/',
    `/api/auth/reset-password/${TOKEN}/`,
    '/api/auth/reset-password/',
    `/api/auth/reset-password/${TOKEN}/extra`,
    '/api/auth/verify-email/extra',
    // Encoded characters
    '/api/auth/verify%2Demail',
    '/api/auth/%76erify-email',
    `/api/auth/reset-password/${TOKEN}%2F..%2F..%2Fsign-up%2Femail`,
    '/api/auth/reset-password/%2e%2e',
    '/api/auth/reset-password/abc%20def',
    // Dot segments (left in place if a caller passes an unparsed path)
    '/api/auth/verify-email/../sign-up/email',
    '/api/auth/reset-password/..',
    '/api/auth/reset-password/.',
    '/api/auth/../auth/verify-email',
    '/api/auth/./verify-email',
    // Case, prefixes, and other paths
    '/API/AUTH/VERIFY-EMAIL',
    '/api/auth/Verify-Email',
    '/api/auth//verify-email',
    '//api/auth/verify-email',
    '/ar/api/auth/verify-email',
    '/api/auth/verify-email?x=1',
    '/api/auth/error#x',
    '',
    `/api/auth/reset-password/${'a'.repeat(257)}`,
  ])('refuses GET %s', (pathname) => {
    expect(isAllowedAuthRequest('GET', pathname)).toBe(false);
  });
});
