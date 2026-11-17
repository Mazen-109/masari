#!/usr/bin/env node
// pnpm i18n:check — contracts/cli.md §1.
// Compares apps/web/messages/ar.json and en.json and exits 1 on any difference: missing keys on
// either side, duplicate keys, keys that are a message on one side and a group on the other, empty
// values, keys containing `.`, invalid JSON or ICU messages (plural/select need an `other` option),
// and messages whose ICU arguments or rich-text tags differ.
// FR-041 (Western digits): messages never let ICU format numbers or dates — `{x, number}`,
// `{x, date}`, `{x, time}`, and `#` inside plural/selectordinal are rejected; pass values
// pre-formatted with `apps/web/src/lib/format.ts`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES_DIR = path.join(ROOT, 'apps/web/messages');
export const LOCALES = ['ar', 'en'];

const PLURAL_TYPES = new Set(['plural', 'selectordinal']);
const SELECT_TYPES = new Set(['plural', 'select', 'selectordinal']);
const FORMATTED_TYPES = new Set(['number', 'date', 'time']);

/**
 * Returns the dotted paths of keys that appear more than once in the same JSON object
 * (`JSON.parse` silently keeps the last one). Assumes `text` is valid JSON.
 * @param {string} text
 */
export function findDuplicateKeys(text) {
  const duplicates = [];
  /** @type {Array<{ keys: Set<string>, path: string, isObject: boolean, lastKey: string }>} */
  const stack = [];
  let i = 0;
  const readString = () => {
    const start = i;
    i++; // opening quote
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  while (i < text.length) {
    const c = text[i];
    const top = stack[stack.length - 1];
    if (c === '{' || c === '[') {
      const parentPath = top ? (top.isObject ? top.lastKey : top.path) : '';
      stack.push({ keys: new Set(), path: parentPath, isObject: c === '{', lastKey: '' });
      i++;
    } else if (c === '}' || c === ']') {
      stack.pop();
      i++;
    } else if (c === '"') {
      const value = readString();
      let j = i;
      while (/\s/.test(text[j] ?? '')) j++;
      if (top?.isObject && text[j] === ':') {
        const keyPath = top.path ? `${top.path}.${value}` : value;
        if (top.keys.has(value)) duplicates.push(keyPath);
        top.keys.add(value);
        top.lastKey = keyPath;
      }
    } else {
      i++;
    }
  }
  return duplicates;
}

/**
 * Flattens a catalog into `dotted.key → value` (objects are groups, everything else is a leaf).
 * Keys that are empty or contain `.` are collected in `badKeys`: next-intl reads `.` as nesting, so
 * `"a.b"` and `a: { b }` would collide.
 * @param {unknown} node
 * @param {string} prefix
 * @param {Map<string, unknown>} out
 * @param {string[]} badKeys
 */
function flatten(node, prefix, out, badKeys) {
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    const entries = Object.entries(node);
    if (entries.length === 0 && prefix) out.set(prefix, node);
    for (const [key, value] of entries) {
      const keyPath = prefix ? `${prefix}.${key}` : key;
      if (key === '' || key.includes('.')) badKeys.push(keyPath);
      flatten(value, keyPath, out, badKeys);
    }
  } else {
    out.set(prefix, node);
  }
  return out;
}

/**
 * Returns the sorted argument names (`name`) and tags (`<tag>`) of an ICU message.
 * Throws on unbalanced braces and on number/date formatting (FR-041). Apostrophe quoting follows
 * ICU: `'` starts a quote only before `{`, `}`, `#`, `|`, or another `'`.
 * @param {string} message
 */
export function icuArguments(message) {
  const names = new Set();
  let i = 0;

  const isSpace = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
  const skipSpace = () => {
    while (i < message.length && isSpace(message[i])) i++;
  };
  const readUntil = (stops) => {
    const start = i;
    while (i < message.length && !stops.includes(message[i])) i++;
    return message.slice(start, i).trim();
  };

  // Parses message text until an unmatched `}` (nested) or the end (top level).
  const parseText = (nested, inPlural) => {
    while (i < message.length) {
      const c = message[i];
      if (c === "'") {
        const next = message[i + 1];
        if (next === "'") {
          i += 2;
        } else if (next !== undefined && '{}#|'.includes(next)) {
          const end = message.indexOf("'", i + 1);
          if (end === -1) throw new Error('unterminated quote');
          i = end + 1;
        } else {
          i++;
        }
      } else if (c === '{') {
        i++;
        parseArgument(inPlural);
      } else if (c === '}') {
        if (!nested) throw new Error('unexpected "}"');
        return;
      } else if (c === '#' && inPlural) {
        throw new Error('"#" formats the count with ICU; pass a pre-formatted value (FR-041)');
      } else if (c === '<') {
        const tag = /^<\/?([A-Za-z][\w-]*)\s*\/?>/.exec(message.slice(i));
        if (tag) {
          names.add(`<${tag[1]}>`);
          i += tag[0].length;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    if (nested) throw new Error('missing "}"');
  };

  // Called after `{`; consumes through the matching `}`.
  const parseArgument = (inPlural) => {
    const name = readUntil([',', '}']);
    if (!/^[\p{L}\p{N}_]+$/u.test(name)) throw new Error(`invalid argument name "${name}"`);
    names.add(name);
    if (message[i] === '}') {
      i++;
      return;
    }
    if (message[i] !== ',') throw new Error('missing "}"');
    i++;
    const type = readUntil([',', '}']);
    if (FORMATTED_TYPES.has(type)) {
      throw new Error(
        `"{${name}, ${type}}" formats with ICU; pass a value pre-formatted with lib/format (FR-041)`,
      );
    }
    if (!SELECT_TYPES.has(type)) throw new Error(`unknown argument type "${type}"`);
    if (message[i] !== ',') throw new Error(`"${type}" of "${name}" needs options`);
    i++;
    const optionsInPlural = inPlural || PLURAL_TYPES.has(type);
    let hasOther = false;
    for (;;) {
      skipSpace();
      if (i >= message.length) throw new Error('missing "}"');
      if (message[i] === '}') {
        if (!hasOther) throw new Error(`"${type}" of "${name}" needs an "other" option`);
        i++;
        return;
      }
      const selector = readUntil(['{', '}', ' ', '\n', '\t', '\r']);
      skipSpace();
      if (selector.startsWith('offset:')) continue;
      if (!selector || message[i] !== '{') throw new Error(`invalid option in "${name}"`);
      if (selector === 'other') hasOther = true;
      i++;
      parseText(true, optionsInPlural);
      i++; // the option's closing `}`
    }
  };

  parseText(false, false);
  return [...names].sort();
}

/**
 * Checks the catalogs given as raw JSON text per locale; returns the list of problems.
 * @param {Record<string, string>} sources
 */
export function checkCatalogs(sources) {
  const problems = [];
  const flat = {};
  for (const locale of LOCALES) {
    let catalog;
    try {
      catalog = JSON.parse(sources[locale]);
    } catch (error) {
      problems.push(`${locale}.json: invalid JSON: ${error.message}`);
      continue;
    }
    for (const key of findDuplicateKeys(sources[locale])) {
      problems.push(`${locale}.json: duplicate key "${key}"`);
    }
    const badKeys = [];
    flat[locale] = flatten(catalog, '', new Map(), badKeys);
    for (const key of badKeys) {
      problems.push(`${locale}.json: key "${key}" must not be empty or contain "."`);
    }
  }
  if (problems.some((problem) => problem.includes(': invalid JSON: '))) {
    return { problems, keyCount: 0 };
  }
  const [base, other] = LOCALES;

  for (const [locale, otherSide] of [
    [base, other],
    [other, base],
  ]) {
    for (const key of flat[otherSide].keys()) {
      if (!flat[locale].has(key)) problems.push(`${locale}.json: missing key "${key}"`);
    }
  }

  for (const locale of LOCALES) {
    for (const [key, value] of flat[locale]) {
      if (typeof value !== 'string') {
        problems.push(`${locale}.json: "${key}" must be a string message or a group of messages`);
      } else if (value.trim() === '') {
        problems.push(`${locale}.json: empty value for key "${key}"`);
      }
    }
  }

  for (const [key, baseValue] of flat[base]) {
    const otherValue = flat[other].get(key);
    if (typeof baseValue !== 'string' || typeof otherValue !== 'string') continue;
    const args = {};
    for (const [locale, value] of [
      [base, baseValue],
      [other, otherValue],
    ]) {
      try {
        args[locale] = icuArguments(value);
      } catch (error) {
        problems.push(`${locale}.json: invalid ICU message for key "${key}": ${error.message}`);
      }
    }
    if (args[base] && args[other] && args[base].join('|') !== args[other].join('|')) {
      problems.push(
        `ICU arguments differ for key "${key}": ${base} [${args[base].join(', ')}] vs ${other} [${args[other].join(', ')}]`,
      );
    }
  }

  return { problems, keyCount: flat[base].size };
}

function main() {
  const sources = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf8'),
    ]),
  );
  let result;
  try {
    result = checkCatalogs(sources);
  } catch (error) {
    process.stderr.write(`i18n check failed: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const { problems, keyCount } = result;
  if (problems.length > 0) {
    process.stderr.write(
      `i18n check failed (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`i18n check passed: ${keyCount} keys in ${LOCALES.join(', ')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
