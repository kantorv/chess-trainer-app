import { useState } from "react";
import { useTranslation } from "react-i18next";

import { finalFenOf } from "../../../lib/gameModel";
import { mainlineGame, mergeTrees, type GameTree } from "../../../lib/gameTree";
import { parsePgnTree } from "../../../lib/pgn";
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
 * goes to `onLoadTree`. **Several** sit in `choice` — with the text they came
 * in, and the file's name — until the reader merges them into one tree
 * (`merge`) or, where the host saves collections (`onCollectionSaved`, the
 * Analysis module — CTA-101), keeps them as a games collection in the Library
 * (`MultiGameDialog`, which does the saving), or `dismiss`es the choice. A
 * PGN of a position and no moves loads as that position. A **FEN** is a
 * position: it goes to `onLoadFen`, which throws on one that will not parse —
 * the error line is `fenProblem`.
 *
 * A host that takes positions another way — the analyses Lobby's form, whose
 * editor a position is for (CTA-96) — passes `onLoadPosition`, and a PGN that
 * is really a position (a single game of at most one move) sets that editor
 * up from it instead of putting a one-move tree on the board. The merge of
 * several games is always a merge: the reader chose a tree, side lines and
 * all.
 */
export type AnalysisLoadConfig = {
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
   * A text of several games was kept as this new Library collection. Present
   * — the Analysis module (CTA-101) — the choice is the popup's, Merge or Save
   * as games collection, and a merge writes `[%games N]` at its branches.
   * Absent, a text of several games can only be merged, uncounted — the
   * Openings explorer keeps nothing (CTA-78).
   */
  onCollectionSaved?: (collectionId: string) => void;
};

/** A text of several games, waiting for the reader's choice. */
export type MultiGameChoice = {
  reading: Extract<RepertoireReading, { ok: true }>;
  /** The text as it came in — what a collection keeps, game by game. */
  text: string;
  /** The picked file's name without `.pgn`; absent for a paste. */
  fileStem?: string;
};

export const useAnalysisLoad = ({
  onLoadTree,
  onLoadFen,
  onLoadPosition,
  onCollectionSaved,
}: AnalysisLoadConfig) => {
  const { t } = useTranslation();
  const [pasted, setPasted] = useState("");
  const [fenText, setFenText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [fenProblem, setFenProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<MultiGameChoice | null>(null);

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

  /** The one route in, for a file and a paste alike — a file with its name's stem. */
  const bringIn = (text: string, fileStem?: string) => {
    setProblem(null);
    setChoice(null);
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
    setChoice({ reading, text, ...(fileStem !== undefined ? { fileStem } : {}) });
  };

  /** A file picked — its text read and brought in. The input clears itself. */
  const onPicked = async (files: FileList | null) => {
    const file = files?.[0];
    if (file === undefined) return;
    bringIn(await file.text(), file.name.replace(/\.pgn$/i, ""));
  };

  /** Merge the choice's games onto the board — counted where the host keeps collections. */
  const merge = () => {
    if (choice === null || !choice.reading.mergeable) return;
    const { reading } = choice;
    load(
      mergeTrees(
        reading.games.map((game) => game.tree),
        reading.games[0].tree.startFen,
        { ...(reading.name !== undefined ? { Event: reading.name } : {}), Result: "*" },
        { countGames: onCollectionSaved !== undefined },
      ),
    );
  };

  /** The choice put away — the popup cancelled, or its collection kept. */
  const dismiss = () => setChoice(null);

  /** The popup kept the choice as a collection: the host takes the reader there. */
  const collectionSaved = (collectionId: string) => {
    setChoice(null);
    onCollectionSaved?.(collectionId);
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
    /** A text of several games, waiting for the reader's choice. */
    choice,
    bringIn,
    onPicked,
    merge,
    dismiss,
    collectionSaved,
    applyFen,
  };
};
