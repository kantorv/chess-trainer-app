import type { SavedAnalysis } from "./savedAnalyses";
import {
  flattenGameFolders,
  gameFolderChildren,
  gameFolderFrom,
  gameFolderPath,
  gameFolderSubtree,
  type FlattenedGameFolder,
  type GameFolder,
} from "./savedGameFolders";

/**
 * **The reader's saved-analysis folders** (CTA-73) — a nested tree, the saved
 * games' model ([`savedGameFolders.ts`](./savedGameFolders.ts)) and the saved
 * openings' before it: a folder is a name and a parent id, the analyses name
 * their folder by `SavedAnalysis.folderId`, `null` is Unfiled.
 *
 * The entity is **the same shape** as a game folder, so it is that type and
 * those reads — the children, the breadcrumb chain, the subtree, the
 * flattened picker list, the normaliser, cycles cut and dangling parents read
 * as the top level — rather than a third copy of them. What is this file's own
 * is the one read that knows what is filed: {@link analysesInFolder}. The
 * storage half is [`savedAnalysisFolderStore.ts`](./savedAnalysisFolderStore.ts),
 * under its own key, so a game folder and an analysis folder never mix.
 */

/** One folder in the reader's saved-analysis tree. Plain JSON. */
export type AnalysisFolder = GameFolder;
export type FlattenedAnalysisFolder = FlattenedGameFolder;

export const analysisFolderFrom = gameFolderFrom;
export const analysisFolderChildren = gameFolderChildren;
export const analysisFolderPath = gameFolderPath;
export const analysisFolderSubtree = gameFolderSubtree;
export const flattenAnalysisFolders = flattenGameFolders;

/**
 * The analyses behind a click — everything under the folder, directly and
 * not: a folder card stands for its whole subtree, so its count and its
 * download name the same set. In the caller's order.
 */
export const analysesInFolder = (
  analyses: readonly SavedAnalysis[],
  folders: readonly AnalysisFolder[],
  id: string,
): SavedAnalysis[] => {
  const subtree = gameFolderSubtree(folders, id);
  return analyses.filter(
    (analysis) => analysis.folderId !== null && subtree.has(analysis.folderId),
  );
};

/** How many {@link analysesInFolder} returns — a folder card's count. */
export const analysesUnderFolder = (
  analyses: readonly SavedAnalysis[],
  folders: readonly AnalysisFolder[],
  id: string,
): number => analysesInFolder(analyses, folders, id).length;

/**
 * The analyses filed **directly** in `folderId` (`null`: the top level) — what
 * the browser lists there. One naming a folder that is gone reads as Unfiled,
 * so a half-deleted store still shows every record somewhere.
 */
export const analysesHere = (
  analyses: readonly SavedAnalysis[],
  folders: readonly AnalysisFolder[],
  folderId: string | null,
): SavedAnalysis[] =>
  analyses.filter((analysis) => {
    const parent =
      analysis.folderId !== null &&
      folders.some((folder) => folder.id === analysis.folderId)
        ? analysis.folderId
        : null;
    return parent === folderId;
  });
