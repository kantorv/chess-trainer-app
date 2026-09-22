import { useEffect, useState } from "react";

/**
 * Whether a route that names a stored record can mount yet. Every store is
 * IndexedDB's, and its first read is a promise (`lib/idbRecordStore.ts`), so a
 * screen arriving by URL — `?saved=<id>` — waits for that read rather than
 * calling the record missing, or starting a new game, before it lands.
 *
 * `waits` is whether the URL names a record at all; an arrival that does not
 * mounts at once. `isRead` and `load` are the store's (`… !== undefined` over
 * its snapshot, and its `load`) — module functions, so stable. Once read, the
 * store keeps what it read, so a later visit is ready on its first render.
 */
export const useStoreRead = (
  waits: boolean,
  isRead: () => boolean,
  load: () => Promise<unknown>,
): boolean => {
  const [ready, setReady] = useState(() => !waits || isRead());
  useEffect(() => {
    if (ready) return;
    let live = true;
    void load().finally(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready, load]);
  return ready;
};
