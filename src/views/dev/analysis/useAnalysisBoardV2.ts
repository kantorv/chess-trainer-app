import { useCallback, useMemo, useState } from "react";
import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../../lib/analysisSettings";
import { DEFAULT_POSITION } from "chess.js";
import { emptyTree, sanPathTo, type GameTree } from "../../../lib/gameTree";
import {
  newSavedAnalysisId,
  savedAnalysisNode,
  savedAnalysisOf,
  savedAnalysisToTree,
  type SavedAnalysis,
} from "../../../lib/savedAnalyses";
import { saveDevAnalysis } from "../core/devStores";
import { useAutosave } from "../core/useAutosave";
import { useBoardCore } from "../core/useBoardCore";
import { useEngineModule } from "../core/useEngineModule";

/**
 * **Analysis v2 — the reference derivation.** §4 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md).
 *
 * The whole hook is three compositions and some state that belongs to *this*
 * board and no other. There is no behaviour here: everything the screen does is
 * the base's or a capability's, and what this file says is only **which**.
 *
 * ```
 * useBoardCore      — the tree, the node, the oracle, promotion, orientation
 * useEngineModule   — searching the position on screen, per-FEN evals … and NO reply
 * useAutosave       — the board written down as it is worked on, to the DEV key
 * ```
 *
 * Two things are worth reading twice, because they are the two properties the
 * shipped `useAnalysisBoard` documents at length and this derivation has to
 * keep:
 *
 * **An analysis board never moves a piece by itself.** It passes no
 * `onBestMove`, so the branch that plays one does not exist for it. That is not
 * a flag the engine module checks — the callback is simply absent.
 *
 * **Nothing is written until the reader has done something.** This screen is
 * also where every library game is *read*, so writing on arrival would fill the
 * list with everything anyone ever opened. The gate is the core's `dirty` flag
 * — set when a move actually grew the tree, or when a tree was deliberately
 * loaded — and a reopened analysis starts dirty, because it is already a record
 * and walking around it is worth writing down.
 */

export type AnalysisV2Start = {
  /** The position to open on — the `?fen=` hand-off. */
  fen?: string;
  /** A whole game to open on — a `?game=` arrival. */
  tree?: GameTree;
  /** The mainline ply an arriving game opens at — the `?move=` beside it. */
  ply?: number;
  /** An analysis to go on working on — the dev `?analysis=` hand-off. */
  resume?: SavedAnalysis;
  /** Whether the board is written to the dev analyses store as it is worked on. */
  persist?: boolean;
};

export const useAnalysisBoardV2 = ({
  fen,
  tree,
  ply,
  resume,
  persist = false,
}: AnalysisV2Start = {}) => {
  /*
    A reopened analysis, parsed once. `parsePgnTree` rather than a mainline
    parse, for the reason the `?game=` arrival does it too: the record holds
    side lines and they are the whole point of this screen. A record that will
    not parse reopens as nothing at all — the same answer an unreadable `?fen=`
    gets.
  */
  const reopened = useMemo(() => {
    if (resume === undefined) return undefined;
    const parsed = savedAnalysisToTree(resume);
    return parsed === undefined
      ? undefined
      : { tree: parsed, nodeId: savedAnalysisNode(resume, parsed) };
  }, [resume]);

  const core = useBoardCore({
    // A reopened analysis wins over a whole game, which wins over a bare
    // position — each is more specific than the next about what the reader
    // meant to be looking at.
    fen,
    tree: reopened?.tree ?? tree,
    // A `?move=` means nothing beside a bare `?fen=`: a position has no moves.
    ply: tree === undefined ? undefined : ply,
    nodeId: reopened?.nodeId,
    orientation: resume?.orientation,
    dirty: resume !== undefined,
  });

  const [settings, setSettings] = useState<AnalysisSettings>(() =>
    // A reopened analysis brings its own: the engine goes on searching at the
    // depth and the width it was set to.
    resume === undefined ? DEFAULT_ANALYSIS_SETTINGS : resume.settings,
  );
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(true);

  const onUciOptionsReady = useCallback(
    (clamped: Readonly<Record<string, number>>) =>
      setSettings((current) => {
        const multiPv = clamped[ANALYSIS_UCI_OPTION.multiPv] ?? current.multiPv;
        // A new object here would re-run the search effect for nothing.
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
    // No `onBestMove`: see the header note.
  });

  /*
    The row this analysis is written to. Minted at call time rather than during
    render — the rule the engine ref follows — and seeded from a reopened
    analysis, so going on working updates that row instead of starting a second
    one beside it.
  */
  const [savedId, setSavedId] = useState<string | null>(resume?.id ?? null);
  const nextSavedId = savedId ?? newSavedAnalysisId();

  /*
    What `useAutosave` writes, or `undefined` while there is nothing worth
    writing: an untouched board at the standard start is not an analysis yet, so
    merely visiting this screen writes no row.
  */
  const record = useMemo(() => {
    if (!core.dirty) return undefined;
    if (core.tree.moves.length === 0 && core.tree.startFen === DEFAULT_POSITION) {
      return undefined;
    }
    return savedAnalysisOf(
      nextSavedId,
      core.tree,
      sanPathTo(core.tree, core.nodeId),
      settings,
      core.orientation,
    );
  }, [
    core.dirty,
    core.tree,
    core.nodeId,
    core.orientation,
    nextSavedId,
    settings,
  ]);

  const save = useCallback((analysis: SavedAnalysis) => {
    // Remembering the id is what makes "save on every move" one growing row
    // rather than a new one per move.
    setSavedId(analysis.id);
    saveDevAnalysis(analysis);
  }, []);

  useAutosave({ enabled: persist, record, save });

  /** Replace the whole game, and start a new record for it. */
  const loadTree = useCallback(
    (next: GameTree) => {
      core.loadTree(next);
      engine.clearAnalysis();
      /*
        A new board is a new record. The one being left keeps the id it was
        saved under, so it stays in the list rather than being overwritten by
        whatever is worked on next — the whole difference between a saved
        analysis and an autosave slot.
      */
      setSavedId(null);
    },
    [core, engine],
  );

  const loadFen = useCallback(
    (text: string) => {
      core.loadFen(text);
      engine.clearAnalysis();
      setSavedId(null);
    },
    [core, engine],
  );

  const clearBoard = useCallback(() => {
    core.loadTree(emptyTree());
    engine.clearAnalysis();
    setSavedId(null);
  }, [core, engine]);

  const updateSettings = useCallback(
    (patch: Partial<AnalysisSettings>) =>
      setSettings((current) => ({ ...current, ...patch })),
    [],
  );

  return {
    ...core,
    ...engine,
    settings,
    updateSettings,
    engineOn,
    setEngineOn,
    showEvalBar,
    setShowEvalBar,
    loadTree,
    loadFen,
    clearBoard,
  };
};

export type AnalysisV2State = ReturnType<typeof useAnalysisBoardV2>;
