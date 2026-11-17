#!/usr/bin/env node
// pnpm i18n:check — contracts/cli.md §1.
// Compares apps/web/messages/ar.json and en.json and exits 1 on any difference:
// missing keys on either side, keys that are a message on one side and a group on the other,
// empty values, invalid ICU messages, and messages whose ICU arguments or rich-text tags differ.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES_DIR = path.join(ROOT, 'apps/web/messages');
const LOCALES = ['ar', 'en'];

/** @param {string} file */
function readCatalog(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Flattens a catalog into `dotted.key → value` (objects are groups, everything else is a leaf).
 * @param {unknown} node
 * @param {string} prefix
 * @param {Map<string, unknown>} out
 */
function flatten(node, prefix, out) {
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    const entries = Object.entries(node);
    if (entries.length === 0 && prefix) out.set(prefix, node);
    for (const [key, value] of entries) flatten(value, prefix ? `${prefix}.${key}` : key, out);
  } else {
    out.set(prefix, node);
  }
  return out;
}

const PLURAL_TYPES = new Set(['plural', 'select', 'selectordinal']);

/**
 * Returns the sorted argument names (`name`) and tags (`<tag>`) of an ICU message.
 * Throws on unbalanced braces. Apostrophe quoting follows ICU: `'` starts a quote only before
 * `{`, `}`, `#`, `|`, or another `'`.
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
  const parseText = (nested) => {
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
        parseArgument();
      } else if (c === '}') {
        if (!nested) throw new Error('unexpected "}"');
        return;
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
  const parseArgument = () => {
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
    if (message[i] === '}') {
      i++;
      return;
    }
    if (message[i] !== ',') throw new Error('missing "}"');
    i++;
    if (PLURAL_TYPES.has(type)) {
      for (;;) {
        skipSpace();
        if (i >= message.length) throw new Error('missing "}"');
        if (message[i] === '}') {
          i++;
          return;
        }
        const selector = readUntil(['{', '}', ' ', '\n', '\t', '\r']);
        skipSpace();
        if (selector.startsWith('offset:')) continue;
        if (!selector || message[i] !== '{') throw new Error(`invalid option in "${name}"`);
        i++;
        parseText(true);
        i++; // the option's closing `}`
      }
    }
    // number/date/time style: skip to the matching `}`.
    let depth = 1;
    while (i < message.length && depth > 0) {
      if (message[i] === '{') depth++;
      else if (message[i] === '}') depth--;
      i++;
    }
    if (depth > 0) throw new Error('missing "}"');
  };

  parseText(false);
  return [...names].sort();
}

function main() {
  const flat = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      flatten(readCatalog(path.join(MESSAGES_DIR, `${locale}.json`)), '', new Map()),
    ]),
  );
  const problems = [];
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

  if (problems.length > 0) {
    process.stderr.write(
      `i18n check failed (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`i18n check passed: ${flat[base].size} keys in ${LOCALES.join(', ')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
