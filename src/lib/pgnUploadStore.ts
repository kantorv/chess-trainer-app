import type { PgnUpload, UploadProblem } from "./pgnUploads";

/**
 * Where the reader's uploaded PGNs are kept: one `localStorage` key, holding a
 * JSON array of {@link PgnUpload}.
 *
 * The store half of [`pgnUploads.ts`](./pgnUploads.ts) — no React, so the pure
 * catalog code can use it and `views/pgn/useUploads.ts` can wrap it in a
 * `useSyncExternalStore` without either knowing about the other.
 *
 * ### Nothing here throws
 *
 * `localStorage` is not a reliable dependency: a browser in private mode can
 * throw on access, another tab can leave something that is not JSON under the
 * key, and a write can exceed the quota. Each of those is answered — an empty
 * list on read, a reported {@link UploadProblem} on write — because the
 * alternative is a section that will not render.
 *
 * ### The snapshot is checked against a revision, not against the data
 *
 * `useSyncExternalStore` calls `getSnapshot` on **every render** and must get
 * the same value back when nothing changed, so the parsed array is cached. What
 * the cache is checked against matters: the uploads themselves can run to
 * megabytes of PGN, and this is read from the section descriptor's `catalog`
 * getter — which means once per keystroke in a search box. So each write also
 * stamps a short **revision** under a second key, and a snapshot reads only
 * that; the megabytes are re-read and re-parsed when the revision moves and at
 * no other time.
 *
 * Keeping the revision in storage rather than in a variable here is what makes
 * the cache self-correcting: another tab's write moves it, and a
 * `localStorage.clear()` — between two tests, or from the browser's own
 * controls — removes it, so the next snapshot goes back to the data and finds
 * it gone. The expensive half of the work, turning the PGN into a catalog, is
 * memoised one layer up on the identity of what this returns
 * (`userPgnsLibrary()`).
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const UPLOADS_STORAGE_KEY = "chessapp.pgnUploads.v1";

/** Where the revision is stamped — a few bytes, read on every snapshot. */
export const UPLOADS_REVISION_KEY = `${UPLOADS_STORAGE_KEY}.rev`;

const EMPTY: readonly PgnUpload[] = [];

const listeners = new Set<() => void>();

/** Cached parse, and the revision it was read at. `undefined` = never read. */
let lastRevision: string | null | undefined;
let cached: readonly PgnUpload[] = EMPTY;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled: the section still works, with nothing
    // uploaded and every write reporting a problem.
    return null;
  }
};

const isUpload = (value: unknown): value is PgnUpload => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === "string" &&
    row.name !== "" &&
    typeof row.text === "string" &&
    typeof row.addedAt === "string"
  );
};

const parse = (raw: string | null): readonly PgnUpload[] => {
  if (raw === null || raw.trim() === "") return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    // A row that is not an upload is dropped rather than rendered as one.
    const rows = value.filter(isUpload);
    return rows.length === 0 ? EMPTY : rows;
  } catch {
    return EMPTY;
  }
};

/** The uploads, newest first. Stable between changes — see the note above. */
export const uploadsSnapshot = (): readonly PgnUpload[] => {
  const revision = read(UPLOADS_REVISION_KEY);
  if (revision !== lastRevision) {
    lastRevision = revision;
    cached = parse(read(UPLOADS_STORAGE_KEY));
  }
  return cached;
};

const emit = () => {
  for (const listener of listeners) listener();
};

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeUploads = (onChange: () => void): (() => void) => {
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

const onStorageEvent = (event: StorageEvent) => {
  // `key === null` is a `clear()` from another tab, which affects us too.
  if (
    event.key === null ||
    event.key === UPLOADS_STORAGE_KEY ||
    event.key === UPLOADS_REVISION_KEY
  ) {
    emit();
  }
};

/** Bumped on every write, so a snapshot can tell "changed" from "unchanged". */
let writes = 0;

/** Write the list, or say why it could not be written. Never throws. */
const write = (uploads: readonly PgnUpload[]): UploadProblem | undefined => {
  try {
    localStorage.setItem(UPLOADS_STORAGE_KEY, JSON.stringify(uploads));
    // After the data, so a revision never claims a write that did not land.
    writes += 1;
    localStorage.setItem(UPLOADS_REVISION_KEY, `${Date.now()}-${writes}`);
  } catch {
    // Quota exceeded, or storage unavailable. The list on screen is unchanged,
    // because nothing was mutated before this point.
    return "storage";
  }
  emit();
  return undefined;
};

/**
 * Keep one file, newest first.
 *
 * Uploading a file whose name is already there **replaces** it and moves it to
 * the top: picking the same export again is how a reader updates a study, and
 * two folders with one name would be worse than either outcome.
 */
export const addUpload = (
  name: string,
  text: string,
  now: Date = new Date(),
): UploadProblem | undefined =>
  write([
    { name, text, addedAt: now.toISOString() },
    ...uploadsSnapshot().filter((upload) => upload.name !== name),
  ]);

/** Forget one file. Unknown names are a no-op, not an error. */
export const removeUpload = (name: string): UploadProblem | undefined =>
  write(uploadsSnapshot().filter((upload) => upload.name !== name));

/** Forget all of them. */
export const clearUploads = (): UploadProblem | undefined => write([]);
