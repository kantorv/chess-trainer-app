import { idbRecordStore } from "./idbRecordStore";
import { newRecordId as newRepertoireFolderId } from "./recordId";
import {
  REPERTOIRE_CHANNEL,
  REPERTOIRE_FOLDERS_STORE,
  openRepertoireDb,
} from "./savedRepertoireDb";
import {
  repertoireFolderFrom,
  type RepertoireFolder,
} from "./savedRepertoireFolders";
import { unfileRepertoiresIn } from "./savedRepertoireStore";

/**
 * Where the reader's repertoire folders are kept: **IndexedDB** — the
 * `folders` object store beside the repertoires in `chessapp.repertoires`
 * (`lib/savedRepertoireDb.ts`), over the shared
 * [`idbRecordStore.ts`](./idbRecordStore.ts).
 *
 * The analyses' folder store again, minus everything a tree needs and a flat
 * list does not — no parent to check, no subtree to refuse, no sub-folders to
 * re-parent (see [`savedRepertoireFolders.ts`](./savedRepertoireFolders.ts)).
 * The CRUD lives here so every caller means the same thing by it, and the one
 * rule it keeps is the one every folder in the app keeps: **deleting a folder
 * keeps its contents** — its repertoires go back to Unfiled in the same
 * operation. Every write is a promise; nothing throws.
 */

/** How many folders are kept — generous, but a bound. */
export const MAX_REPERTOIRE_FOLDERS = 100;

/** How long a folder name may be. A name is a label, not a document. */
const MAX_REPERTOIRE_FOLDER_NAME = 100;

/** What went wrong with a write. One case, but named rather than boolean. */
export type RepertoireFolderProblem = "storage";

const folders = idbRecordStore<RepertoireFolder>({
  db: openRepertoireDb,
  store: REPERTOIRE_FOLDERS_STORE,
  normalise: repertoireFolderFrom,
  order: "oldest-first",
  channel: REPERTOIRE_CHANNEL,
});

/** The folders, oldest first — `undefined` until the first read lands. Stable between changes. */
export const repertoireFoldersSnapshot = folders.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs'. The first subscriber starts the read. */
export const subscribeRepertoireFolders = folders.subscribe;

/** The folders, read now if they have not been. */
export const loadRepertoireFolders = folders.load;

/** Resolves once every write issued so far has landed — what a test waits on before it resets. */
export const settledRepertoireFolders = folders.settled;

/** **For tests**: forget what was read (the database is `deleteRepertoireDb`'s). */
export const resetRepertoireFolderStore = folders.reset;

const write = folders.write;

/** A name as it is stored: trimmed and bounded. */
const normaliseName = (name: string): string =>
  name.trim().slice(0, MAX_REPERTOIRE_FOLDER_NAME);

/**
 * Create a folder, and hand it back — `undefined` when nothing was created: a
 * name that trims to nothing, a full cap, or a failed write. Handed back
 * because every caller goes on to use it: the list opens it, a split files
 * its repertoires into it.
 */
export const createRepertoireFolder = async (
  name: string,
  now: Date = new Date(),
): Promise<RepertoireFolder | undefined> => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const folder: RepertoireFolder = {
    id: newRepertoireFolderId(now),
    name: trimmed,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  let made = false;
  const problem = await write((current) => {
    if (current.length >= MAX_REPERTOIRE_FOLDERS) return current;
    made = true;
    return [...current, folder];
  });
  return made && problem === undefined ? folder : undefined;
};

/**
 * Rename one folder in place. A name that trims to nothing is a no-op rather
 * than a wipe, and so is one that has not changed.
 */
export const renameRepertoireFolder = (
  id: string,
  name: string,
  now: Date = new Date(),
): Promise<RepertoireFolderProblem | undefined> => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return Promise.resolve(undefined);

  return write((current) => {
    const existing = current.find((folder) => folder.id === id);
    if (existing === undefined || existing.name === trimmed) return current;
    return current.map((folder) =>
      folder.id === id ? { ...folder, name: trimmed, updatedAt: now.toISOString() } : folder,
    );
  });
};

/**
 * Delete one folder, **keeping its repertoires**: they go back to Unfiled
 * ({@link unfileRepertoiresIn}, the repertoires store's half). They are
 * unfiled even when the folder write fails — a folder left standing is
 * better than repertoires naming one that is gone, and the list reads such a
 * `folderId` as Unfiled anyway. An unknown id is a no-op.
 */
export const removeRepertoireFolder = async (
  id: string,
): Promise<RepertoireFolderProblem | undefined> => {
  let found = false;
  const problem = await write((current) => {
    if (!current.some((folder) => folder.id === id)) return current;
    found = true;
    return current.filter((folder) => folder.id !== id);
  });
  if (found) await unfileRepertoiresIn(id);
  return problem;
};
