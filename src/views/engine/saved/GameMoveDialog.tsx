import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useTranslation } from "react-i18next";
import type { GameFolder } from "../../../lib/savedGameFolders";
import type { SavedGame } from "../../../lib/savedGames";
import FolderPicker from "./FolderPicker";

/**
 * Where a game is filed, prompted as a dialog — the one control the openings'
 * folder system does not have, and the whole reason games get one: an opening
 * is filed when it is saved (the save prompt carries the folder choice), but a
 * game is written by an effect on Play with Engine (nothing to click), so
 * filing happens here, on /engine/saved, one game at a time.
 *
 * The picker offers every folder plus **Unfiled**, the game's state when its
 * `folderId` is `null`. Nothing is excluded — a game is not a folder, and any
 * folder in the tree is a legal destination, including the one it is already
 * in (picking it is a no-op the store absorbs).
 */
function GameMoveDialog({
  open,
  folders,
  game,
  onFile,
  onClose,
}: {
  open: boolean;
  /** Every folder in the reader's tree, as the store holds them. */
  folders: readonly GameFolder[];
  /** The game being filed. */
  game: SavedGame | null;
  onFile: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("savedGames.folder.moveGame")}</DialogTitle>
      <DialogContent>
        <FolderPicker
          folders={folders}
          value={game?.folderId ?? null}
          onChange={onFile}
          noneLabel={t("savedGames.folder.unfiled")}
          noneTestId="game-folder-unfiled"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="game-folder-move-cancel">
          {t("savedGames.folder.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default GameMoveDialog;
