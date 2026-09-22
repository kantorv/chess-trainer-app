import { recordStore } from "./recordStore";
import {
  repertoireFolderFrom,
  type RepertoireFolder,
} from "./savedRepertoireFolders";
import { unfileRepertoiresIn } from "./savedRepertoireStore";
import { newRecordId as newRepertoireFolderId } from "./recordId";

/**
 * Where the reader's repertoire folders are kept: one `localStorage` key,
 * holding a JSON array of {@link RepertoireFolder}.
 *
 * `savedGameFolderStore.ts` again over the shared `recordStore.ts`, minus
 * everything a tree needs and a flat list does not — no parent to check, no
 * subtree to refuse, no sub-folders to re-parent (see
 * [`savedRepertoireFolders.ts`](./savedRepertoireFolders.ts)). The CRUD lives
 * here so every caller means the same thing by it, and the one rule it keeps
 * is the one every folder in the app keeps: **deleting a folder keeps its
 * contents** — its repertoires go back to Unfiled in the same operation.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const REPERTOIRE_FOLDERS_STORAGE_KEY = "chessapp.savedRepertoireFolders.v1";

/** How many folders are kept — generous, but a bound. */
export const MAX_REPERTOIRE_FOLDERS = 100;

/** How long a folder name may be. A name is a label, not a document. */
export const MAX_REPERTOIRE_FOLDER_NAME = 100;

/** What went wrong with a write. One case, but named rather than boolean. */
export type RepertoireFolderProblem = "storage";

const folders = recordStore<RepertoireFolder>(
  REPERTOIRE_FOLDERS_STORAGE_KEY,
  repertoireFolderFrom,
);

/** The folders, in storage order. Stable between changes. */
export const repertoireFoldersSnapshot = folders.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeRepertoireFolders = folders.subscribe;

const write = folders.write;

/** A name as it is stored: trimmed and bounded. */
const normaliseName = (name: string): string =>
  name.trim().slice(0, MAX_REPERTOIRE_FOLDER_NAME);

/** One folder by id, or `undefined`. */
export const findRepertoireFolder = (
  id: string | null | undefined,
): RepertoireFolder | undefined =>
  id === null || id === undefined
    ? undefined
    : repertoireFoldersSnapshot().find((folder) => folder.id === id);

/**
 * Create a folder, and hand it back — `undefined` when nothing was created: a
 * name that trims to nothing, a full cap, or a failed write. Handed back
 * because every caller goes on to use it: the list opens it, a split files
 * its repertoires into it.
 */
export const createRepertoireFolder = (
  name: string,
  now: Date = new Date(),
): RepertoireFolder | undefined => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const current = repertoireFoldersSnapshot();
  if (current.length >= MAX_REPERTOIRE_FOLDERS) return undefined;

  const folder: RepertoireFolder = {
    id: newRepertoireFolderId(now),
    name: trimmed,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return write([...current, folder]) === undefined ? folder : undefined;
};

/**
 * Rename one folder in place. A name that trims to nothing is a no-op rather
 * than a wipe, and so is one that has not changed.
 */
export const renameRepertoireFolder = (
  id: string,
  name: string,
  now: Date = new Date(),
): RepertoireFolderProblem | undefined => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const current = repertoireFoldersSnapshot();
  const existing = current.find((folder) => folder.id === id);
  if (existing === undefined || existing.name === trimmed) return undefined;

  return write(
    current.map((folder) =>
      folder.id === id ? { ...folder, name: trimmed, updatedAt: now.toISOString() } : folder,
    ),
  );
};

/**
 * Delete one folder, **keeping its repertoires**: they go back to Unfiled
 * ({@link unfileRepertoiresIn}, the repertoires store's half). They are
 * unfiled even when the folder write fails — a folder left standing is
 * better than repertoires naming one that is gone, and the list reads such a
 * `folderId` as Unfiled anyway. An unknown id is a no-op.
 */
export const removeRepertoireFolder = (
  id: string,
): RepertoireFolderProblem | undefined => {
  const current = repertoireFoldersSnapshot();
  if (!current.some((folder) => folder.id === id)) return undefined;
  const problem = write(current.filter((folder) => folder.id !== id));
  unfileRepertoiresIn(id);
  return problem;
};
