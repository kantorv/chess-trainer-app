import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { OpeningTreePgnTags } from "../../lib/openingTreePgn";

/**
 * **Save tree as PGN's choice** (CTA-99) — whether the opening board's tree is
 * written with its counts: **No** (the moves alone) or **Add tags**, and then
 * which — `[%games N]`, `[%prc P]`, or both in one comment. The boxes are off
 * while No is picked, and Save is off while Add tags has neither ticked.
 * Opens on Add tags with `games` ticked; the choice then stays while the
 * screen does. Presentational: `onSave` is handed the tags to write.
 */

type Mode = "none" | "tags";

type OpeningTreePgnDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (tags: OpeningTreePgnTags) => void;
};

function OpeningTreePgnDialog({ open, onClose, onSave }: OpeningTreePgnDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("tags");
  const [games, setGames] = useState(true);
  const [prc, setPrc] = useState(false);

  const tagging = mode === "tags";
  const box = (
    id: "games" | "prc",
    checked: boolean,
    onChange: (checked: boolean) => void,
  ) => (
    <FormControlLabel
      disabled={!tagging}
      control={
        <Checkbox
          size="small"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          slotProps={{ input: { "data-testid": `library-filter-moves-save-${id}` } as object }}
        />
      }
      label={
        <Box>
          <Typography variant="body2">{t(`library.filters.moves.saveDialog.${id}`)}</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {t(`library.filters.moves.saveDialog.${id}Help`)}
          </Typography>
        </Box>
      }
    />
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" data-testid="library-filter-moves-save-dialog">
      <DialogTitle>{t("library.filters.moves.saveDialog.title")}</DialogTitle>
      <DialogContent>
        <RadioGroup
          value={mode}
          onChange={(_event, value) => setMode(value as Mode)}
          data-testid="library-filter-moves-save-mode"
        >
          <FormControlLabel
            value="none"
            control={<Radio size="small" slotProps={{ input: { "data-testid": "library-filter-moves-save-no" } as object }} />}
            label={t("library.filters.moves.saveDialog.no")}
          />
          <FormControlLabel
            value="tags"
            control={<Radio size="small" slotProps={{ input: { "data-testid": "library-filter-moves-save-tags" } as object }} />}
            label={t("library.filters.moves.saveDialog.tags")}
          />
        </RadioGroup>
        <Box sx={{ display: "grid", gap: 0.5, paddingInlineStart: 4 }}>
          {box("games", games, setGames)}
          {box("prc", prc, setPrc)}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="library-filter-moves-save-cancel">
          {t("library.filters.moves.saveDialog.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={tagging && !games && !prc}
          onClick={() => onSave(tagging ? { games, prc } : { games: false, prc: false })}
          data-testid="library-filter-moves-save-confirm"
        >
          {t("library.filters.moves.saveDialog.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default OpeningTreePgnDialog;
