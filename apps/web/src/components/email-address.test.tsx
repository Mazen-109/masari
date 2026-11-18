import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmailAddress, emailBreakPieces } from './email-address';

describe('emailBreakPieces', () => {
  it('allows a break after the @ and before each dot, nowhere else', () => {
    expect(emailBreakPieces('shot.admin@example.edu')).toEqual([
      'shot',
      null,
      '.admin@',
      null,
      'example',
      null,
      '.edu',
    ]);
  });

  it('keeps a plain word whole and never starts with a break', () => {
    expect(emailBreakPieces('nobody')).toEqual(['nobody']);
    expect(emailBreakPieces('.x@y')).toEqual(['.x@', null, 'y']);
    expect(emailBreakPieces('')).toEqual([]);
  });

  it('always joins back to the address', () => {
    const email = 'a.b-c@mail.uni.example.edu.eg';
    expect(emailBreakPieces(email).join('')).toBe(email);
  });
});

describe('EmailAddress', () => {
  it('renders the address as isolated LTR text with <wbr> break points', () => {
    expect(renderToStaticMarkup(<EmailAddress email="dean@college.edu" />)).toBe(
      '<bdi dir="ltr">dean@<wbr/>college<wbr/>.edu</bdi>',
    );
  });
});
