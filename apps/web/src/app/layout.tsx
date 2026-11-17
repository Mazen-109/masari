import type { ReactNode } from 'react';

// The document (`<html lang dir>`) is rendered by `[locale]/layout.tsx`. This pass-through root
// layout exists only because `app/not-found.tsx` (paths without a valid locale) needs a parent.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
