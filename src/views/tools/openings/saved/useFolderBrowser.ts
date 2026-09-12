import { useState } from "react";

import type { SavedOpening } from "../../../../lib/savedOpenings";
import {
  openingFolderChildren,
  openingFolderPath,
  type OpeningFolder,
} from "../../../../lib/savedOpeningFolders";

/**
 * Where the Saved openings browser is standing — the one hook of the split
 * screen that is about *folders* rather than pixels, and unit-testable for it:
 * `openings` and `folders` are plain parameters, so a test drives it without a
 * screen around it.
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
 * - **An opening whose folderId names a folder that is gone reads as
 *   Unfiled** — it shows at the top level, and nowhere else, so a half-deleted
 *   store still renders every record.
 * - **`openingsHere` is this folder's openings only**, where a folder export or
 *   a card count is the whole subtree (`openInFolder` /
 *   `openingsUnderFolder`) — those are the caller's, since they name what is
 *   *behind* a click rather than what is on screen.
 */
export type FolderBrowser = {
  /** The folder the reader is standing in, resolved; `undefined` at the top. */
  currentFolder: OpeningFolder | undefined;
  /** The id the browser is on: the folder's id, or `null` at the top level. */
  browseId: string | null;
  /** This folder's direct sub-folders, name-sorted by the helper. */
  foldersHere: readonly OpeningFolder[];
  /** The openings filed directly here — dangling folderIds read as Unfiled. */
  openingsHere: readonly SavedOpening[];
  /** The chain from the top level down to here, this folder included. */
  crumbs: readonly OpeningFolder[];
  /** Drill in; `null` returns to the top level. */
  open: (id: string | null) => void;
};

export const useFolderBrowser = (
  openings: readonly SavedOpening[],
  folders: readonly OpeningFolder[],
): FolderBrowser => {
  const [folderId, setFolderId] = useState<string | null>(null);

  const currentFolder =
    folderId === null
      ? undefined
      : folders.find((folder) => folder.id === folderId);
  if (folderId !== null && currentFolder === undefined) setFolderId(null);
  const browseId = currentFolder?.id ?? null;

  const foldersHere = openingFolderChildren(folders, browseId);

  const openingsHere = openings.filter((opening) => {
    const parent =
      opening.folderId !== null &&
      folders.some((folder) => folder.id === opening.folderId)
        ? opening.folderId
        : null;
    return parent === browseId;
  });

  const crumbs =
    currentFolder === undefined
      ? []
      : openingFolderPath(folders, currentFolder.id);

  return {
    currentFolder,
    browseId,
    foldersHere,
    openingsHere,
    crumbs,
    open: setFolderId,
  };
};
