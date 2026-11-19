'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Announce = (message: string) => void;

const AnnounceContext = createContext<Announce>(() => undefined);

/**
 * The one polite live region of the People screen's list: every row action announces its success here
 * instead of in a region of its own (one `role="status"` for the list, however many rows). The page
 * renders it around both the table and the empty state, so it exists before the first announcement and a
 * change that empties a filtered list is still announced. Each message is a new node, so the same message
 * twice in a row (two role changes) is announced twice. A message is written one task later than asked:
 * callers announce when their dialog has closed, and by then the page outside the dialog is no longer
 * hidden from assistive technology (`aria-hidden`), so the update is not skipped.
 */
export function UsersAnnouncer({ children }: Readonly<{ children: ReactNode }>) {
  const [announcement, setAnnouncement] = useState({ id: 0, message: '' });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const announce = useCallback((message: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setAnnouncement((previous) => ({ id: previous.id + 1, message }));
    }, 0);
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

/** Announces a message in the list's live region (a no-op outside UsersAnnouncer). */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}

/**
 * For a row action's dialog: `later(message)` keeps a success message until `closed()` — called from the
 * dialog's `onCloseAutoFocus`, once the dialog has really closed — announces it.
 */
export function useAnnounceAfterClose(): { later: Announce; closed: () => void } {
  const announce = useAnnounce();
  const pending = useRef<string | null>(null);
  return {
    later: (message) => {
      pending.current = message;
    },
    closed: () => {
      const message = pending.current;
      pending.current = null;
      if (message !== null) announce(message);
    },
  };
}
