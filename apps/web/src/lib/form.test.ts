import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formFields, parseForm } from '@/lib/form';

const schema = z.object({
  name: z.string({ error: 'required' }).trim().min(1, { error: 'required' }),
  code: z.string({ error: 'required' }).regex(/^\d+$/, { error: 'invalid_format' }),
});

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe('formFields', () => {
  it('keeps the first value of each name and treats __proto__ as a plain field', () => {
    const data = new FormData();
    data.append('a', '1');
    data.append('a', '2');
    data.append('__proto__', 'x');
    const fields = formFields(data);
    expect(fields).toStrictEqual(
      Object.fromEntries([
        ['a', '1'],
        ['__proto__', 'x'],
      ]),
    );
    expect(Object.getPrototypeOf(fields)).toBe(Object.prototype);
  });
});

describe('parseForm', () => {
  it('returns the parsed data without unknown fields', () => {
    const result = parseForm(schema, form({ name: ' Mona ', code: '12', role: 'admin' }));
    expect(result).toStrictEqual({ ok: true, data: { name: 'Mona', code: '12' } });
  });

  it('returns validation with the first error code of each field', () => {
    const result = parseForm(schema, form({ name: '   ', code: 'x' }));
    expect(result).toStrictEqual({
      ok: false,
      failure: {
        ok: false,
        code: 'validation',
        fieldErrors: { name: 'required', code: 'invalid_format' },
      },
    });
  });

  it('reports a missing field with the schema error code', () => {
    const result = parseForm(schema, form({ code: '1' }));
    expect(result.ok ? null : result.failure).toMatchObject({ fieldErrors: { name: 'required' } });
  });

  it('reads a duplicated field with its first value, like FormData.get', () => {
    const data = form({ name: 'Mona', code: '12' });
    data.append('name', 'Second');
    data.append('code', 'x');
    expect(parseForm(schema, data)).toStrictEqual({ ok: true, data: { name: 'Mona', code: '12' } });
    expect(formFields(data).name).toBe(data.get('name'));
  });

  it('maps a message that is not a field error code to invalid_format', () => {
    const strict = z.object({ age: z.string().regex(/^\d+$/, { error: 'Not a number' }) });
    const result = parseForm(strict, form({ age: 'x' }));
    expect(result.ok ? null : result.failure).toMatchObject({
      fieldErrors: { age: 'invalid_format' },
    });
  });
});
