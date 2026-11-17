import { notFound } from 'next/navigation';

// Unknown paths under a valid locale render the localized `[locale]/not-found.tsx` (inside the
// locale layout) instead of the bare fallback 404.
export default function CatchAllPage() {
  notFound();
}
