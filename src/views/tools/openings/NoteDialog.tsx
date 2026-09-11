import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useTranslation } from "react-i18next";

/**
 * The one-line note a saved opening is named by, prompted as a dialog.
 *
 * Used in two places with one difference in who calls it: the Openings screen
 * asks for the note *when saving* (`onSave` mints a new record), and the Saved
 * openings screen asks when *editing* one (`onSave` updates the note in place).
 * The dialog itself knows nothing about which — it is a title, a text field and
 * two buttons, and the callers own the rest.
 */
function NoteDialog({
  open,
  title,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The dialog's heading — "save" wording or "edit" wording, from the caller. */
  title: string;
  /** The note to seed the field with — the existing note when editing. */
  initial: string;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(initial);

  // Seed the field whenever the dialog opens — the edit dialog opens on a
  // different record each time, so the value is reset rather than kept.
  useEffect(() => {
    if (open) setNote(initial);
  }, [open, initial]);

  const save = () => {
    onSave(note);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label={t("savedOpenings.note.label")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl/Cmd+Enter commits, as a multi-line field has no single
            // "Enter to submit" affordance.
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              save();
            }
          }}
          slotProps={{ htmlInput: { "data-testid": "opening-note-input" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="opening-note-cancel">
          {t("savedOpenings.note.cancel")}
        </Button>
        <Button onClick={save} variant="contained" data-testid="opening-note-save">
          {t("savedOpenings.note.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default NoteDialog;