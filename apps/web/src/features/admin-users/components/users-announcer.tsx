'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Announce = (message: string) => void;

const AnnounceContext = createContext<Announce>(() => undefined);

/**
 * The one polite live region of the People table: every row action announces its success here instead
 * of in a region of its own (one `role="status"` for the whole table, however many rows). Rendered with
 * the table, empty, so it exists before the first announcement. Each message is a new node, so the same
 * message twice in a row (two role changes) is announced twice; a row that leaves the list after its
 * change (a filter no longer matches) still has its change announced.
 */
export function UsersAnnouncer({ children }: Readonly<{ children: ReactNode }>) {
  const [announcement, setAnnouncement] = useState({ id: 0, message: '' });
  const announce = useCallback((message: string) => {
    setAnnouncement((previous) => ({ id: previous.id + 1, message }));
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <p role="status" className="sr-only" data-slot="users-announcement">
        <span key={announcement.id}>{announcement.message}</span>
      </p>
    </AnnounceContext.Provider>
  );
}

/** Announces a message in the table's live region (a no-op outside UsersAnnouncer). */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}
