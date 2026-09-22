import { idbRecordStore } from "./idbRecordStore";
import {
  sameRepertoireSettings,
  type RepertoireSettings,
} from "./repertoireSettings";
import {
  REPERTOIRE_CHANNEL,
  REPERTOIRES_STORE,
  openRepertoireDb,
} from "./savedRepertoireDb";
import {
  savedRepertoireFrom,
  type SavedRepertoire,
} from "./savedRepertoires";

/**
 * Where the reader's repertoires are kept: **IndexedDB** — the `repertoires`
 * object store of `chessapp.repertoires` (`lib/savedRepertoireDb.ts`), one
 * record per {@link SavedRepertoire}, listed newest first.
 *
 * The store half of [`savedRepertoires.ts`](./savedRepertoires.ts), built over
 * the shared [`idbRecordStore.ts`](./idbRecordStore.ts) — which owns the kept
 * snapshot, the queued writes answered once committed, the other tabs'
 * `BroadcastChannel`, and the one-time move out of `localStorage`
 * (`chessapp.savedRepertoires.v1`, where the repertoires lived until they
 * moved). The app's storage as a whole is `.claude/rules/database.md`.
 *
 * Every read of the list is the kept snapshot — `undefined` until the first
 * read lands ({@link loadSavedRepertoires}, or the first subscriber) — and
 * every write a promise of `undefined` or a {@link SavedRepertoireProblem}.
 * Nothing here throws.
 *
 * **The folder a repertoire is filed under is a second store**
 * ([`savedRepertoireFolderStore.ts`](./savedRepertoireFolderStore.ts)), one
 * level deep; the writes that change a repertoire's `folderId` —
 * {@link fileRepertoire}, {@link unfileRepertoiresIn} — are here, because
 * these are the records they change.
 */

/** Where the repertoires lived before IndexedDB — moved in on the first read. */
export const SAVED_REPERTOIRES_STORAGE_KEY = "chessapp.savedRepertoires.v1";

/**
 * How many repertoires are kept. Generous, because a split makes one record
 * per game — a Chessable-style export can hold a few hundred — and a split
 * that would pass it is refused whole ({@link addRepertoires}) rather than
 * quietly dropping the oldest.
 */
export const MAX_SAVED_REPERTOIRES = 500;

/**
 * What went wrong with a write: the browser's storage refused it, or a split
 * would take the list past {@link MAX_SAVED_REPERTOIRES}.
 */
export type SavedRepertoireProblem = "storage" | "too-many";

const repertoires = idbRecordStore<SavedRepertoire>({
  db: openRepertoireDb,
  store: REPERTOIRES_STORE,
  normalise: savedRepertoireFrom,
  order: "newest-first",
  channel: REPERTOIRE_CHANNEL,
  legacyKey: SAVED_REPERTOIRES_STORAGE_KEY,
});

/** The saved repertoires, newest first — `undefined` until the first read lands. Stable between changes. */
export const savedRepertoiresSnapshot = repertoires.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs'. The first subscriber starts the read. */
export const subscribeSavedRepertoires = repertoires.subscribe;

/** The saved repertoires, read now if they have not been. */
export const loadSavedRepertoires = repertoires.load;

/** Resolves once every write issued so far has landed — what a test waits on before it resets. */
export const settledSavedRepertoires = repertoires.settled;

/** **For tests**: forget what was read (the database is `deleteRepertoireDb`'s). */
export const resetSavedRepertoireStore = repertoires.reset;

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
): Promise<SavedRepertoireProblem | undefined> =>
  write((current) => {
    const existing = current.find((row) => row.id === repertoire.id);
    if (existing !== undefined && unchanged(existing, repertoire)) return current;
    return [
      { ...repertoire, savedAt: existing?.savedAt ?? repertoire.savedAt },
      ...current.filter((row) => row.id !== repertoire.id),
    ].slice(0, MAX_SAVED_REPERTOIRES);
  });

/**
 * Keep several new repertoires in one write — a split — at the top of the
 * list in the order given, or, with `replacing`, **in that record's place**:
 * a repertoire from before the one-game rule turned into what the reader
 * chose (`isMultiGameRepertoire`). All or nothing: a set that would pass
 * {@link MAX_SAVED_REPERTOIRES} is refused as `"too-many"` and nothing is
 * written, rather than the oldest being dropped to make room.
 */
export const addRepertoires = async (
  records: readonly SavedRepertoire[],
  replacing?: string,
): Promise<SavedRepertoireProblem | undefined> => {
  let tooMany = false;
  const problem = await write((current) => {
    const at = replacing === undefined ? -1 : current.findIndex((row) => row.id === replacing);
    const kept = current.filter((row) => row.id !== replacing);
    if (kept.length + records.length > MAX_SAVED_REPERTOIRES) {
      tooMany = true;
      return current;
    }
    const insertAt = at === -1 ? 0 : at;
    return [...kept.slice(0, insertAt), ...records, ...kept.slice(insertAt)];
  });
  return tooMany ? "too-many" : problem;
};

/** Change one record in place — its place in the list kept. */
const editInPlace = (
  id: string,
  edit: (row: SavedRepertoire) => SavedRepertoire,
): Promise<SavedRepertoireProblem | undefined> =>
  write((current) => {
    const index = current.findIndex((row) => row.id === id);
    if (index < 0) return current;
    const next = edit(current[index]);
    if (next === current[index]) return current;
    return current.map((row, at) => (at === index ? next : row));
  });

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
): Promise<SavedRepertoireProblem | undefined> =>
  editInPlace(id, (row) =>
    row.name === name && sameRepertoireSettings(row.settings, settings)
      ? row
      : { ...row, name, settings, updatedAt: new Date().toISOString() },
  );

/**
 * File one repertoire under a folder — `null` for Unfiled — **in place**:
 * moving a repertoire is not working on it, so it keeps its place in the list
 * (`updateRepertoireSettings`' rule). A move to where it already is, or of an
 * unknown id, is a no-op. The folder is the caller's to have checked.
 */
export const fileRepertoire = (
  id: string,
  folderId: string | null,
): Promise<SavedRepertoireProblem | undefined> =>
  editInPlace(id, (row) => (row.folderId === folderId ? row : { ...row, folderId }));

/**
 * File every repertoire under a folder back to **Unfiled** — the repertoires'
 * half of deleting that folder (`removeRepertoireFolder`). Here rather than in
 * the folder store because these are the records whose `folderId` changes.
 */
export const unfileRepertoiresIn = (
  folderId: string,
): Promise<SavedRepertoireProblem | undefined> =>
  write((current) =>
    current.some((row) => row.folderId === folderId)
      ? current.map((row) => (row.folderId === folderId ? { ...row, folderId: null } : row))
      : current,
  );

/**
 * One saved repertoire by id, out of what has been read — `undefined` for an
 * unknown id, and also before the first read has landed.
 */
export const findSavedRepertoire = (
  id: string | null | undefined,
): SavedRepertoire | undefined =>
  id === null || id === undefined
    ? undefined
    : savedRepertoiresSnapshot()?.find((row) => row.id === id);

/** Forget one. Unknown ids are a no-op, not an error. */
export const removeSavedRepertoire = (
  id: string,
): Promise<SavedRepertoireProblem | undefined> => removeSavedRepertoires([id]);

/**
 * Forget several at once — the list's bulk delete — in **one** write, so a
 * failed write leaves every one of them rather than some. Unknown ids are
 * skipped; a set naming none of the stored records writes nothing.
 */
export const removeSavedRepertoires = (
  ids: Iterable<string>,
): Promise<SavedRepertoireProblem | undefined> => {
  const gone = new Set(ids);
  return write((current) =>
    current.some((row) => gone.has(row.id)) ? current.filter((row) => !gone.has(row.id)) : current,
  );
};

/** Forget all of them. */
export const clearSavedRepertoires = (): Promise<SavedRepertoireProblem | undefined> =>
  write((current) => (current.length === 0 ? current : []));
