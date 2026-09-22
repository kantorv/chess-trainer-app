import type { SavedRepertoire } from "./savedRepertoires";

/**
 * **The folders the reader files repertoires under** — one level of them
 * (CTA-61).
 *
 * The saved games' and saved analyses' folders (`savedGameFolders.ts`,
 * `savedAnalysisFolders.ts`) are a tree; these are deliberately **flat**: a
 * folder holds repertoires, never another folder. So a folder has no
 * `parentId`, and everything those files do to keep a tree sound — cycle
 * guards, re-parenting on delete, a nested picker — has nothing to do here.
 * What joins a repertoire to its folder is `SavedRepertoire.folderId`, `null`
 * meaning **Unfiled** — the top level, which is where every repertoire saved
 * before folders existed already is.
 *
 * The one place a folder is made without the reader asking is a **split**: a
 * text of many games split into one repertoire each lands in a folder of its
 * own, named after the text, so hundreds of repertoires do not arrive loose in the
 * list.
 *
 * The pure half; the IndexedDB half and the CRUD are
 * [`savedRepertoireFolderStore.ts`](./savedRepertoireFolderStore.ts).
 */

/** One folder. Plain JSON. */
export type RepertoireFolder = {
  /** Stable for the life of the record, and the join to `SavedRepertoire.folderId`. */
  id: string;
  /** The reader's name for it. Not unique — ids are. */
  name: string;
  /** ISO 8601, when it was created. */
  savedAt: string;
  /** ISO 8601, when it was last renamed. */
  updatedAt: string;
};

/**
 * One stored row, normalised. A folder without an id is dropped — there is
 * nothing to file anything under — and anything else it gets wrong falls back
 * rather than costing the reader the folder. A `parentId` a row may carry (it
 * was never written, but a hand edit could add one) is ignored: folders are
 * one level.
 */
export const repertoireFolderFrom = (value: unknown): RepertoireFolder | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id === "") return undefined;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : "",
    savedAt: typeof row.savedAt === "string" ? row.savedAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
};

/**
 * The folders sorted by name, as a list and a picker show them — browsed, not
 * appended to, so the order a reader looks things up in. `localeCompare`,
 * because names are the reader's words in the reader's language.
 */
export const sortedRepertoireFolders = (
  folders: readonly RepertoireFolder[],
): RepertoireFolder[] =>
  [...folders].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

/**
 * The repertoires filed under a folder — `null` for Unfiled — in the list's
 * own order (newest first). A `folderId` naming a folder that is not there
 * reads as Unfiled, so a record is never hidden by a folder that was deleted
 * out from under it (another tab, a failed write).
 */
export const repertoiresInFolder = (
  repertoires: readonly SavedRepertoire[],
  folders: readonly RepertoireFolder[],
  folderId: string | null,
): SavedRepertoire[] => {
  const known = new Set(folders.map((folder) => folder.id));
  return repertoires.filter((saved) => {
    const filed = saved.folderId !== null && known.has(saved.folderId) ? saved.folderId : null;
    return filed === folderId;
  });
};
