import { isAllowedAuthRequest } from '@/server/auth/allowed-paths';
import { getAuth } from '@/server/auth/auth';

/**
 * The auth library's HTTP handler behind the allow-list (contracts/http-and-env.md §1.2, FR-013): only the
 * email link targets reach the library; everything else is an empty 404 and the library is never called
 * (nor created). Every method is exported so that a refused method answers 404, not 405. HEAD falls back
 * to GET in Next.js and is refused there by the method check.
 */

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedAuthRequest(request.method, new URL(request.url).pathname)) return notFound();
  return getAuth().handler(request);
}

export function POST(): Response {
  return notFound();
}

export function PUT(): Response {
  return notFound();
}

export function PATCH(): Response {
  return notFound();
}

export function DELETE(): Response {
  return notFound();
}

export function OPTIONS(): Response {
  return notFound();
}
