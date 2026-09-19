import { recordStore } from "./recordStore";
import {
  savedOpeningFrom,
  type SavedOpening,
} from "./savedOpenings";

/**
 * Where the reader's saved openings are kept: one `localStorage` key, holding
 * a JSON array of {@link SavedOpening}, newest first.
 *
 * The store half of [`savedOpenings.ts`](./savedOpenings.ts), and
 * [`savedAnalysisStore.ts`](./savedAnalysisStore.ts) again, built over the
 * shared [`recordStore.ts`](./recordStore.ts) scaffolding — which owns the
 * non-throwing read, the revision-stamped snapshot and the `storage`-event
 * subscription, and carries the reasoning for all of it. One thing is
 * different here, and it is the whole of what a saved opening does that a
 * saved analysis does not:
 *
 * - **The note is edited in place.** A note is changed from the Saved openings
 *   screen *after* the record exists, so there is a write that must keep the
 *   record's place in the list rather than move it to the top — editing a name
 *   is not "working on" the opening, and re-ordering on every keystroke would be
 *   noise. {@link updateSavedOpeningNote} is that write.
 *
 * - **The folder rides with the record.** A save names the folder an opening is
 *   filed under ({@link SavedOpening.folderId}), so {@link unchanged} compares
 *   it beside the PGN and the note — a re-save that only *refiles* the opening
 *   is a change, not a duplicate, and one that files it identically is still a
 *   no-op. The folders themselves are a separate store
 *   ([`savedOpeningFolderStore.ts`](./savedOpeningFolderStore.ts)) — a folder is
 *   not an opening — but the one write that spans both,
 *   {@link unfileOpeningsIn}, lives here, because it is the openings whose
 *   folder it changes.
 *
 * The writer is **idempotent** for the same reason the other stores' are: the
 * save button is not an effect, but a re-save of an identical record must still
 * be a no-op so a reader cannot stack duplicates by clicking twice.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const SAVED_OPENINGS_STORAGE_KEY = "chessapp.savedOpenings.v1";

/**
 * How many openings are kept.
 *
 * A save is a button click rather than an effect, so this is a generous bound
 * rather than a tight one — but a bound all the same, so a list cannot grow to
 * fill the origin's quota over a few months.
 */
export const MAX_SAVED_OPENINGS = 50;

/** What went wrong with a write. One case, but named rather than boolean. */
export type SavedOpeningProblem = "storage";

const openings = recordStore<SavedOpening>(
  SAVED_OPENINGS_STORAGE_KEY,
  savedOpeningFrom,
);

/** The saved openings, newest first. Stable between changes. */
export const savedOpeningsSnapshot = openings.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeSavedOpenings = openings.subscribe;

/** The store's write — every operation below funnels through it. */
const write = openings.write;

/** Whether two records would restore the same screen. */
const unchanged = (a: SavedOpening, b: SavedOpening): boolean =>
  a.pgn === b.pgn &&
  a.orientation === b.orientation &&
  a.note === b.note &&
  a.folderId === b.folderId;

/**
 * Keep one opening, newest first.
 *
 * The write is a button click, so there is no "existing record" to grow in
 * place the way a save-on-every-move does — but a re-save that would be
 * identical is still a no-op, so a double click does not stack a duplicate.
 */
export const saveOpening = (
  opening: SavedOpening,
): SavedOpeningProblem | undefined => {
  const current = savedOpeningsSnapshot();
  const existing = current.find((row) => row.id === opening.id);

  if (existing !== undefined && unchanged(existing, opening)) return undefined;

  return write(
    [
      { ...opening, savedAt: existing?.savedAt ?? opening.savedAt },
      ...current.filter((row) => row.id !== opening.id),
    ].slice(0, MAX_SAVED_OPENINGS),
  );
};

/**
 * Change one opening's note, **in place** — the record keeps its position in the
 * list rather than jumping to the top, because editing a name is not working on
 * the opening. A note that has not actually changed is a no-op.
 */
export const updateSavedOpeningNote = (
  id: string,
  note: string,
): SavedOpeningProblem | undefined => {
  const current = savedOpeningsSnapshot();
  const existing = current.find((row) => row.id === id);
  if (existing === undefined || existing.note === note) return undefined;

  return write(
    current.map((row) =>
      row.id === id ? { ...row, note, updatedAt: new Date().toISOString() } : row,
    ),
  );
};

/** One saved opening by id, or `undefined` — what reopening one starts from. */
export const findSavedOpening = (
  id: string | null | undefined,
): SavedOpening | undefined =>
  id === null || id === undefined
    ? undefined
    : savedOpeningsSnapshot().find((row) => row.id === id);

/**
 * File every opening under a folder back to **Unfiled** — the openings half of
 * what deleting a folder does to its contents
 * (`removeOpeningFolder` in [`savedOpeningFolderStore.ts`](./savedOpeningFolderStore.ts)).
 *
 * This is the one folder operation that changes *openings*, which is why it
 * lives in the openings store rather than beside the folder CRUD: a folder's
 * own moves (re-parenting sub-folders) are the folder store's to make, but the
 * records whose `folderId` is being set are these. Only the openings *directly*
 * in the folder are unfiled — a sub-folder's openings stay filed, because the
 * sub-folder itself is re-parented, not deleted. An unknown id changes nothing.
 */
export const unfileOpeningsIn = (
  folderId: string,
): SavedOpeningProblem | undefined => {
  const current = savedOpeningsSnapshot();
  if (!current.some((row) => row.folderId === folderId)) return undefined;

  return write(
    current.map((row) =>
      row.folderId === folderId ? { ...row, folderId: null } : row,
    ),
  );
};

/** Forget one. Unknown ids are a no-op, not an error. */
export const removeSavedOpening = (
  id: string,
): SavedOpeningProblem | undefined =>
  write(savedOpeningsSnapshot().filter((row) => row.id !== id));

/** Forget all of them. */
export const clearSavedOpenings = (): SavedOpeningProblem | undefined =>
  write([]);
