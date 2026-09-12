import { recordStore } from "./recordStore";
import { newSavedGameId as newSavedOpeningFolderId } from "./savedGames";
import {
  openingFolderFrom,
  openingFolderSubtree,
  type OpeningFolder,
} from "./savedOpeningFolders";
import { unfileOpeningsIn } from "./savedOpeningStore";

/**
 * Where the reader's saved-opening folders are kept: one `localStorage` key,
 * holding a JSON array of {@link OpeningFolder}.
 *
 * The store half of [`savedOpeningFolders.ts`](./savedOpeningFolders.ts), and
 * [`savedOpeningStore.ts`](./savedOpeningStore.ts) again, built over the
 * shared [`recordStore.ts`](./recordStore.ts) scaffolding — which owns the
 * non-throwing read, the revision-stamped snapshot and the `storage`-event
 * subscription, and carries the reasoning for all of it. The folder CRUD lives
 * here rather than in the views because every caller of it must mean the same
 * thing: a move can never make a cycle ({@link moveOpeningFolder} refuses the
 * folder's own subtree), and a delete never orphans anything —
 * {@link removeOpeningFolder} re-parents sub-folders and files the openings
 * back to Unfiled in one write-through, so the "deleting a folder keeps its
 * contents" rule is one operation rather than a protocol every screen has to
 * remember to follow.
 *
 * One return shape is different from the openings store's, and it is the whole
 * of what creating is that renaming is not: {@link createOpeningFolder} hands
 * back the folder it made, because the two callers of it (the save dialog's
 * inline create, the browser's "New folder") both select what they just made,
 * and a write that returns only a problem would leave them to find the new id
 * by rescanning. `undefined` there means "nothing was created" — a full cap, a
 * failed write, a name that trims to nothing, a parent that is not there.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const OPENING_FOLDERS_STORAGE_KEY = "chessapp.savedOpeningFolders.v1";

/**
 * How many folders are kept — a generous bound, as on the openings themselves
 * ({@link MAX_SAVED_OPENINGS}), but a bound all the same.
 */
export const MAX_OPENING_FOLDERS = 100;

/** How long a folder name may be. A name is a label, not a document. */
export const MAX_OPENING_FOLDER_NAME = 100;

/** What went wrong with a write. One case, but named rather than boolean. */
export type OpeningFolderProblem = "storage";

const folders = recordStore<OpeningFolder>(
  OPENING_FOLDERS_STORAGE_KEY,
  openingFolderFrom,
);

/** The folders, in storage order. Stable between changes. */
export const openingFoldersSnapshot = folders.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeOpeningFolders = folders.subscribe;

/** The store's write — every operation below funnels through it. */
const write = folders.write;

/** A folder's name as it is stored: trimmed, bounded, and never empty. */
const normaliseName = (name: string): string =>
  name.trim().slice(0, MAX_OPENING_FOLDER_NAME);

/** One folder by id, or `undefined`. */
export const findOpeningFolder = (
  id: string | null | undefined,
): OpeningFolder | undefined =>
  id === null || id === undefined
    ? undefined
    : openingFoldersSnapshot().find((folder) => folder.id === id);

/**
 * Create a folder, and hand it back — `undefined` when nothing was created: a
 * name that trims to nothing, a parent that is not there, a full cap, or a
 * failed write. The parent is checked against the list, not taken on trust: a
 * `parentId` naming a folder that does not exist would build a subtree no
 * reader can reach.
 */
export const createOpeningFolder = (
  name: string,
  parentId: string | null,
  now: Date = new Date(),
): OpeningFolder | undefined => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const current = openingFoldersSnapshot();
  if (current.length >= MAX_OPENING_FOLDERS) return undefined;
  if (parentId !== null && !current.some((folder) => folder.id === parentId)) {
    return undefined;
  }

  const folder: OpeningFolder = {
    id: newSavedOpeningFolderId(now),
    name: trimmed,
    parentId,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return write([...current, folder]) === undefined ? folder : undefined;
};

/**
 * Get an existing folder or create it — the default rule's own helper: a
 * position the ECO book names saves into a folder named after that opening,
 * created at the top level if no such folder exists yet. The first folder with
 * that exact name and parent wins; duplicates are otherwise allowed, so a
 * reader who names two folders "Sicilian" keeps both.
 */
export const ensureOpeningFolder = (
  name: string,
  parentId: string | null,
  now: Date = new Date(),
): OpeningFolder | undefined => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const existing = openingFoldersSnapshot().find(
    (folder) => folder.name === trimmed && folder.parentId === parentId,
  );
  return existing ?? createOpeningFolder(trimmed, parentId, now);
};

/**
 * Rename one folder in place. A name that trims to nothing is a no-op rather
 * than a wipe — a reader who clears the field did not mean to delete the
 * folder — and a name that has not changed is a no-op, as a note's is.
 */
export const renameOpeningFolder = (
  id: string,
  name: string,
  now: Date = new Date(),
): OpeningFolderProblem | undefined => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const current = openingFoldersSnapshot();
  const existing = current.find((folder) => folder.id === id);
  if (existing === undefined || existing.name === trimmed) return undefined;

  return write(
    current.map((folder) =>
      folder.id === id
        ? { ...folder, name: trimmed, updatedAt: now.toISOString() }
        : folder,
    ),
  );
};

/**
 * Move one folder under a new parent — or to the top level with `null`.
 *
 * The one folder move that is refused is the one that would corrupt the tree:
 * a folder moved **into its own subtree** would take its ancestors' ids with
 * it, and every path through the moved part would loop. The new parent must
 * also exist when it is not `null`, and a move that changes nothing is a
 * no-op. Everything else is allowed, including moving under a sibling.
 */
export const moveOpeningFolder = (
  id: string,
  newParentId: string | null,
  now: Date = new Date(),
): OpeningFolderProblem | undefined => {
  const current = openingFoldersSnapshot();
  const existing = current.find((folder) => folder.id === id);
  if (existing === undefined) return undefined;
  if (existing.parentId === newParentId) return undefined;
  if (
    newParentId !== null &&
    !current.some((folder) => folder.id === newParentId)
  ) {
    return undefined;
  }
  if (newParentId !== null && openingFolderSubtree(current, id).has(newParentId))
    return undefined;

  return write(
    current.map((folder) =>
      folder.id === id
        ? { ...folder, parentId: newParentId, updatedAt: now.toISOString() }
        : folder,
    ),
  );
};

/**
 * Delete one folder, keeping its contents — the rule the delete confirmation
 * states: the openings filed directly under it become **Unfiled**
 * ({@link unfileOpeningsIn}, the openings store's half of the operation), and
 * its sub-folders re-parent to the deleted folder's own parent, so the subtree
 * closes up rather than leaving a hole. An unknown id is a no-op.
 */
export const removeOpeningFolder = (
  id: string,
  now: Date = new Date(),
): OpeningFolderProblem | undefined => {
  const current = openingFoldersSnapshot();
  const existing = current.find((folder) => folder.id === id);
  if (existing === undefined) return undefined;

  const problem = write(
    current
      .filter((folder) => folder.id !== id)
      .map((folder) =>
        folder.parentId === id
          ? { ...folder, parentId: existing.parentId, updatedAt: now.toISOString() }
          : folder,
      ),
  );
  // The openings are unfiled even when the folder write failed: a half-done
  // delete that leaves the tree intact is better than one that leaves records
  // naming a folder that is gone — and the openings store normalises such a
  // folderId back to Unfiled on read anyway.
  unfileOpeningsIn(id);
  return problem;
};
