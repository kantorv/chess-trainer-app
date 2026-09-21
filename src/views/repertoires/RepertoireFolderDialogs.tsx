import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { RepertoireFolder } from "../../lib/savedRepertoireFolders";

/**
 * **The Repertoires list's dialogs** — name a folder (new and rename),
 * confirm deleting one, and confirm deleting the picked repertoires. (Moving a
 * repertoire into a folder is its settings screen's, since CTA-68.)
 *
 * The shared folder dialogs (`views/shared/folders/`) are the model, reduced to
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
 * Confirm deleting the picked repertoires — the list's bulk delete (CTA-68).
 * The folder delete's dialog again, except that this one does delete: the
 * repertoires are gone, not moved.
 */
export function RepertoireBulkDeleteDialog({
  open,
  count,
  onConfirm,
  onClose,
  labelKey = "repertoires",
  testIdPrefix = "repertoires",
}: {
  open: boolean;
  /**
   * The locale block (`bulkDelete.*`, `folder.cancel`) and the test-id prefix —
   * the repertoires' by default; the Saved analyses list passes its own (CTA-73).
   */
  labelKey?: string;
  testIdPrefix?: string;
  /** How many repertoires are picked — what goes. */
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle data-testid={`${testIdPrefix}-delete-title`}>
        {t(`${labelKey}.bulkDelete.title`, { count })}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2">{t(`${labelKey}.bulkDelete.text`)}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid={`${testIdPrefix}-delete-cancel`}>
          {t(`${labelKey}.folder.cancel`)}
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          data-testid={`${testIdPrefix}-delete-confirm`}
        >
          {t(`${labelKey}.bulkDelete.confirm`)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
