import { useCallback, useMemo, useState } from "react";
import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../../lib/analysisSettings";
import { mainline } from "../../../lib/gameTree";
import {
  openingVariationName,
  topLevelOpeningName,
} from "../../../lib/openings";
import {
  newSavedOpeningId,
  savedOpeningOf,
  savedOpeningToTree,
  type SavedOpening,
} from "../../../lib/savedOpenings";
import { saveDevOpening } from "../core/devStores";
import { useBoardCore } from "../core/useBoardCore";
import { useEngineModule } from "../core/useEngineModule";
import { useOpeningBookModule } from "../core/useOpeningBookModule";

/**
 * **Openings v2** — §4 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * ```
 * useBoardCore           — the tree, the node, the oracle, promotion, orientation
 * useOpeningBookModule   — the book's continuations from the position on screen, and their arrows
 * useEngineModule        — searching the position on screen, per-FEN evals … and NO reply
 * (no useAutosave)       — the save is a BUTTON, and that is the screen's semantics
 * ```
 *
 * ## What it keeps, and what it gains
 *
 * It keeps the two things that are its own. The **book continuations** are the
 * point of the screen, listed explorer-style and drawn as arrows. And the
 * **save is button-triggered**: an opening is explored and discarded far more
 * often than it is kept, and a reader who has to delete an autosave is a reader
 * who gives up on saving anything — so this is the one derived board that
 * composes no persistence capability at all, rather than one it disables.
 *
 * What it gains by being derived is everything the shipped screen never got:
 * an engine at all, the per-FEN evals beside the moves (CTA-51), the merged
 * move list (CTA-53), the next-moves bar (CTA-54) and the pinned
 * click-to-play variations (CTA-55).
 *
 * ## The save's defaults
 *
 * Both read the one book lookup of *the position on screen* — the reader is
 * filing what they are looking at, not the line it came from. An unchosen
 * folder files under the opening's **top-level** name (the part of eco.json's
 * `"Opening: Variation"` convention before the first `":"`), so a deep line
 * does not create a folder per variant; an empty note defaults to the
 * **variation** name, or to the top-level name when there is no variation. An
 * off-book position saves Unfiled with whatever note was typed, which is the
 * honest answer either way.
 *
 * The dev screen has no folder store of its own — a dev board files nothing
 * (`core/devStores.ts`) — so the folder default resolves to `null` here and the
 * name it would have used rides in the note.
 */

export type OpeningsV2Start = {
  /** The position to open on — the `?fen=` hand-off every board takes. */
  fen?: string;
  /** An opening to go on exploring — the dev `?openings=` hand-off. */
  resume?: SavedOpening;
};

export const useOpeningsV2 = ({ fen, resume }: OpeningsV2Start = {}) => {
  /*
    A reopened opening, parsed once. Side lines are the one thing an opening
    explorer keeps, so the record is the whole tree. A record that will not
    parse reopens as nothing at all.
  */
  const reopened = useMemo(() => {
    if (resume === undefined) return undefined;
    const tree = savedOpeningToTree(resume);
    return tree === undefined ? undefined : { tree, note: resume.note };
  }, [resume]);

  const core = useBoardCore({
    fen,
    tree: reopened?.tree,
    /*
      A reopened opening starts at the **end of its mainline** — the position
      the reader goes on playing from — rather than at ply 0. There is nothing
      else to restore: an opening carries no place in the tree, because the end
      of the line *is* the place.
    */
    ply: reopened === undefined ? undefined : mainline(reopened.tree).length,
    orientation: resume?.orientation,
  });

  const [settings, setSettings] = useState<AnalysisSettings>(
    DEFAULT_ANALYSIS_SETTINGS,
  );
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(true);

  const book = useOpeningBookModule({ enabled: true, fen: core.fen });

  const onUciOptionsReady = useCallback(
    (clamped: Readonly<Record<string, number>>) =>
      setSettings((current) => {
        const multiPv = clamped[ANALYSIS_UCI_OPTION.multiPv] ?? current.multiPv;
        return multiPv === current.multiPv ? current : { ...current, multiPv };
      }),
    [],
  );

  const engine = useEngineModule({
    enabled: engineOn,
    fen: core.fen,
    depth: settings.depth,
    moveTimeMs: settings.moveTimeMs,
    uciOptions: useMemo(
      () => ({ [ANALYSIS_UCI_OPTION.multiPv]: settings.multiPv }),
      [settings.multiPv],
    ),
    onUciOptionsReady,
    // No `onBestMove`: an explorer never moves a piece by itself either.
  });

  /**
   * Play a specific book continuation — the explorer list's own click. Like a
   * drop it works at any ply, so clicking a book move from an earlier position
   * branches the tree there, which is exactly what comparing two replies is.
   */
  const playMove = useCallback(
    (san: string) => {
      core.playVariation([san]);
    },
    [core],
  );

  /** Whether the position on screen has been kept — what the button reports. */
  const [savedNote, setSavedNote] = useState<string | null>(null);

  /**
   * Keep the position on screen, with the note the reader typed. A brand new
   * record every time: each save is a new position, not an update to the last
   * one, and the store's idempotency is the guard against a double click
   * stacking a duplicate.
   */
  const saveOpening = useCallback(
    (note: string) => {
      const named = book.opening;
      const resolved =
        note === "" && named !== undefined
          ? openingVariationName(named.name) || topLevelOpeningName(named.name)
          : note;

      saveDevOpening(
        savedOpeningOf(
          newSavedOpeningId(),
          core.tree,
          core.orientation,
          resolved,
          // A dev board files nothing: there is no dev folder store.
          null,
        ),
      );
      setSavedNote(resolved);
    },
    [book.opening, core.orientation, core.tree],
  );

  const updateSettings = useCallback(
    (patch: Partial<AnalysisSettings>) =>
      setSettings((current) => ({ ...current, ...patch })),
    [],
  );

  const newGame = useCallback(() => {
    core.reset();
    engine.clearAnalysis();
    setSavedNote(null);
  }, [core, engine]);

  return {
    ...core,
    ...engine,
    ...book,
    settings,
    updateSettings,
    engineOn,
    setEngineOn,
    showEvalBar,
    setShowEvalBar,
    playMove,
    newGame,
    /** The note of a reopened opening, or `undefined` when this is not one. */
    note: reopened?.note,
    /** The note the last save was filed under, or `null` if nothing was saved. */
    savedNote,
    saveOpening,
  };
};

export type OpeningsV2State = ReturnType<typeof useOpeningsV2>;
