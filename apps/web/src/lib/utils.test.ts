import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins truthy class names and skips falsy ones', () => {
    expect(cn('flex', false, undefined, null, 'gap-2', { 'mt-2': false, 'pt-4': true })).toBe(
      'flex gap-2 pt-4',
    );
  });

  it('lets a later utility override a conflicting earlier one', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('ms-2', 'ms-4')).toBe('ms-4');
    expect(cn('bg-primary', 'bg-danger')).toBe('bg-danger');
  });

  it('keeps a token colour and a font size side by side', () => {
    expect(cn('text-sm', 'text-primary-foreground')).toBe('text-sm text-primary-foreground');
  });
});
