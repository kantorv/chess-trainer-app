/**
 * The one `localStorage` record-store factory — the machinery every record
 * store in `src/lib/` is built over.
 *
 * A record store keeps one JSON array under one versioned `localStorage` key,
 * one row per record (a [`SavedGame`](./savedGames.ts), an upload, an opening),
 * newest first. Five stores were written by hand with the same scaffolding — a
 * try/catch read, a revision-stamped cached snapshot, a listener set over a
 * `storage`-event subscription, and a write that bumps the revision — and this
 * module is that scaffolding, written once. What a store does *with* the
 * machinery — its caps, its idempotency comparisons, the operations that span
 * two stores — stays in the store's own file, which documents what is
 * different about it, not what is the same.
 *
 * ### Nothing here throws
 *
 * `localStorage` is not a reliable dependency: a browser in private mode can
 * throw on access, another tab can leave something that is not JSON under the
 * key, and a write can exceed the quota. Each of those is answered — an empty
 * list on read, a reported `"storage"` problem on write — because the
 * alternative is a screen that will not render.
 *
 * ### The snapshot is checked against a revision, not against the data
 *
 * `useSyncExternalStore` calls `getSnapshot` on **every render** and must get
 * the same value back when nothing changed, so the parsed array is cached.
 * What the cache is checked against matters: the records can run to megabytes
 * (the uploads store's snapshot is read from a catalog getter, once per
 * keystroke in a search box), so each write also stamps a short **revision**
 * under a second key — `<storage key>.rev` — and a snapshot reads only that;
 * the data is re-read and re-parsed when the revision moves and at no other
 * time.
 *
 * Keeping the revision in storage rather than in a variable here is what makes
 * the cache self-correcting: another tab's write moves it, and a
 * `localStorage.clear()` — between two tests, or from the browser's own
 * controls — removes it, so the next snapshot goes back to the data and finds
 * it gone.
 *
 * ### A row the normaliser refuses is dropped, not rendered
 *
 * Stored JSON is data from another tab, an older build, or a hand edit. The
 * normaliser — the `savedGameFrom` / `openingFolderFrom`-style guard each
 * store passes in — is what turns a row back into a record, and a row it does
 * not recognise is dropped rather than handed to a screen as one.
 */

/** What went wrong with a write. One case, but named rather than boolean. */
export type RecordStoreProblem = "storage";

/** The snapshot/subscribe/write machinery one record store is built over. */
export interface RecordStore<Row> {
  /** The rows, in storage order. Stable between changes. */
  snapshot: () => readonly Row[];
  /** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
  subscribe: (onChange: () => void) => () => void;
  /** Write the list, or say why it could not be written. Never throws. */
  write: (rows: readonly Row[]) => RecordStoreProblem | undefined;
}

/**
 * Build the machinery one record store runs on: a JSON array of rows under
 * `storageKey`, a revision stamped under `` `${storageKey}.rev` `` on every
 * write, and every stored row handed to `normaliseRow` — one it returns
 * `undefined` for is dropped rather than rendered.
 */
export const recordStore = <Row>(
  storageKey: string,
  normaliseRow: (value: unknown) => Row | undefined,
): RecordStore<Row> => {
  /** Where the revision is stamped — a few bytes, read on every snapshot. */
  const revisionKey = `${storageKey}.rev`;

  const EMPTY: readonly Row[] = [];

  const listeners = new Set<() => void>();

  /** Cached parse, and the revision it was read at. `undefined` = never read. */
  let lastRevision: string | null | undefined;
  let cached: readonly Row[] = EMPTY;

  const read = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      // Private mode, or storage disabled: the screen still works, with an
      // empty list and every write reporting a problem.
      return null;
    }
  };

  const parse = (raw: string | null): readonly Row[] => {
    if (raw === null || raw.trim() === "") return EMPTY;
    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return EMPTY;
      const rows = value
        .map(normaliseRow)
        .filter((row): row is Row => row !== undefined);
      return rows.length === 0 ? EMPTY : rows;
    } catch {
      return EMPTY;
    }
  };

  const snapshot = (): readonly Row[] => {
    const revision = read(revisionKey);
    if (revision !== lastRevision) {
      lastRevision = revision;
      cached = parse(read(storageKey));
    }
    return cached;
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const onStorageEvent = (event: StorageEvent) => {
    // `key === null` is a `clear()` from another tab, which affects us too.
    if (
      event.key === null ||
      event.key === storageKey ||
      event.key === revisionKey
    ) {
      emit();
    }
  };

  const subscribe = (onChange: () => void): (() => void) => {
    listeners.add(onChange);

    if (listeners.size === 1 && typeof window !== "undefined") {
      window.addEventListener("storage", onStorageEvent);
    }

    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0 && typeof window !== "undefined") {
        window.removeEventListener("storage", onStorageEvent);
      }
    };
  };

  /** Bumped on every write, so a snapshot can tell "changed" from "unchanged". */
  let writes = 0;

  const write = (rows: readonly Row[]): RecordStoreProblem | undefined => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(rows));
      // After the data, so a revision never claims a write that did not land.
      writes += 1;
      localStorage.setItem(revisionKey, `${Date.now()}-${writes}`);
    } catch {
      // Quota exceeded, or storage unavailable. The list on screen is
      // unchanged, because nothing was mutated before this point.
      return "storage";
    }
    emit();
    return undefined;
  };

  return { snapshot, subscribe, write };
};
