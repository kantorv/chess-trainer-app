import { recordStore } from "./recordStore";
import { newSavedAnalysisId as newAnalysisFolderId } from "./savedAnalyses";
import {
  analysisFolderFrom,
  analysisFolderSubtree,
  type AnalysisFolder,
} from "./savedAnalysisFolders";
import { unfileAnalysesIn } from "./savedAnalysisStore";

/**
 * Where the reader's saved-analysis folders are kept (CTA-73): one
 * `localStorage` key, holding a JSON array of {@link AnalysisFolder}.
 *
 * [`savedGameFolderStore.ts`](./savedGameFolderStore.ts) again over its own
 * key, and for its reasons — the CRUD lives in the store so every caller
 * means the same thing: {@link createAnalysisFolder} hands back what it made
 * (a split files its records under it), {@link moveAnalysisFolder} refuses the
 * folder's own subtree, and {@link removeAnalysisFolder} keeps the contents —
 * sub-folders re-parent up a level and the analyses become Unfiled, in one
 * write-through.
 */

/** The `localStorage` key. Versioned, so a future shape change is a new key. */
export const ANALYSIS_FOLDERS_STORAGE_KEY = "chessapp.savedAnalysisFolders.v1";

/** How many folders are kept — generous, but a bound. */
export const MAX_ANALYSIS_FOLDERS = 100;

/** How long a folder name may be. */
export const MAX_ANALYSIS_FOLDER_NAME = 100;

/** What went wrong with a write. */
export type AnalysisFolderProblem = "storage";

const folders = recordStore<AnalysisFolder>(
  ANALYSIS_FOLDERS_STORAGE_KEY,
  analysisFolderFrom,
);

/** The folders, in storage order. Stable between changes. */
export const analysisFoldersSnapshot = folders.snapshot;

/** Subscribe to changes — this tab's writes, and other tabs' through `storage`. */
export const subscribeAnalysisFolders = folders.subscribe;

const write = folders.write;

const normaliseName = (name: string): string =>
  name.trim().slice(0, MAX_ANALYSIS_FOLDER_NAME);

/** One folder by id, or `undefined`. */
export const findAnalysisFolder = (
  id: string | null | undefined,
): AnalysisFolder | undefined =>
  id === null || id === undefined
    ? undefined
    : analysisFoldersSnapshot().find((folder) => folder.id === id);

/**
 * Create a folder, and hand it back — `undefined` when nothing was created: a
 * name that trims to nothing, a parent that is not there, a full cap, or a
 * failed write.
 */
export const createAnalysisFolder = (
  name: string,
  parentId: string | null,
  now: Date = new Date(),
): AnalysisFolder | undefined => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const current = analysisFoldersSnapshot();
  if (current.length >= MAX_ANALYSIS_FOLDERS) return undefined;
  if (parentId !== null && !current.some((folder) => folder.id === parentId)) {
    return undefined;
  }

  const folder: AnalysisFolder = {
    id: newAnalysisFolderId(now),
    name: trimmed,
    parentId,
    savedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return write([...current, folder]) === undefined ? folder : undefined;
};

/** Rename one folder in place. An empty or unchanged name is a no-op. */
export const renameAnalysisFolder = (
  id: string,
  name: string,
  now: Date = new Date(),
): AnalysisFolderProblem | undefined => {
  const trimmed = normaliseName(name);
  if (trimmed === "") return undefined;

  const current = analysisFoldersSnapshot();
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
 * Move one folder under a new parent — or to the top level with `null`. A
 * move into the folder's own subtree is refused (it would loop every path
 * through it), as is a parent that is not there; a move that changes nothing
 * is a no-op.
 */
export const moveAnalysisFolder = (
  id: string,
  newParentId: string | null,
  now: Date = new Date(),
): AnalysisFolderProblem | undefined => {
  const current = analysisFoldersSnapshot();
  const existing = current.find((folder) => folder.id === id);
  if (existing === undefined || existing.parentId === newParentId) return undefined;
  if (newParentId !== null) {
    if (!current.some((folder) => folder.id === newParentId)) return undefined;
    if (analysisFolderSubtree(current, id).has(newParentId)) return undefined;
  }

  return write(
    current.map((folder) =>
      folder.id === id
        ? { ...folder, parentId: newParentId, updatedAt: now.toISOString() }
        : folder,
    ),
  );
};

/**
 * Delete one folder, keeping its contents: its sub-folders re-parent to its own
 * parent, and the analyses filed directly in it become Unfiled — even when the
 * folder write failed, since a record naming a folder that is gone reads as
 * Unfiled anyway. An unknown id is a no-op.
 */
export const removeAnalysisFolder = (
  id: string,
  now: Date = new Date(),
): AnalysisFolderProblem | undefined => {
  const current = analysisFoldersSnapshot();
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
  unfileAnalysesIn(id);
  return problem;
};
