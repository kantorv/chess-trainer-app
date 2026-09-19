import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useTranslation } from "react-i18next";

/**
 * A folder's name, prompted as a dialog — the one dialog both the create and
 * the rename actions open. The two differ in the wording the caller picks
 * ("New folder" / "Rename folder") and in the initial value; the dialog itself
 * is a title, a text field and two buttons, and the callers own the rest.
 *
 * A cleared field is not savable: the store's rename treats an empty name as a
 * no-op rather than a wipe, and this dialog agrees — the button commits
 * nothing when there is no name to commit.
 */
function FolderNameDialog({
  open,
  title,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The dialog's heading — "new" wording or "rename" wording, from the caller. */
  title: string;
  /** The name to seed the field with — the existing name when renaming. */
  initial: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);

  /*
    Seed the field whenever the dialog opens — the rename dialog opens on a
    different folder each time, so the value is reset rather than kept.
    Adjusted during render rather than in an effect (the sanctioned
    derived-state pattern).
  */
  const [seed, setSeed] = useState({ open, initial });
  if (seed.open !== open || seed.initial !== initial) {
    setSeed({ open, initial });
    setName(initial);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("savedOpenings.folder.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (name.trim() !== "") onSave(name);
            }
          }}
          slotProps={{ htmlInput: { "data-testid": "opening-folder-name-input" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="opening-folder-name-cancel">
          {t("savedOpenings.folder.cancel")}
        </Button>
        <Button
          disabled={name.trim() === ""}
          onClick={() => {
            onSave(name);
            onClose();
          }}
          variant="contained"
          data-testid="opening-folder-name-save"
        >
          {t("savedOpenings.folder.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FolderNameDialog;
