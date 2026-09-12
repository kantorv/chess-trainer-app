import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useTranslation } from "react-i18next";
import {
  openingFolderSubtree,
  type OpeningFolder,
} from "../../../../lib/savedOpeningFolders";
import FolderPicker from "../FolderPicker";

/**
 * Where a folder moves to, prompted as a dialog: any folder in the reader's
 * tree, or the top level.
 *
 * The picker **excludes the moved folder's own subtree** — a folder moved
 * under itself would take its ancestors' ids with it and loop every path
 * through the moved part; the store's `moveOpeningFolder` refuses that move,
 * and this dialog never offers it. What is left is every other folder and the
 * top level, which is the whole of the legal set.
 */
function FolderMoveDialog({
  open,
  folders,
  folder,
  currentParentName,
  onMove,
  onClose,
}: {
  open: boolean;
  /** Every folder in the reader's tree, as the store holds them. */
  folders: readonly OpeningFolder[];
  /** The folder being moved. */
  folder: OpeningFolder | null;
  /** The "none" row's label — the top level, the move's other destination. */
  currentParentName: string;
  onMove: (newParentId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("savedOpenings.folder.moveFolder")}</DialogTitle>
      <DialogContent>
        <FolderPicker
          folders={folders}
          value={folder?.parentId ?? null}
          onChange={onMove}
          noneLabel={currentParentName}
          noneTestId="opening-folder-move-top"
          exclude={folder === null ? undefined : [...openingFolderSubtree(folders, folder.id)]}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="opening-folder-move-cancel">
          {t("savedOpenings.folder.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FolderMoveDialog;
