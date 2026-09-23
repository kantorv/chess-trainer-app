import { idbRecordStore } from "./idbRecordStore";
import { newSavedAnalysisId as newAnalysisFolderId } from "./savedAnalyses";
import { ANALYSIS_CHANNEL, ANALYSIS_FOLDERS_STORE, openAnalysisDb } from "./savedAnalysisDb";
import {
  analysisFolderFrom,
  analysisFolderSubtree,
  type AnalysisFolder,
} from "./savedAnalysisFolders";
import { unfileAnalysesIn } from "./savedAnalysisStore";

/**
 * Where the reader's saved-analysis folders are kept (CTA-73): **IndexedDB**
 * since CTA-77, the `folders` object store beside the analyses
 * (`lib/savedAnalysisDb.ts`), over the shared
 * [`idbRecordStore.ts`](./idbRecordStore.ts).
 *
 * The CRUD lives in the store so every caller means the same thing:
 * {@link createAnalysisFolder} hands back what it made (a split, and the
 * Library's Analyse, file their records under it), {@link moveAnalysisFolder}
 * refuses the folder's own subtree, and {@link removeAnalysisFolder} keeps the
 * contents — sub-folders re-parent up a level and the analyses become
 * Unfiled. Every write is a promise; nothing throws.
 */

/** How many folders are kept — generous, but a bound. */
export const MAX_ANALYSIS_FOLDERS = 100;

/** How long a folder name may be. */
export const MAX_ANALYSIS_FOLDER_NAME = 100;

/** What went wrong with a write. */
export type AnalysisFolderProblem = "storage";

const folders = idbRecordStore<AnalysisFolder>({
  db: openAnalysisDb,
  store: ANALYSIS_FOLDERS_STORE,
  normalise: analysisFolderFrom,
  order: "oldest-first",
  channel: ANALYSIS_CHANNEL,
});

/** The folders, oldest first — `undefined` until the first read lands. Stable between changes. */
export const analysisFoldersSnapshot = folders.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs'. The first subscriber starts the read. */
export const subscribeAnalysisFolders = folders.subscribe;

/** The folders, read now if they have not been. */
export const loadAnalysisFolders = folders.load;

/** Resolves once every write issued so far has landed — what a test waits on before it resets. */
export const settledAnalysisFolders = folders.settled;

/** **For tests**: forget what was read (the database is `deleteAnalysisDb`'s). */
export const resetAnalysisFolderStore = folders.reset;

const write = folders.write;

const normaliseName = (name: string): string =>
  name.trim().slice(0, MAX_ANALYSIS_FOLDER_NAME);

/**
 * Create a folder, and hand it back — `undefined` when nothing was created: a
 * name that trims to nothing, a parent that is not there, a full cap, or a
 * failed write.
 */
export const createAnalysisFolder = async (
  name: string,
  parentId: string | null,
  now: Date = new Date(),
): Promise<AnalysisFolder | undefined> => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const folder: AnalysisFolder = {
    id: newAnalysisFolderId(now),
    name: trimmed,
    parentId,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  let made = false;
  const problem = await write((current) => {
    if (current.length >= MAX_ANALYSIS_FOLDERS) return current;
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
export const addAnalysisFolders = async (
  added: readonly AnalysisFolder[],
): Promise<AnalysisFolderProblem | "too-many" | undefined> => {
  if (added.length === 0) return undefined;
  let tooMany = false;
  const problem = await write((current) => {
    if (current.length + added.length > MAX_ANALYSIS_FOLDERS) {
      tooMany = true;
      return current;
    }
    return [...current, ...added];
  });
  return tooMany ? "too-many" : problem;
};

/** Rename one folder in place. An empty or unchanged name is a no-op. */
export const renameAnalysisFolder = (
  id: string,
  name: string,
  now: Date = new Date(),
): Promise<AnalysisFolderProblem | undefined> => {
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
export const moveAnalysisFolder = (
  id: string,
  newParentId: string | null,
  now: Date = new Date(),
): Promise<AnalysisFolderProblem | undefined> =>
  write((current) => {
    const existing = current.find((folder) => folder.id === id);
    if (existing === undefined || existing.parentId === newParentId) return current;
    if (newParentId !== null) {
      if (!current.some((folder) => folder.id === newParentId)) return current;
      if (analysisFolderSubtree(current, id).has(newParentId)) return current;
    }
    return current.map((folder) =>
      folder.id === id
        ? { ...folder, parentId: newParentId, updatedAt: now.toISOString() }
        : folder,
    );
  });

/**
 * Delete one folder, keeping its contents: its sub-folders re-parent to its own
 * parent, and the analyses filed directly in it become Unfiled — even when the
 * folder write failed, since a record naming a folder that is gone reads as
 * Unfiled anyway. An unknown id is a no-op.
 */
export const removeAnalysisFolder = async (
  id: string,
  now: Date = new Date(),
): Promise<AnalysisFolderProblem | undefined> => {
  let found = false;
  const problem = await write((current) => {
    const existing = current.find((folder) => folder.id === id);
    if (existing === undefined) return current;
    found = true;
    return current
      .filter((folder) => folder.id !== id)
      .map((folder) =>
        folder.parentId === id
          ? { ...folder, parentId: existing.parentId, updatedAt: now.toISOString() }
          : folder,
      );
  });
  if (found) await unfileAnalysesIn(id);
  return problem;
};
