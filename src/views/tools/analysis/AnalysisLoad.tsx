import { useRef } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useTranslation } from "react-i18next";

import MergeSplitChoice from "../../shared/MergeSplitChoice";
import { useAnalysisLoad, type AnalysisLoadConfig } from "./useAnalysisLoad";

/**
 * **The Load tab** (CTA-73) — a game or a position onto the board, as a new
 * analysis not yet saved. The state is [`useAnalysisLoad`](./useAnalysisLoad.ts)
 * — the pipeline on its own — and this is the Analysis Board's and the Openings
 * explorer's arrangement of it; the analyses Lobby's form (CTA-96) places the
 * pieces itself over the same hook.
 *
 * A PGN — picked as a file or pasted, one route for both — is read the way a
 * repertoire is (`readRepertoireText`: the uploads' size and emptiness rules,
 * every game parsed as a tree, side lines and comments kept). **One game**
 * goes onto the board. **Several** ask the repertoire question
 * (`MergeSplitChoice`): **merge** them into one tree, which goes onto the
 * board unsaved like one game; or **split** them into one saved analysis
 * each, filed together in a new folder named after the text — and the reader
 * is taken there (`onSplit`). A PGN of a position and no moves loads as that
 * position. A **FEN** is a position: it turns the board to the side to move,
 * where a game does not.
 */
function AnalysisLoad({
  settings,
  onLoadTree,
  onLoadFen,
  onLoadPosition,
  onSplit,
  choiceLabelKey = "analysis.load.choice",
}: AnalysisLoadConfig & {
  /** The merge-or-split choice's locale block — a board without a split words it without one. */
  choiceLabelKey?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useAnalysisLoad({ settings, onLoadTree, onLoadFen, onLoadPosition, onSplit });

  return (
    <Box
      data-testid="analysis-load"
      sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 1 }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {t("analysis.load.pgnTitle")}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", mt: -1 }}>
        {t("analysis.load.pgnHelp")}
      </Typography>
      <Box>
        {/* A label wrapping a hidden input — the file dialog opens only from a
            real `<input type="file">`. */}
        <Button
          component="label"
          size="small"
          variant="outlined"
          startIcon={<UploadFileRoundedIcon />}
          data-testid="analysis-load-pick"
        >
          {t("analysis.position.chooseFile")}
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".pgn,application/x-chess-pgn,text/plain"
            data-testid="analysis-load-input"
            onChange={(event) => {
              void load.onPicked(event.target.files);
              // Cleared at once, so picking the same file again still fires a change.
              if (inputRef.current !== null) inputRef.current.value = "";
            }}
          />
        </Button>
      </Box>
      <TextField
        multiline
        minRows={4}
        maxRows={10}
        size="small"
        label={t("analysis.position.pasteLabel")}
        value={load.pasted}
        onChange={(event) => load.setPasted(event.target.value)}
        slotProps={{ htmlInput: { "data-testid": "analysis-load-paste", dir: "ltr" } }}
      />
      <Box>
        <Button
          size="small"
          variant="contained"
          disabled={load.pasted.trim() === ""}
          onClick={() => load.bringIn(load.pasted)}
          data-testid="analysis-load-text"
        >
          {t("analysis.position.loadText")}
        </Button>
      </Box>
      {load.problem !== null && (
        <Alert severity="error" data-testid="analysis-load-problem">
          {load.problem}
        </Alert>
      )}
      {load.loaded && (
        <Typography
          variant="caption"
          role="status"
          data-testid="analysis-load-done"
          sx={{ color: "success.main" }}
        >
          {t("analysis.load.loaded")}
        </Typography>
      )}
      {load.choice !== null && (
        <MergeSplitChoice
          labelKey={choiceLabelKey}
          testIdPrefix="analysis-choice"
          count={load.choice.games.length}
          skipped={load.choice.skipped}
          mergeable={load.choice.mergeable}
          onMerge={load.merge}
          onSplit={onSplit === undefined ? undefined : () => void load.split()}
          problem={load.choiceProblem}
        />
      )}

      {onLoadFen !== undefined && (
        <>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>
            {t("analysis.position.fenTitle")}
          </Typography>
          <TextField
            size="small"
            label={t("analysis.position.fenLabel")}
            value={load.fenText}
            onChange={(event) => load.setFenText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                load.applyFen();
              }
            }}
            slotProps={{ htmlInput: { "data-testid": "analysis-load-fen-input", dir: "ltr" } }}
          />
          <Box>
            <Button
              size="small"
              variant="outlined"
              disabled={load.fenText.trim() === ""}
              onClick={load.applyFen}
              data-testid="analysis-load-fen"
            >
              {t("analysis.position.loadFen")}
            </Button>
          </Box>
          {load.fenProblem !== null && (
            <Alert severity="error" data-testid="analysis-load-fen-problem">
              {load.fenProblem}
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}

export default AnalysisLoad;
