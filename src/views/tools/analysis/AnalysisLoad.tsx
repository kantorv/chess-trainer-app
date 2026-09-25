import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { useTranslation } from "react-i18next";

import type { AnalysisSettings } from "../../../lib/analysisSettings";
import { finalFenOf } from "../../../lib/gameModel";
import { mainlineGame, mergeTrees, type GameTree } from "../../../lib/gameTree";
import { parsePgnTree } from "../../../lib/pgn";
import { newSavedAnalysisId, splitAnalysesOf } from "../../../lib/savedAnalyses";
import {
  createAnalysisFolder,
  MAX_ANALYSIS_FOLDERS,
  removeAnalysisFolder,
} from "../../../lib/savedAnalysisFolderStore";
import { addAnalyses, MAX_SAVED_ANALYSES } from "../../../lib/savedAnalysisStore";
import {
  normaliseRepertoireText,
  readRepertoireText,
  type RepertoireReading,
} from "../../../lib/savedRepertoires";
import MergeSplitChoice from "../../shared/MergeSplitChoice";

/**
 * **The Load tab** (CTA-73) — a game or a position onto the board, as a new
 * analysis not yet saved.
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
 *
 * A host that takes positions another way — the analyses Lobby's form, whose
 * editor a position is for (CTA-96) — passes `onLoadPosition`, and a PGN that
 * is really a position (a single game of at most one move) sets that editor
 * up from it instead of putting a one-move tree on the board. The merge of
 * several games is always a merge: the reader chose a tree, side lines and
 * all.
 */
function AnalysisLoad({
  settings,
  onLoadTree,
  onLoadFen,
  onLoadPosition,
  onSplit,
  choiceLabelKey = "analysis.load.choice",
  pgnHelpKey = "analysis.load.pgnHelp",
}: {
  /** The engine knobs a split's analyses are saved under — the board's own. */
  settings: AnalysisSettings;
  onLoadTree: (tree: GameTree) => void;
  /**
   * Throws on a FEN that will not parse. Absent, there is no FEN form — a
   * host whose board a position reaches another way (the analyses Lobby's
   * editor and Start, CTA-96) loads games only.
   */
  onLoadFen?: (fen: string) => void;
  /**
   * A single-game PGN that is really a position — at most one move — loads
   * as that position, already parsed and never throwing. Absent, it loads as
   * a tree like any game: a host with no editor of its own (the Analysis
   * Board, the Openings explorer) has nowhere for a position to go but the
   * board.
   */
  onLoadPosition?: (position: string) => void;
  /**
   * A split was saved into this folder. Absent, a text of several games can
   * only be merged — the Openings explorer keeps nothing (CTA-78).
   */
  onSplit?: (folderId: string) => void;
  /** The merge-or-split choice's locale block — a board without a split words it without one. */
  choiceLabelKey?: string;
  /** The PGN form's help line — a host whose PGN route means something else words it itself. */
  pgnHelpKey?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [fenText, setFenText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [fenProblem, setFenProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** A text of several games, waiting for merge or split. */
  const [choice, setChoice] = useState<Extract<RepertoireReading, { ok: true }> | null>(
    null,
  );
  const [choiceProblem, setChoiceProblem] = useState<string | null>(null);

  const load = (tree: GameTree) => {
    onLoadTree(tree);
    setLoaded(true);
    setChoice(null);
  };

  /**
   * One game off the text — a whole game, unless it is really a position (at
   * most one move) and the host takes positions. Then it is that position, and
   * the host's own board saying so is the whole of the feedback, so no
   * "loaded" line here.
   */
  const singleGame = (tree: GameTree) => {
    if (onLoadPosition === undefined) return load(tree);
    const game = mainlineGame(tree);
    if (game.moves.length > 1) return load(tree);
    onLoadPosition(finalFenOf(game));
  };

  /** The one route in, for a file and a paste alike. */
  const bringIn = (text: string) => {
    setProblem(null);
    setChoice(null);
    setChoiceProblem(null);
    setLoaded(false);
    const reading = readRepertoireText(text);
    if (!reading.ok) {
      // A PGN of a position alone has no moves, which a repertoire refuses and
      // an analysis does not.
      if (reading.problem === "unreadable") {
        try {
          return singleGame(parsePgnTree(normaliseRepertoireText(text)));
        } catch {
          // The reading's own problem stands.
        }
      }
      setProblem(
        [t(`analysis.load.problem.${reading.problem}`), reading.detail]
          .filter(Boolean)
          .join(" "),
      );
      return;
    }
    if (reading.games.length === 1) return singleGame(reading.games[0].tree);
    setChoice(reading);
  };

  const onPicked = async (files: FileList | null) => {
    const file = files?.[0];
    // Cleared at once, so picking the same file again still fires a change.
    if (inputRef.current !== null) inputRef.current.value = "";
    if (file === undefined) return;
    bringIn(await file.text());
  };

  const merge = () => {
    if (choice === null || !choice.mergeable) return;
    load(
      mergeTrees(
        choice.games.map((game) => game.tree),
        choice.games[0].tree.startFen,
        { ...(choice.name !== undefined ? { Event: choice.name } : {}), Result: "*" },
      ),
    );
  };

  /*
    The folder is made first, because the records name it; if the records then
    cannot be written, it is taken back out rather than left empty.
  */
  const split = async () => {
    if (choice === null || onSplit === undefined) return;
    const folder = await createAnalysisFolder(choice.name ?? t("analysis.load.splitFolder"), null);
    if (folder === undefined) {
      setChoiceProblem(t("analysis.load.problem.folder", { max: MAX_ANALYSIS_FOLDERS }));
      return;
    }
    const failed = await addAnalyses(
      splitAnalysesOf(newSavedAnalysisId, choice.games, folder.id, settings),
    );
    if (failed !== undefined) {
      await removeAnalysisFolder(folder.id);
      setChoiceProblem(
        failed === "too-many"
          ? t("analysis.load.problem.tooMany", { max: MAX_SAVED_ANALYSES })
          : t("analysis.load.problem.storage"),
      );
      return;
    }
    onSplit(folder.id);
  };

  const setPosition = () => {
    if (onLoadFen === undefined) return;
    try {
      onLoadFen(fenText);
      setFenProblem(null);
      setFenText("");
    } catch (cause) {
      setFenProblem(
        t("analysis.position.errors.fen", {
          detail: cause instanceof Error ? cause.message : String(cause),
        }),
      );
    }
  };

  return (
    <Box
      data-testid="analysis-load"
      sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 1 }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {t("analysis.load.pgnTitle")}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", mt: -1 }}>
        {t(pgnHelpKey)}
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
            onChange={(event) => void onPicked(event.target.files)}
          />
        </Button>
      </Box>
      <TextField
        multiline
        minRows={4}
        maxRows={10}
        size="small"
        label={t("analysis.position.pasteLabel")}
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        slotProps={{ htmlInput: { "data-testid": "analysis-load-paste", dir: "ltr" } }}
      />
      <Box>
        <Button
          size="small"
          variant="contained"
          disabled={pasted.trim() === ""}
          onClick={() => bringIn(pasted)}
          data-testid="analysis-load-text"
        >
          {t("analysis.position.loadText")}
        </Button>
      </Box>
      {problem !== null && (
        <Alert severity="error" data-testid="analysis-load-problem">
          {problem}
        </Alert>
      )}
      {loaded && (
        <Typography
          variant="caption"
          role="status"
          data-testid="analysis-load-done"
          sx={{ color: "success.main" }}
        >
          {t("analysis.load.loaded")}
        </Typography>
      )}
      {choice !== null && (
        <MergeSplitChoice
          labelKey={choiceLabelKey}
          testIdPrefix="analysis-choice"
          count={choice.games.length}
          skipped={choice.skipped}
          mergeable={choice.mergeable}
          onMerge={merge}
          onSplit={onSplit === undefined ? undefined : () => void split()}
          problem={choiceProblem}
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
            value={fenText}
            onChange={(event) => setFenText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setPosition();
              }
            }}
            slotProps={{ htmlInput: { "data-testid": "analysis-load-fen-input", dir: "ltr" } }}
          />
          <Box>
            <Button
              size="small"
              variant="outlined"
              disabled={fenText.trim() === ""}
              onClick={setPosition}
              data-testid="analysis-load-fen"
            >
              {t("analysis.position.loadFen")}
            </Button>
          </Box>
          {fenProblem !== null && (
            <Alert severity="error" data-testid="analysis-load-fen-problem">
              {fenProblem}
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}

export default AnalysisLoad;
