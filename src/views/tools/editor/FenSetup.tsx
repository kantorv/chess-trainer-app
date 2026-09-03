import type { FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import CopyableValue from "../../shared/CopyableValue";

/**
 * The FEN tab: a position in, and the position on the board back out.
 *
 * In and out are not symmetrical here, and deliberately so. What is pasted in
 * goes through `parseFen`, which rejects anything a game could not be played
 * from — a paste is a claim about a finished position. What comes out is
 * whatever is on the board right now, illegal boards included, because the
 * reader is looking at it in order to fix it; it is the *copy button* that is
 * switched off while the position is broken, not the field.
 *
 * Presentational — the text, the error and the parsing all live in
 * `BoardEditor.tsx` and `lib/fen.ts`.
 */

type FenSetupProps = {
  fenText: string;
  onFenTextChange: (text: string) => void;
  onLoadFen: (event: FormEvent) => void;
  error: string | null;
  /** The position on the board — read-only, and always shown. */
  currentFen: string;
  /** False while the position is illegal; the copy button follows it. */
  canCopy: boolean;
};

function FenSetup({
  fenText,
  onFenTextChange,
  onLoadFen,
  error,
  currentFen,
  canCopy,
}: FenSetupProps) {
  const { t } = useTranslation();

  return (
    <Box
      data-testid="editor-fen-setup"
      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          {t("editor.fen.title")}
        </Typography>
        <Box component="form" onSubmit={onLoadFen}>
          <TextField
            fullWidth
            size="small"
            label={t("editor.fen.label")}
            value={fenText}
            onChange={(event) => onFenTextChange(event.target.value)}
            slotProps={{
              htmlInput: { dir: "ltr", "data-testid": "editor-fen-input" },
            }}
          />
          <Button type="submit" size="small" variant="outlined" sx={{ mt: 1 }}>
            {t("editor.fen.load")}
          </Button>
        </Box>
      </Box>

      {error !== null && (
        <Alert severity="error" data-testid="editor-fen-error">
          {error}
        </Alert>
      )}

      <Box sx={{ display: "grid", gap: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t("editor.fen.currentTitle")}
        </Typography>
        <CopyableValue
          label={t("editor.fen.currentFen")}
          value={currentFen}
          testId="editor-current-fen"
          disabled={!canCopy}
          disabledHint={t("editor.problems.blocked")}
        />
      </Box>
    </Box>
  );
}

export default FenSetup;
