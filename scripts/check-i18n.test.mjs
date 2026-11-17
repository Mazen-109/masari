// node --test scripts/ — table tests for the i18n gate (run by `pnpm test`).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCatalogs, findDuplicateKeys, icuArguments } from './check-i18n.mjs';

describe('icuArguments', () => {
  const valid = [
    ['plain text', []],
    ['Hi {name}', ['name']],
    ['{a} and {b} and {a}', ['a', 'b']],
    ['{count, plural, one {one item} other {{shown} items}}', ['count', 'shown']],
    ['{count, plural, offset:1 =0 {none} other {{n} more}}', ['count', 'n']],
    ['{gender, select, male {He} female {She} other {They}}', ['gender']],
    ['{n, selectordinal, one {first} other {later}}', ['n']],
    ["It's fine", []],
    ["Use '{braces}' literally", []],
    ["Two '' apostrophes", []],
    ['A # outside plural is text', []],
    ["{count, plural, other {quoted '#' sign}}", ['count']],
    ['<b>bold</b> and <link>here</link>', ['<b>', '<link>']],
    ['a < b', []],
    ['{الاسم}', ['الاسم']],
  ];
  for (const [message, expected] of valid) {
    it(`parses ${JSON.stringify(message)}`, () => {
      assert.deepEqual(icuArguments(message), expected);
    });
  }

  const invalid = [
    ['{a', /missing "}"/],
    ['a}', /unexpected "}"/],
    ['{}', /invalid argument name/],
    ['{a b}', /invalid argument name/],
    ["'{unterminated", /unterminated quote/],
    ['{x, plural, one {a} other {b}', /missing "}"/],
    ['{x, plural, one a}', /invalid option/],
    ['{x, select}', /needs options/],
    ['{x, spellout}', /unknown argument type/],
    ['{n, number}', /FR-041/],
    ['{n, number, percent}', /FR-041/],
    ['{d, date, short}', /FR-041/],
    ['{t, time}', /FR-041/],
    ['{count, plural, one {# item} other {# items}}', /FR-041/],
    ['{n, selectordinal, other {#th}}', /FR-041/],
    ['{count, plural, other {{g, select, other {#}}}}', /FR-041/],
  ];
  for (const [message, error] of invalid) {
    it(`rejects ${JSON.stringify(message)}`, () => {
      assert.throws(() => icuArguments(message), error);
    });
  }
});

describe('findDuplicateKeys', () => {
  it('finds nothing in a clean catalog', () => {
    assert.deepEqual(findDuplicateKeys('{"a": {"b": "x", "c": "y"}, "d": ["e", {"f": 1}]}'), []);
  });

  it('reports duplicates with their dotted path', () => {
    assert.deepEqual(findDuplicateKeys('{"a": "1", "a": "2"}'), ['a']);
    assert.deepEqual(findDuplicateKeys('{"g": {"k": "1", "x": "\\"k\\"", "k": "2"}}'), ['g.k']);
  });

  it('allows the same key in different objects', () => {
    assert.deepEqual(findDuplicateKeys('{"a": {"k": "1"}, "b": {"k": "2"}}'), []);
  });
});

describe('checkCatalogs', () => {
  const ar = JSON.stringify({ common: { hi: 'مرحبًا {name}', bye: 'مع السلامة' } });

  it('passes identical shapes', () => {
    const en = JSON.stringify({ common: { hi: 'Hi {name}', bye: 'Bye' } });
    assert.deepEqual(checkCatalogs({ ar, en }), { problems: [], keyCount: 2 });
  });

  it('names a key missing from en.json', () => {
    const en = JSON.stringify({ common: { hi: 'Hi {name}' } });
    assert.deepEqual(checkCatalogs({ ar, en }).problems, ['en.json: missing key "common.bye"']);
  });

  it('reports empty values, differing arguments, duplicates, and non-strings', () => {
    const en = '{"common": {"hi": "Hi {who}", "bye": " ", "bye": "Bye"}, "extra": 1}';
    const arWithExtra = JSON.stringify({ ...JSON.parse(ar), extra: 'x' });
    assert.deepEqual(checkCatalogs({ ar: arWithExtra, en }).problems, [
      'en.json: duplicate key "common.bye"',
      'en.json: "extra" must be a string message or a group of messages',
      'ICU arguments differ for key "common.hi": ar [name] vs en [who]',
    ]);
    const enEmpty = JSON.stringify({ common: { hi: 'Hi {name}', bye: ' ' } });
    assert.deepEqual(checkCatalogs({ ar, en: enEmpty }).problems, [
      'en.json: empty value for key "common.bye"',
    ]);
  });

  it('reports invalid ICU messages per locale', () => {
    const en = JSON.stringify({ common: { hi: 'Hi {name, number}', bye: 'Bye' } });
    const [problem] = checkCatalogs({ ar, en }).problems;
    assert.match(problem, /^en\.json: invalid ICU message for key "common\.hi": .*FR-041/);
  });
});
