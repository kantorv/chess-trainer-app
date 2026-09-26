import { useMemo } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { Link as RouterLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { analysisHandOffState } from "../../../../lib/analysisHandOff";
import { parseFen } from "../../../../lib/fen";
import { START_POSITION } from "../../../../lib/positionEditor";
import PositionEditor from "../../../shared/positionEditor/PositionEditor";
import { usePositionEditor } from "../../../shared/positionEditor/usePositionEditor";
import MultiGameDialog from "../MultiGameDialog";
import { useAnalysisLoad } from "../useAnalysisLoad";

/**
 * **The Lobby of analyses' new-analysis form** (CTA-87) — the right-hand
 * panel of `/tools/analysis/saved`, the counterpart of the engine Lobby's
 * `NewGameForm`: the shared position editor over a full-width **Start** that
 * opens the Analysis Board — `/tools/analysis`, the position riding along as
 * `?fen=` whenever the editor holds one other than the standard start. A
 * position turns the board there, so the analysis opens facing its side to
 * move.
 *
 * The form's header carries the editor's resets — **New, Clear, Flip** — so
 * the row under the board is free for the **quick loads**: a FEN field and a
 * `.pgn` pick, side by side (`PositionEditor`'s `controls` slot). Both feed
 * `useAnalysisLoad`, the Load route's one pipeline: a PGN of more than one
 * move (or a merge of several — the popup, `MultiGameDialog`, which can keep
 * them as a Library collection instead, CTA-101) opens the Analysis Board with
 * the tree handed over as location state — a new unsaved analysis, facing
 * White, because a game does not turn the board; a PGN of a single move or none sets the
 * editor up from it instead, exactly as the FEN field does — a position is
 * the editor's and Start's job. The paste box below the editor is the same
 * pipeline's other door. So this form's editor offers no tabs
 * (`forms={["position"]}`; the fields are always shown) and renders
 * `AnalysisLoad` not at all — its pieces are placed by hand over the hook.
 *
 * Start is **off**, saying why, while the editor's position cannot be
 * analyzed, exactly as the engine Lobby's Start is off while one cannot be
 * played from.
 */

/** The widest the editor's board grows in the panel — a small board, beside the list. */
const EDITOR_BOARD_MAX_PX = 360;

function NewAnalysisForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  /*
    The Load route's pipeline, on its own: the editor's row renders its FEN
    field and its `.pgn` pick, the section below the paste box, and both are
    the same route in. A FEN throws to its own error line (`fenProblem`); a
    position PGN arrives already parsed (`onLoadPosition`).
  */
  const load = useAnalysisLoad({
    onLoadTree: (tree) =>
      navigate("/tools/analysis", { state: analysisHandOffState(tree, "white") }),
    onLoadFen: (fen) => editor.loadFen(fen),
    onLoadPosition: (position) => editor.loadPosition(position),
    onCollectionSaved: (collectionId) =>
      navigate(`/library/${encodeURIComponent(collectionId)}`),
  });

  return (
    <Box
      data-testid="new-analysis-form"
      sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 1.5 }}
    >
      {/* The editor's resets, in the header: the row under the board is the
          quick loads' (the `controls` slot below). */}
      <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, flex: 1 }}>
          {t("savedAnalyses.newAnalysis.title")}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={editor.setStartingPosition}
            data-testid="new-analysis-new"
          >
            {t("savedAnalyses.newAnalysis.new")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={editor.clearBoard}
            data-testid="new-analysis-clear"
          >
            {t("savedAnalyses.newAnalysis.clear")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={editor.flipBoard}
            data-testid="new-analysis-flip"
          >
            {t("savedAnalyses.newAnalysis.flip")}
          </Button>
        </Box>
      </Box>

      {/* The panel's one scrolling region: the aside scrolls nothing itself. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", pr: 0.5 }}>
        {/*
          No tabs here: this form's FEN and PGN ride its own Load route, so
          the editor shows just its fields (`forms={["position"]}` — one form,
          no strip), and its controls row holds the quick loads.
        */}
        <PositionEditor
          editor={editor}
          testId="new-analysis-editor"
          boardMaxWidth={EDITOR_BOARD_MAX_PX}
          forms={["position"]}
          controls={
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {/*
                The quick loads, side by side where the resets were: a FEN
                sets the position up (Enter applies it), a `.pgn` pick is read
                by the same route as the paste box below.
              */}
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
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
                  sx={{ flex: 1 }}
                  slotProps={{
                    htmlInput: { "data-testid": "new-analysis-fen-input", dir: "ltr" },
                  }}
                />
                {/* A label wrapping a hidden input — the file dialog opens only
                    from a real `<input type="file">`. */}
                <Button
                  component="label"
                  size="small"
                  variant="outlined"
                  startIcon={<UploadFileRoundedIcon />}
                  sx={{ flexShrink: 0 }}
                  data-testid="new-analysis-pgn"
                >
                  {t("savedAnalyses.newAnalysis.pgnFile")}
                  <input
                    hidden
                    type="file"
                    accept=".pgn,application/x-chess-pgn,text/plain"
                    data-testid="new-analysis-pgn-input"
                    onChange={(event) => {
                      void load.onPicked(event.target.files);
                      // Cleared at once, so picking the same file again still fires a change.
                      event.target.value = "";
                    }}
                  />
                </Button>
              </Box>
              {load.fenProblem !== null && (
                <Alert severity="error" data-testid="new-analysis-fen-problem">
                  {load.fenProblem}
                </Alert>
              )}
            </Box>
          }
        />
        <Divider sx={{ my: 2 }} />
        {/*
          The Load route's paste box — the `.pgn` pick is up in the editor,
          and the FEN beside it, so this is the one door a paste comes
          through. The choice, the problem and the done line are the
          pipeline's, like everything else in this form.
        */}
        <Box
          data-testid="new-analysis-load"
          sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t("analysis.load.pgnTitle")}
          </Typography>
          <TextField
            multiline
            minRows={4}
            maxRows={10}
            size="small"
            label={t("savedAnalyses.newAnalysis.pasteLabel")}
            value={load.pasted}
            onChange={(event) => load.setPasted(event.target.value)}
            slotProps={{ htmlInput: { "data-testid": "new-analysis-paste", dir: "ltr" } }}
          />
          <Box>
            <Button
              size="small"
              variant="contained"
              disabled={load.pasted.trim() === ""}
              onClick={() => load.bringIn(load.pasted)}
              data-testid="new-analysis-load-text"
            >
              {t("analysis.position.loadText")}
            </Button>
          </Box>
          {load.problem !== null && (
            <Alert severity="error" data-testid="new-analysis-problem">
              {load.problem}
            </Alert>
          )}
          {load.loaded && (
            <Typography
              variant="caption"
              role="status"
              data-testid="new-analysis-done"
              sx={{ color: "success.main" }}
            >
              {t("analysis.load.loaded")}
            </Typography>
          )}
          {load.choice !== null && (
            <MultiGameDialog
              testIdPrefix="new-analysis-choice"
              choice={load.choice}
              onMerge={load.merge}
              onClose={load.dismiss}
              onSaved={load.collectionSaved}
            />
          )}
        </Box>
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
