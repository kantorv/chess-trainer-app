import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import FolderPicker from "../../shared/folders/FolderPicker";
import { useAnalysisFolders } from "./saved/useAnalysisFolders";

/**
 * **Saving a board that is not a record yet** (CTA-73) — a name and a folder,
 * then the board is a saved analysis. The name is seeded with what the board
 * would be called anyway (its players, its event), and may be left empty; the
 * folder is picked from the reader's tree — the saved games' picker over the
 * analyses' own folders — Unfiled by default.
 */
function SaveAnalysisDialog({
  open,
  initialName,
  onSave,
  onClose,
}: {
  open: boolean;
  initialName: string;
  onSave: (name: string, folderId: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const folders = useAnalysisFolders();
  const [name, setName] = useState(initialName);
  const [folderId, setFolderId] = useState<string | null>(null);

  /* Seeded each time it opens — adjusted during render, not in an effect. */
  const [seed, setSeed] = useState({ open, initialName });
  if (seed.open !== open || seed.initialName !== initialName) {
    setSeed({ open, initialName });
    setName(initialName);
    if (open) setFolderId(null);
  }

  const save = () => {
    onSave(name, folderId);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("analysis.save.title")}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={t("analysis.save.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          slotProps={{ htmlInput: { "data-testid": "analysis-save-name", dir: "auto" } }}
        />
        <div>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {t("analysis.save.folder")}
          </Typography>
          <FolderPicker
            labelKey="savedAnalyses"
            idPrefix="analysis-folder"
            folders={folders}
            value={folderId}
            onChange={setFolderId}
            noneLabel={t("savedAnalyses.folder.unfiled")}
            noneTestId="analysis-folder-unfiled"
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="analysis-save-cancel">
          {t("savedAnalyses.folder.cancel")}
        </Button>
        <Button variant="contained" onClick={save} data-testid="analysis-save-confirm">
          {t("analysis.save.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SaveAnalysisDialog;
