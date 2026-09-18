import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import FolderOffRoundedIcon from "@mui/icons-material/FolderOffRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import { useTranslation } from "react-i18next";

import {
  sortedRepertoireFolders,
  type RepertoireFolder,
} from "../../lib/savedRepertoireFolders";

/**
 * **The Repertoires list's three folder dialogs** — name one (new and rename),
 * confirm deleting one, and move a repertoire into one.
 *
 * The saved games' dialogs (`views/engine/saved/`) are the model, reduced to
 * what a one-level list needs: no nested picker, no folder moves, no
 * sub-folder counts. Presentational: each takes what it shows and reports
 * what was chosen, and the list screen makes the store call.
 */

/** Name a folder — a new one (`initial` empty) or an existing one. */
export function RepertoireFolderNameDialog({
  open,
  title,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  initial: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);

  // Re-seeded whenever it opens, on whichever folder — adjusted during
  // render, the sanctioned derived-state pattern, rather than in an effect.
  const [seed, setSeed] = useState({ open, initial });
  if (seed.open !== open || seed.initial !== initial) {
    setSeed({ open, initial });
    setName(initial);
  }

  const save = () => {
    if (name.trim() === "") return;
    onSave(name);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={t("repertoires.folder.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          slotProps={{ htmlInput: { "data-testid": "repertoire-folder-name-input" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="repertoire-folder-name-cancel">
          {t("repertoires.folder.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={name.trim() === ""}
          onClick={save}
          data-testid="repertoire-folder-name-save"
        >
          {t("repertoires.folder.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Confirm deleting a folder that has repertoires in it. */
export function RepertoireFolderDeleteDialog({
  folder,
  count,
  onConfirm,
  onClose,
}: {
  /** The folder asked about; `null` keeps the dialog closed. */
  folder: RepertoireFolder | null;
  /** How many repertoires it holds — what goes back to Unfiled. */
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={folder !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {folder === null
          ? t("repertoires.folder.delete")
          : `${t("repertoires.folder.delete")}: ${folder.name}`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" data-testid="repertoire-folder-delete-text">
          {t("repertoires.folder.deleteConfirm", { count })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="repertoire-folder-delete-cancel">
          {t("repertoires.folder.cancel")}
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          data-testid="repertoire-folder-delete-confirm"
        >
          {t("repertoires.folder.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Move a repertoire: Unfiled, or any folder — a flat list, since folders are
 * one level. A pick is the move; the dialog closes on it.
 */
export function RepertoireMoveDialog({
  open,
  folders,
  current,
  onMove,
  onClose,
}: {
  open: boolean;
  folders: readonly RepertoireFolder[];
  /** Where the repertoire is now — `null` for Unfiled. */
  current: string | null;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pick = (folderId: string | null) => {
    onMove(folderId);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("repertoires.folder.moveTitle")}</DialogTitle>
      <DialogContent>
        <List dense disablePadding data-testid="repertoire-folder-picker">
          <ListItemButton
            selected={current === null}
            onClick={() => pick(null)}
            data-testid="repertoire-folder-pick-unfiled"
            sx={{ borderRadius: 0.5 }}
          >
            <FolderOffRoundedIcon fontSize="small" sx={{ mr: 1.5, color: "text.secondary" }} />
            <ListItemText primary={t("repertoires.folder.unfiled")} />
          </ListItemButton>
          {sortedRepertoireFolders(folders).map((folder) => (
            <ListItemButton
              key={folder.id}
              selected={current === folder.id}
              onClick={() => pick(folder.id)}
              data-testid={`repertoire-folder-pick-${folder.id}`}
              sx={{ borderRadius: 0.5 }}
            >
              <FolderRoundedIcon
                fontSize="small"
                sx={{ mr: 1.5, color: "text.secondary", flexShrink: 0 }}
              />
              <ListItemText
                primary={folder.name || t("repertoires.untitled")}
                slotProps={{ primary: { noWrap: true } }}
              />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="repertoire-folder-move-cancel">
          {t("repertoires.folder.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
