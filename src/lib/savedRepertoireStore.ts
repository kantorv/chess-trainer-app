import { recordStore } from "./recordStore";
import {
  savedRepertoireFrom,
  type SavedRepertoire,
} from "./savedRepertoires";

/**
 * Where the reader's repertoires are kept: one `localStorage` key, holding a
 * JSON array of {@link SavedRepertoire}, newest first.
 *
 * The store half of [`savedRepertoires.ts`](./savedRepertoires.ts), built over
 * the shared [`recordStore.ts`](./recordStore.ts) scaffolding, which carries
 * the reasoning for the non-throwing read, the revision-stamped snapshot and
 * the `storage`-event subscription. [`savedOpeningStore.ts`](./savedOpeningStore.ts)
 * again, with one difference worth saying:
 *
 * - **The ceiling is bytes, not rows.** A record is a whole file — the Alapin
 *   example is 800 KB — so the origin's few megabytes run out long before any
 *   row cap would. The cap below is a bound on the list, not a promise that
 *   that many fit; a write past the quota is reported as `"storage"` and the
 *   list stays as it was, which the upload screen says in words.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const SAVED_REPERTOIRES_STORAGE_KEY = "chessapp.savedRepertoires.v1";

/** How many repertoires are kept. See the note above: the quota bites first. */
export const MAX_SAVED_REPERTOIRES = 30;

/** What went wrong with a write. One case, but named rather than boolean. */
export type SavedRepertoireProblem = "storage";

const repertoires = recordStore<SavedRepertoire>(
  SAVED_REPERTOIRES_STORAGE_KEY,
  savedRepertoireFrom,
);

/** The saved repertoires, newest first. Stable between changes. */
export const savedRepertoiresSnapshot = repertoires.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeSavedRepertoires = repertoires.subscribe;

const write = repertoires.write;

/** Whether two records would show the same screen. */
const unchanged = (a: SavedRepertoire, b: SavedRepertoire): boolean =>
  a.pgn === b.pgn && a.name === b.name && a.folderId === b.folderId;

/**
 * Keep one repertoire, newest first. A re-save of an identical record is a
 * no-op, so a double click does not stack a duplicate or re-order the list.
 */
export const saveRepertoire = (
  repertoire: SavedRepertoire,
): SavedRepertoireProblem | undefined => {
  const current = savedRepertoiresSnapshot();
  const existing = current.find((row) => row.id === repertoire.id);
  if (existing !== undefined && unchanged(existing, repertoire)) return undefined;

  return write(
    [
      { ...repertoire, savedAt: existing?.savedAt ?? repertoire.savedAt },
      ...current.filter((row) => row.id !== repertoire.id),
    ].slice(0, MAX_SAVED_REPERTOIRES),
  );
};

/** One saved repertoire by id, or `undefined`. */
export const findSavedRepertoire = (
  id: string | null | undefined,
): SavedRepertoire | undefined =>
  id === null || id === undefined
    ? undefined
    : savedRepertoiresSnapshot().find((row) => row.id === id);

/** Forget one. Unknown ids are a no-op, not an error. */
export const removeSavedRepertoire = (
  id: string,
): SavedRepertoireProblem | undefined =>
  write(savedRepertoiresSnapshot().filter((row) => row.id !== id));

/** Forget all of them — and nothing kept under any other key. */
export const clearSavedRepertoires = (): SavedRepertoireProblem | undefined =>
  write([]);
