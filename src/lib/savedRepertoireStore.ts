import { recordStore } from "./recordStore";
import {
  sameRepertoireSettings,
  type RepertoireSettings,
} from "./repertoireSettings";
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
 * the `storage`-event subscription — the saved games' store again, with one
 * difference worth saying:
 *
 * - **The folder a repertoire is filed under is a second store**
 *   ([`savedRepertoireFolderStore.ts`](./savedRepertoireFolderStore.ts)), one
 *   level deep; the writes that change a repertoire's `folderId` —
 *   {@link fileRepertoire}, {@link unfileRepertoiresIn} — are here, because
 *   these are the records they change.
 *
 * - **The ceiling is bytes, not rows.** A record is a whole file — a
 *   Chessable-style export of a few hundred lines runs to most of a megabyte —
 *   so the origin's few megabytes run out long before any
 *   row cap would. The cap below is a bound on the list, not a promise that
 *   that many fit; a write past the quota is reported as `"storage"` and the
 *   list stays as it was, which the upload screen says in words.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const SAVED_REPERTOIRES_STORAGE_KEY = "chessapp.savedRepertoires.v1";

/**
 * How many repertoires are kept. See the note above: the quota bites first.
 * Generous, because a split makes one record per game — a Chessable-style
 * export can hold a few hundred — and a split that would pass it is refused whole
 * ({@link addRepertoires}) rather than quietly dropping the oldest.
 */
export const MAX_SAVED_REPERTOIRES = 500;

/**
 * What went wrong with a write: the browser's storage refused it, or a split
 * would take the list past {@link MAX_SAVED_REPERTOIRES}.
 */
export type SavedRepertoireProblem = "storage" | "too-many";

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
  a.pgn === b.pgn &&
  a.name === b.name &&
  a.folderId === b.folderId &&
  sameRepertoireSettings(a.settings, b.settings);

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

/**
 * Keep several new repertoires in one write — a split — at the top of the
 * list in the order given, or, with `replacing`, **in that record's place**:
 * a repertoire from before the one-game rule turned into what the reader
 * chose (`isMultiGameRepertoire`). All or nothing: a set that would pass
 * {@link MAX_SAVED_REPERTOIRES} is refused as `"too-many"` and nothing is
 * written, rather than the oldest being dropped to make room.
 */
export const addRepertoires = (
  records: readonly SavedRepertoire[],
  replacing?: string,
): SavedRepertoireProblem | undefined => {
  const current = savedRepertoiresSnapshot();
  const at = replacing === undefined ? -1 : current.findIndex((row) => row.id === replacing);
  const kept = current.filter((row) => row.id !== replacing);
  if (kept.length + records.length > MAX_SAVED_REPERTOIRES) return "too-many";

  const insertAt = at === -1 ? 0 : at;
  return write([...kept.slice(0, insertAt), ...records, ...kept.slice(insertAt)]);
};

/**
 * Change one repertoire's title and settings, **in place** — the record keeps
 * its position in the list, because editing what a repertoire is called is
 * not working on it. An unknown id, or a
 * write that changes nothing, is a no-op.
 */
export const updateRepertoireSettings = (
  id: string,
  name: string,
  settings: RepertoireSettings,
): SavedRepertoireProblem | undefined => {
  const current = savedRepertoiresSnapshot();
  const existing = current.find((row) => row.id === id);
  if (
    existing === undefined ||
    (existing.name === name && sameRepertoireSettings(existing.settings, settings))
  ) {
    return undefined;
  }

  return write(
    current.map((row) =>
      row.id === id
        ? { ...row, name, settings, updatedAt: new Date().toISOString() }
        : row,
    ),
  );
};

/**
 * File one repertoire under a folder — `null` for Unfiled — **in place**:
 * moving a repertoire is not working on it, so it keeps its place in the list
 * (`updateRepertoireSettings`' rule). A move to where it already is, or of an
 * unknown id, is a no-op. The folder is the caller's to have checked.
 */
export const fileRepertoire = (
  id: string,
  folderId: string | null,
): SavedRepertoireProblem | undefined => {
  const current = savedRepertoiresSnapshot();
  const existing = current.find((row) => row.id === id);
  if (existing === undefined || existing.folderId === folderId) return undefined;
  return write(current.map((row) => (row.id === id ? { ...row, folderId } : row)));
};

/**
 * File every repertoire under a folder back to **Unfiled** — the repertoires'
 * half of deleting that folder (`removeRepertoireFolder`). Here rather than in
 * the folder store because these are the records whose `folderId` changes.
 */
export const unfileRepertoiresIn = (
  folderId: string,
): SavedRepertoireProblem | undefined => {
  const current = savedRepertoiresSnapshot();
  if (!current.some((row) => row.folderId === folderId)) return undefined;
  return write(
    current.map((row) => (row.folderId === folderId ? { ...row, folderId: null } : row)),
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

/**
 * Forget several at once — the list's bulk delete — in **one** write, so a
 * failed write leaves every one of them rather than some. Unknown ids are
 * skipped; a set naming none of the stored records writes nothing.
 */
export const removeSavedRepertoires = (
  ids: Iterable<string>,
): SavedRepertoireProblem | undefined => {
  const gone = new Set(ids);
  const current = savedRepertoiresSnapshot();
  if (!current.some((row) => gone.has(row.id))) return undefined;
  return write(current.filter((row) => !gone.has(row.id)));
};

/** Forget all of them — and nothing kept under any other key. */
export const clearSavedRepertoires = (): SavedRepertoireProblem | undefined =>
  write([]);
