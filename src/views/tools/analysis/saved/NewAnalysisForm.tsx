import { useMemo } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { Link as RouterLink } from "react-router";
import { useTranslation } from "react-i18next";

import { parseFen } from "../../../../lib/fen";
import { START_POSITION } from "../../../../lib/positionEditor";
import PositionEditor from "../../../shared/positionEditor/PositionEditor";
import { usePositionEditor } from "../../../shared/positionEditor/usePositionEditor";

/**
 * **The Lobby of analyses' new-analysis form** (CTA-87) — the right-hand
 * panel of `/tools/analysis/saved`, the counterpart of the engine Lobby's
 * `NewGameForm`: the shared position editor over a full-width **Start** that
 * opens the Analysis Board — `/tools/analysis`, the position riding along as
 * `?fen=` whenever the editor holds one other than the standard start. A
 * position turns the board there, so the analysis opens facing its side to
 * move.
 *
 * There is no Game tab: nothing rides along to the Analysis Board — its
 * engine and its settings are its own tabs — so the editor is the whole form,
 * from the standard start on every visit, facing White until Flip says
 * otherwise. Start is **off**, saying why, while the editor's position cannot
 * be analyzed, exactly as the engine Lobby's Start is off while one cannot be
 * played from.
 */

/** The widest the editor's board grows in the panel — a small board, beside the list. */
const EDITOR_BOARD_MAX_PX = 360;

function NewAnalysisForm() {
  const { t } = useTranslation();
  const editor = usePositionEditor();

  /*
    The position Start carries: none for the standard start, so the plain
    board the list's New opens is what the form's does. `parseFen` is the
    arrival's own gate, and a `?fen=` it refused would be dropped silently on
    the Analysis Board — so it is asked here too, a safety net under
    `positionProblems` for anything the two ever disagree on.
  */
  const customFen = editor.fen === START_POSITION ? undefined : editor.fen;
  const analyzable = useMemo(() => {
    if (!editor.isValid) return false;
    if (customFen === undefined) return true;
    try {
      parseFen(customFen);
      return true;
    } catch {
      return false;
    }
  }, [editor.isValid, customFen]);

  const href =
    customFen === undefined
      ? "/tools/analysis"
      : `/tools/analysis?fen=${encodeURIComponent(customFen)}`;

  return (
    <Box
      data-testid="new-analysis-form"
      sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 1.5 }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, flexShrink: 0 }}>
        {t("savedAnalyses.newAnalysis.title")}
      </Typography>

      {/* The panel's one scrolling region: the aside scrolls nothing itself. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", pr: 0.5 }}>
        <PositionEditor
          editor={editor}
          testId="new-analysis-editor"
          boardMaxWidth={EDITOR_BOARD_MAX_PX}
        />
      </Box>

      <Box sx={{ flexShrink: 0, display: "grid", gap: 1 }}>
        {!analyzable && (
          <Alert severity="warning" data-testid="new-analysis-illegal" sx={{ py: 0.5 }}>
            {t("savedAnalyses.newAnalysis.illegal")}
            {editor.problems.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {editor.problems.map((problem) => (
                  <li key={problem}>{t(`positionEditor.problems.${problem}`)}</li>
                ))}
              </Box>
            )}
          </Alert>
        )}
        {/* Off, it is a plain button rather than a link: nothing to follow. */}
        <Button
          {...(analyzable ? { component: RouterLink, to: href } : { disabled: true })}
          variant="contained"
          size="large"
          fullWidth
          startIcon={<PlayArrowRoundedIcon />}
          data-testid="new-analysis-start"
          sx={{ py: 1.25, fontWeight: 700 }}
        >
          {t("savedAnalyses.newAnalysis.start")}
        </Button>
        {/* What the panel said before the form came: where the list's analyses
            are kept — as the engine Lobby's note sits under its Start. */}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {t("savedAnalyses.hint")}
        </Typography>
        <Typography
          variant="caption"
          data-testid="saved-analyses-storage-note"
          sx={{ color: "text.secondary" }}
        >
          {t("savedAnalyses.storage")}
        </Typography>
      </Box>
    </Box>
  );
}

export default NewAnalysisForm;
