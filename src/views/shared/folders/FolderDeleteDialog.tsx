import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { GameFolder } from "../../../lib/savedGameFolders";

/**
 * The delete confirmation for a non-empty folder — the one place the "deleting
 * a folder keeps its contents" rule is stated to the reader before it runs:
 * the games filed directly under it become Unfiled, and its sub-folders
 * re-parent to the deleted folder's own parent, so the tree closes up rather
 * than leaving a hole.
 *
 * An empty folder never reaches this dialog — deleting nothing asks for
 * nothing — and the store's `removeGameFolder` is the operation that actually
 * keeps the contents; this dialog only announces it.
 */
function FolderDeleteDialog({
  open,
  labelKey = "savedGames",
  idPrefix = "game-folder",
  folder,
  games,
  subFolders,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The folder the confirmation is about. */
  folder: GameFolder | null;
  /** How many games are behind the click, directly and not. */
  games: number;
  /** How many sub-folders are behind the click. */
  subFolders: number;
  onConfirm: () => void;
  onClose: () => void;
  /** The locale block — `savedGames` by default; its `folder.*` keys are read. */
  labelKey?: string;
  /** The test-id prefix — `game-folder` by default. */
  idPrefix?: string;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {folder === null
          ? t(`${labelKey}.folder.deleteFolder`)
          : `${t(`${labelKey}.folder.deleteFolder`)}: ${folder.name}`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {t(`${labelKey}.folder.deleteConfirm`)}
        </Typography>
        <Typography
          variant="caption"
          data-testid={`${idPrefix}-delete-counts`}
          sx={{ display: "block", mt: 1, color: "text.secondary" }}
        >
          {t(`${labelKey}.folder.deleteCounts`, { games, subFolders })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid={`${idPrefix}-delete-cancel`}>
          {t(`${labelKey}.folder.cancel`)}
        </Button>
        <Button
          color="error"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          variant="contained"
          data-testid={`${idPrefix}-delete-confirm`}
        >
          {t(`${labelKey}.folder.deleteFolder`)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FolderDeleteDialog;
