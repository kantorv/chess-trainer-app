import { useState } from "react";
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

/**
 * **The Load route's state** (CTA-73) — the pipeline behind
 * [`AnalysisLoad`](./AnalysisLoad.tsx), on its own so a host can place the
 * pieces itself: the analyses Lobby's form (CTA-96) puts the FEN field and the
 * `.pgn` pick in the editor's row and the paste box below it, where the
 * Analysis Board and the Openings explorer take `AnalysisLoad`'s own
 * arrangement of the same state.
 *
 * A PGN — picked as a file or pasted, one route for both — is read the way a
 * repertoire is (`readRepertoireText`: the uploads' size and emptiness rules,
 * every game parsed as a tree, side lines and comments kept). **One game**
 * goes to `onLoadTree`. **Several** sit in `choice` until merged into one
 * tree (`merge`) or split into one saved analysis each, filed together in a
 * new folder named after the text (`split`, which takes the reader there
 * through `onSplit`). A PGN of a position and no moves loads as that
 * position. A **FEN** is a position: it goes to `onLoadFen`, which throws on
 * one that will not parse — the error line is `fenProblem`.
 *
 * A host that takes positions another way — the analyses Lobby's form, whose
 * editor a position is for (CTA-96) — passes `onLoadPosition`, and a PGN that
 * is really a position (a single game of at most one move) sets that editor
 * up from it instead of putting a one-move tree on the board. The merge of
 * several games is always a merge: the reader chose a tree, side lines and
 * all.
 */
export type AnalysisLoadConfig = {
  /** The engine knobs a split's analyses are saved under — the board's own. */
  settings: AnalysisSettings;
  onLoadTree: (tree: GameTree) => void;
  /**
   * Throws on a FEN that will not parse. Absent, `applyFen` is a no-op — a
   * host whose board a position reaches another way loads games only.
   */
  onLoadFen?: (fen: string) => void;
  /**
   * A single-game PGN that is really a position — at most one move — loads
   * as that position, already parsed and never throwing. Absent, it loads as
   * a tree like any game: a host with no editor of its own has nowhere for a
   * position to go but the board.
   */
  onLoadPosition?: (position: string) => void;
  /**
   * A split was saved into this folder. Absent, a text of several games can
   * only be merged — the Openings explorer keeps nothing (CTA-78).
   */
  onSplit?: (folderId: string) => void;
};

export const useAnalysisLoad = ({
  settings,
  onLoadTree,
  onLoadFen,
  onLoadPosition,
  onSplit,
}: AnalysisLoadConfig) => {
  const { t } = useTranslation();
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

  /** A file picked — its text read and brought in. The input clears itself. */
  const onPicked = async (files: FileList | null) => {
    const file = files?.[0];
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

  /** Apply the FEN form's text through `onLoadFen`; the error line is `fenProblem`. */
  const applyFen = () => {
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

  return {
    /** The paste box's text. */
    pasted,
    setPasted,
    /** The FEN form's text — wherever the host renders that form. */
    fenText,
    setFenText,
    /** The PGN that would not read, as a line already translated. */
    problem,
    /** The FEN that would not parse, as a line already translated. */
    fenProblem,
    /** A game was handed over — a position is its own feedback. */
    loaded,
    choice,
    choiceProblem,
    bringIn,
    onPicked,
    merge,
    split,
    applyFen,
  };
};
