import { useState } from "react";

import type { SavedGame } from "../../../lib/savedGames";
import {
  gameFolderChildren,
  gameFolderPath,
  type GameFolder,
} from "../../../lib/savedGameFolders";

/**
 * Where the Saved games browser is standing — the one hook of the split screen
 * that is about *folders* rather than pixels, and unit-testable for it: `games`
 * and `folders` are plain parameters, so a test drives it without a screen
 * around it. [`views/tools/openings/saved/useFolderBrowser.ts`](../../../tools/openings/saved/useFolderBrowser.ts)
 * again, over the games' own types, for the same reason.
 *
 * `null` is the top level, everything else a folder id. Browse state, not URL
 * state — the criterion is breadcrumbs and a back path, not deep links, and
 * nothing else in this screen travels.
 *
 * Three rules:
 *
 * - **A folder deleted out from under the browser reads as the top level**, not
 *   as a hole in the tree — its own delete below, or another tab's. Adjusted
 *   during render rather than in an effect, the sanctioned derived-state
 *   pattern, and every read goes through `browseId` so even the discarded pass
 *   is consistent.
 * - **A game whose folderId names a folder that is gone reads as Unfiled** — it
 *   shows at the top level, and nowhere else, so a half-deleted store still
 *   renders every record.
 * - **`gamesHere` is this folder's games only**, where a folder export or a
 *   card count is the whole subtree (`gamesInFolder` / `gamesUnderFolder`) —
 *   those are the caller's, since they name what is *behind* a click rather
 *   than what is on screen.
 */
export type FolderBrowser = {
  /** The folder the reader is standing in, resolved; `undefined` at the top. */
  currentFolder: GameFolder | undefined;
  /** The id the browser is on: the folder's id, or `null` at the top level. */
  browseId: string | null;
  /** This folder's direct sub-folders, name-sorted by the helper. */
  foldersHere: readonly GameFolder[];
  /** The games filed directly here — dangling folderIds read as Unfiled. */
  gamesHere: readonly SavedGame[];
  /** The chain from the top level down to here, this folder included. */
  crumbs: readonly GameFolder[];
  /** Drill in; `null` returns to the top level. */
  open: (id: string | null) => void;
};

export const useFolderBrowser = (
  games: readonly SavedGame[],
  folders: readonly GameFolder[],
): FolderBrowser => {
  const [folderId, setFolderId] = useState<string | null>(null);

  const currentFolder =
    folderId === null
      ? undefined
      : folders.find((folder) => folder.id === folderId);
  if (folderId !== null && currentFolder === undefined) setFolderId(null);
  const browseId = currentFolder?.id ?? null;

  const foldersHere = gameFolderChildren(folders, browseId);

  const gamesHere = games.filter((game) => {
    const parent =
      game.folderId !== null &&
      folders.some((folder) => folder.id === game.folderId)
        ? game.folderId
        : null;
    return parent === browseId;
  });

  const crumbs =
    currentFolder === undefined ? [] : gameFolderPath(folders, currentFolder.id);

  return {
    currentFolder,
    browseId,
    foldersHere,
    gamesHere,
    crumbs,
    open: setFolderId,
  };
};
