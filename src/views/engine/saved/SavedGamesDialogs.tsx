import { useTranslation } from "react-i18next";

import {
  gameFolderChildren,
  gamesUnderFolder,
  type GameFolder,
} from "../../../lib/savedGameFolders";
import type { SavedGame } from "../../../lib/savedGames";
import {
  createGameFolder,
  moveGameFolder,
  renameGameFolder,
} from "../../../lib/savedGameFolderStore";
import { fileSavedGame } from "../../../lib/savedGameStore";
import FolderNameDialog from "./FolderNameDialog";
import FolderMoveDialog from "./FolderMoveDialog";
import GameMoveDialog from "./GameMoveDialog";
import FolderDeleteDialog from "./FolderDeleteDialog";

/**
 * What the name dialog is open for: creating under a parent, or renaming.
 * `null` is closed. Held by the screen (its "New folder" button opens it);
 * rendered here.
 */
export type NameDialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: GameFolder }
  | null;

/**
 * The Saved games screen's whole dialog stack — the four dialogs and their
 * wiring, rendered from the state the screen holds. The three folder dialogs
 * speak the folder store directly (create, rename, move); the delete runs
 * through the caller's `onDeleteFolder`, which decides whether a confirmation
 * is needed before the store's `removeGameFolder` is the operation; the game
 * move dialog files through `fileSavedGame`, the games store's in-place write.
 */
function SavedGamesDialogs({
  games,
  folders,
  nameDialog,
  setNameDialog,
  moving,
  setMoving,
  filing,
  setFiling,
  deleting,
  setDeleting,
  onDeleteFolder,
}: {
  games: readonly SavedGame[];
  folders: readonly GameFolder[];
  nameDialog: NameDialogState;
  setNameDialog: (next: NameDialogState) => void;
  moving: GameFolder | null;
  setMoving: (next: GameFolder | null) => void;
  /** The game being filed into a folder, or `null` for closed. */
  filing: SavedGame | null;
  setFiling: (next: SavedGame | null) => void;
  deleting: GameFolder | null;
  setDeleting: (next: GameFolder | null) => void;
  /** Delete one folder, keeping its contents — the screen's wording decider. */
  onDeleteFolder: (folder: GameFolder) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <FolderNameDialog
        open={nameDialog !== null}
        title={
          nameDialog === null
            ? ""
            : nameDialog.mode === "create"
              ? t("savedGames.folder.newFolder")
              : t("savedGames.folder.renameFolder")
        }
        initial={
          nameDialog !== null && nameDialog.mode === "rename"
            ? nameDialog.folder.name
            : ""
        }
        onSave={(name) => {
          if (nameDialog === null) return;
          if (nameDialog.mode === "create") {
            createGameFolder(name, nameDialog.parentId);
          } else {
            renameGameFolder(nameDialog.folder.id, name);
          }
        }}
        onClose={() => setNameDialog(null)}
      />

      <FolderMoveDialog
        open={moving !== null}
        folders={folders}
        folder={moving}
        currentParentName={t("savedGames.folder.topLevel")}
        onMove={(newParentId) => {
          if (moving !== null) moveGameFolder(moving.id, newParentId);
          setMoving(null);
        }}
        onClose={() => setMoving(null)}
      />

      <GameMoveDialog
        open={filing !== null}
        folders={folders}
        game={filing}
        onFile={(folderId) => {
          if (filing !== null) fileSavedGame(filing.id, folderId);
          setFiling(null);
        }}
        onClose={() => setFiling(null)}
      />

      <FolderDeleteDialog
        open={deleting !== null}
        folder={deleting}
        games={
          deleting === null ? 0 : gamesUnderFolder(games, folders, deleting.id)
        }
        subFolders={
          deleting === null ? 0 : gameFolderChildren(folders, deleting.id).length
        }
        onConfirm={() => {
          if (deleting !== null) onDeleteFolder(deleting);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

export default SavedGamesDialogs;
