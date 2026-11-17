/**
 * JSON-lines logger (contracts/http-and-env.md §4, research.md §20). One object per line:
 * `{ level, time, event, ...fields }`. Field values are IDs, counts, codes, and durations only — never
 * emails, names, student codes, passwords, tokens, cookies, request bodies, or URLs with query strings.
 * This is the only file in apps/web/src allowed to use console.
 */

export type LogFields = Record<string, string | number | boolean | null>;
type Level = 'info' | 'warn' | 'error';

const RESERVED = new Set(['level', 'time', 'event']);

function write(level: Level, event: string, fields: LogFields = {}): void {
  const line: Record<string, unknown> = { level, time: new Date().toISOString(), event };
  for (const [key, value] of Object.entries(fields)) {
    // The three envelope keys always describe the line itself; a field cannot overwrite them.
    if (!RESERVED.has(key)) line[key] = value;
  }
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const log = {
  info(event: string, fields?: LogFields): void {
    write('info', event, fields);
  },
  warn(event: string, fields?: LogFields): void {
    write('warn', event, fields);
  },
  error(event: string, fields?: LogFields): void {
    write('error', event, fields);
  },
};
