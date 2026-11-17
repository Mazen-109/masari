import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { getEnv } from '@/server/env';

/**
 * Client network address (contracts/http-and-env.md §5). X-Forwarded-For is written by whoever sends the
 * request, so only the entry added by the outermost of the deployment's own proxies is trusted: the one
 * TRUSTED_PROXY_HOPS positions from the right. Entries to its left come from the client and are never used.
 * The raw header is never logged or stored.
 */

/** Pure rule behind getClientIp(): the trusted entry, or null when there is none or it is not an IP. */
export function clientIpFromHeader(forwardedFor: string | null, hops: number): string | null {
  if (!Number.isSafeInteger(hops) || hops < 1 || forwardedFor === null) return null;
  const entries = forwardedFor.split(',').map((entry) => entry.trim());
  if (entries.length < hops) return null;
  const chosen = entries[entries.length - hops];
  return chosen !== undefined && isIP(chosen) !== 0 ? chosen : null;
}

/** The client's IP address, or null when it cannot be established from a trusted source. */
export async function getClientIp(): Promise<string | null> {
  const requestHeaders = await headers();
  return clientIpFromHeader(requestHeaders.get('x-forwarded-for'), getEnv().TRUSTED_PROXY_HOPS);
}
