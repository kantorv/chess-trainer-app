import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import { useTranslation } from "react-i18next";
import type { OpeningFolder } from "../../lib/savedOpeningFolders";
import { createOpeningFolder } from "../../lib/savedOpeningFolderStore";
import FolderPicker from "./FolderPicker";

/**
 * The save prompt: the note the opening is named by, and — since CTA-40 — the
 * folder it is filed under.
 *
 * It is [`NoteDialog.tsx`](./NoteDialog.tsx)'s successor for *saving*, and it
 * is a separate component rather than a mode of that one because the two
 * dialogs differ on the whole of their second half: the edit dialog has no
 * folder to choose (the note is all an edit changes), and this one carries the
 * tri-state a folder choice needs. `onSave` receives
 * `string | null | undefined`:
 *
 * - a folder id — the reader picked one, at any depth;
 * - `null` — the reader picked **Unfiled**, the top level;
 * - `undefined` — the reader picked nothing, which is the state this dialog
 *   opens on, and the **default rule's** cue: a position the ECO book names
 *   saves into a folder named after that opening (created if absent), an
 *   off-book position saves to Unfiled. `useOpenings.saveOpening` owns that
 *   rule; the dialog only says whether a choice was made.
 *
 * The inline "New folder" creates under the folder currently selected — root
 * when there is none — and selects what it just made, so a reader nesting a
 * new folder two levels deep does it without leaving the dialog. It is
 * created at once rather than only on the save: a folder is a real record, and
 * a reader who cancels the dialog keeps the folder, exactly as they keep one
 * made from the browser's own "New folder".
 */
function SaveOpeningDialog({
  open,
  folders,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Every folder in the reader's tree — the picker's rows. */
  folders: readonly OpeningFolder[];
  /** `folderChoice` is a folder id, `null` for Unfiled, `undefined` for "no choice". */
  onSave: (note: string, folderChoice: string | null | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [folderChoice, setFolderChoice] = useState<string | null | undefined>(
    undefined,
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  /*
    Seed both fields whenever the dialog opens — each save opens on a different
    position, so the values are reset rather than kept. Adjusted during render
    rather than in an effect (the sanctioned derived-state pattern): an effect
    would reset them a frame after the dialog is already showing.
  */
  const [seed, setSeed] = useState(open);
  if (seed !== open) {
    setSeed(open);
    setNote("");
    setFolderChoice(undefined);
    setCreating(false);
    setNewName("");
  }

  const save = () => {
    onSave(note, folderChoice);
    onClose();
  };

  const createFolder = () => {
    const created = createOpeningFolder(newName, folderChoice ?? null);
    if (created !== undefined) {
      setFolderChoice(created.id);
      setCreating(false);
      setNewName("");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("savedOpenings.note.saveTitle")}</DialogTitle>
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

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontWeight: 600 }}>
          {t("savedOpenings.folder.label")}
        </Typography>

        {creating ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label={t("savedOpenings.folder.name")}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createFolder();
                }
              }}
              slotProps={{ htmlInput: { "data-testid": "opening-new-folder-input" } }}
            />
            <Button
              size="small"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
              data-testid="opening-new-folder-cancel"
            >
              {t("savedOpenings.note.cancel")}
            </Button>
          </Box>
        ) : (
          <Button
            size="small"
            fullWidth
            startIcon={<CreateNewFolderRoundedIcon fontSize="small" />}
            data-testid="opening-new-folder"
            onClick={() => setCreating(true)}
          >
            {t("savedOpenings.folder.newFolder")}
          </Button>
        )}

        <Box
          data-testid="opening-folder-picker-box"
          sx={{ mt: 1, maxHeight: 240, overflowY: "auto" }}
        >
          <FolderPicker
            folders={folders}
            value={folderChoice}
            onChange={setFolderChoice}
            noneLabel={t("savedOpenings.folder.unfiled")}
            noneTestId="opening-folder-picker-unfiled"
          />
        </Box>

        <Typography
          variant="caption"
          data-testid="opening-folder-default-hint"
          sx={{ display: "block", mt: 1, color: "text.secondary" }}
        >
          {t("savedOpenings.folder.defaultHint")}
        </Typography>
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

export default SaveOpeningDialog;
