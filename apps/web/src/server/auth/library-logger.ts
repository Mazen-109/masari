import { log } from '@/server/log';

/**
 * Better Auth's `logger.log` (research.md §20, contracts/http-and-env.md §4). The library passes free-text
 * messages and raw error objects — a failed insert's DrizzleQueryError carries the SQL parameters, i.e. the
 * name and email being registered — so only the level is kept: the message and every extra argument are
 * dropped, and one constant `auth.library` event goes through `log.ts`. The level threshold stays the
 * library's default (`warn`); setting `logger.level` explicitly would also make the library print API
 * errors through its own console logger.
 */
export function logAuthLibrary(level: 'debug' | 'info' | 'warn' | 'error'): void {
  if (level === 'error') log.error('auth.library', { libraryLevel: level });
  else log.warn('auth.library', { libraryLevel: level });
}
