import { idbRecordStore } from "./idbRecordStore";
import { refileCollectionsIn } from "./libraryCollectionStore";
import { LIBRARY_CHANNEL, LIBRARY_FOLDERS_STORE, openLibraryDb } from "./libraryDb";
import { newRecordId } from "./recordId";
import { gameFolderFrom, gameFolderSubtree, type GameFolder } from "./savedGameFolders";

/**
 * **The Library's folders** (CTA-88) — the reader's own nested folders that
 * uploaded collections are filed in: the `folders` object store of
 * `chessapp.library` (`lib/libraryDb.ts`), over the shared
 * [`idbRecordStore.ts`](./idbRecordStore.ts).
 *
 * A folder *is* a {@link GameFolder} — the app's one nested-folder model,
 * with its cycle-safe reads (`lib/savedGameFolders.ts`) — and a collection's
 * summary names its folder (`folderId`, `lib/libraryCollectionStore.ts`).
 *
 * The CRUD lives here so every caller means the same thing:
 * {@link createLibraryFolder} hands back what it made, {@link moveLibraryFolder}
 * refuses the folder's own subtree, and {@link removeLibraryFolder} keeps the
 * contents — its sub-folders **and** its collections move up to its parent.
 * Every write is a promise; nothing throws.
 *
 * The shipped collections' **Built-in** folder is not a record here: it is
 * the Library's fixed, read-only top-level folder ({@link BUILT_IN_FOLDER_ID}),
 * so nothing can be filed in it, moved or renamed.
 */

/** The Built-in folder's id — never minted (`newRecordId` starts with `g`), never stored. */
export const BUILT_IN_FOLDER_ID = "builtin";

/** How many folders are kept — generous, but a bound. */
export const MAX_LIBRARY_FOLDERS = 100;

/** How long a folder name may be. */
export const MAX_LIBRARY_FOLDER_NAME = 100;

/** What went wrong with a write. */
export type LibraryFolderProblem = "storage";

const folders = idbRecordStore<GameFolder>({
  db: openLibraryDb,
  store: LIBRARY_FOLDERS_STORE,
  normalise: gameFolderFrom,
  order: "oldest-first",
  channel: LIBRARY_CHANNEL,
});

/** The folders, oldest first — `undefined` until the first read lands. Stable between changes. */
export const libraryFoldersSnapshot = folders.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs'. The first subscriber starts the read. */
export const subscribeLibraryFolders = folders.subscribe;

/** The folders, read now if they have not been. */
export const loadLibraryFolders = folders.load;

/** Resolves once every write issued so far has landed — what a test waits on before it resets. */
export const settledLibraryFolders = folders.settled;

/** **For tests**: forget what was read (the database is `resetLibraryCollectionStore`'s). */
export const resetLibraryFolderStore = folders.reset;

const write = folders.write;

const normaliseName = (name: string): string => name.trim().slice(0, MAX_LIBRARY_FOLDER_NAME);

/**
 * Create a folder at the top level (`null`) or inside `parentId`, to any
 * depth, and hand it back — `undefined` when nothing was created: a name that
 * trims to nothing, a parent that is not there, a full cap, or a failed write.
 */
export const createLibraryFolder = async (
  name: string,
  parentId: string | null,
  now: Date = new Date(),
): Promise<GameFolder | undefined> => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const folder: GameFolder = {
    id: newRecordId(now),
    name: trimmed,
    parentId,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  let made = false;
  const problem = await write((current) => {
    if (current.length >= MAX_LIBRARY_FOLDERS) return current;
    if (parentId !== null && !current.some((row) => row.id === parentId)) return current;
    made = true;
    return [...current, folder];
  });
  return made && problem === undefined ? folder : undefined;
};

/**
 * **An import's folders** (CTA-89, Settings' Import), made whole elsewhere —
 * ids, names and parents — and added at the end in one write, parents before
 * children as given. All or nothing: past the cap it is refused with
 * `"too-many"`.
 */
export const addLibraryFolders = async (
  added: readonly GameFolder[],
): Promise<LibraryFolderProblem | "too-many" | undefined> => {
  if (added.length === 0) return undefined;
  let tooMany = false;
  const problem = await write((current) => {
    if (current.length + added.length > MAX_LIBRARY_FOLDERS) {
      tooMany = true;
      return current;
    }
    return [...current, ...added];
  });
  return tooMany ? "too-many" : problem;
};

/** Rename one folder in place. An empty or unchanged name is a no-op. */
export const renameLibraryFolder = (
  id: string,
  name: string,
  now: Date = new Date(),
): Promise<LibraryFolderProblem | undefined> => {
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
 * Move one folder under a new parent — or to the top level with `null`. A
 * move into the folder's own subtree is refused (it would loop every path
 * through it), as is a parent that is not there; a move that changes nothing
 * is a no-op.
 */
export const moveLibraryFolder = (
  id: string,
  newParentId: string | null,
  now: Date = new Date(),
): Promise<LibraryFolderProblem | undefined> =>
  write((current) => {
    const existing = current.find((folder) => folder.id === id);
    if (existing === undefined || existing.parentId === newParentId) return current;
    if (newParentId !== null) {
      if (!current.some((folder) => folder.id === newParentId)) return current;
      if (gameFolderSubtree(current, id).has(newParentId)) return current;
    }
    return current.map((folder) =>
      folder.id === id ? { ...folder, parentId: newParentId, updatedAt: now.toISOString() } : folder,
    );
  });

/**
 * Delete one folder, keeping its contents: its sub-folders and the
 * collections filed directly in it move up to its own parent — the
 * collections even when the folder write failed, since a collection naming a
 * folder that is gone reads as the top level anyway. An unknown id is a no-op.
 */
export const removeLibraryFolder = async (
  id: string,
  now: Date = new Date(),
): Promise<LibraryFolderProblem | undefined> => {
  let parentId: string | null | undefined;
  const problem = await write((current) => {
    const existing = current.find((folder) => folder.id === id);
    if (existing === undefined) return current;
    parentId = current.some((folder) => folder.id === existing.parentId) ? existing.parentId : null;
    return current
      .filter((folder) => folder.id !== id)
      .map((folder) =>
        folder.parentId === id ? { ...folder, parentId: parentId ?? null, updatedAt: now.toISOString() } : folder,
      );
  });
  if (parentId !== undefined) await refileCollectionsIn(id, parentId);
  return problem;
};
