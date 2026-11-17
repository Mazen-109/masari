import { ping } from '@masari/db';
import { log } from '@/server/log';

/**
 * Liveness and database check (contracts/http-and-env.md §1.1, FR-045). No authentication, no details:
 * 200 `{"status":"ok"}` or 503 `{"status":"unavailable"}`, never cached. A GET route handler that reads
 * no request data would be prerendered at build time, so it is forced dynamic.
 */
export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(): Promise<Response> {
  try {
    await ping();
    return Response.json({ status: 'ok' }, { headers: HEADERS });
  } catch {
    log.warn('health.database_unavailable');
    return Response.json({ status: 'unavailable' }, { status: 503, headers: HEADERS });
  }
}
