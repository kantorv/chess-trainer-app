import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { OpeningFolder } from "../../../../lib/savedOpeningFolders";

/**
 * The delete confirmation for a non-empty folder — the one place the "deleting
 * a folder keeps its contents" rule is stated to the reader before it runs:
 * the openings filed directly under it become Unfiled, and its sub-folders
 * re-parent to the deleted folder's own parent, so the tree closes up rather
 * than leaving a hole.
 *
 * An empty folder never reaches this dialog — deleting nothing asks for
 * nothing — and the store's `removeOpeningFolder` is the operation that
 * actually keeps the contents; this dialog only announces it.
 */
function FolderDeleteDialog({
  open,
  folder,
  openings,
  subFolders,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The folder the confirmation is about. */
  folder: OpeningFolder | null;
  /** How many openings are behind the click, directly and not. */
  openings: number;
  /** How many sub-folders are behind the click. */
  subFolders: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {folder === null
          ? t("savedOpenings.folder.deleteFolder")
          : `${t("savedOpenings.folder.deleteFolder")}: ${folder.name}`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {t("savedOpenings.folder.deleteConfirm")}
        </Typography>
        <Typography
          variant="caption"
          data-testid="opening-folder-delete-counts"
          sx={{ display: "block", mt: 1, color: "text.secondary" }}
        >
          {t("savedOpenings.folder.deleteCounts", { openings, subFolders })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="opening-folder-delete-cancel">
          {t("savedOpenings.folder.cancel")}
        </Button>
        <Button
          color="error"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          variant="contained"
          data-testid="opening-folder-delete-confirm"
        >
          {t("savedOpenings.folder.deleteFolder")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FolderDeleteDialog;
