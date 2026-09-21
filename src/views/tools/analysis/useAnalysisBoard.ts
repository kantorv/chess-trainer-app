import { useCallback, useMemo, useState } from "react";
import { DEFAULT_POSITION } from "chess.js";

import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../../lib/analysisSettings";
import {
  emptyTree,
  findNode,
  pathTo,
  sanPathTo,
  type GameTree,
} from "../../../lib/gameTree";
import { parseFen } from "../../../lib/fen";
import { nodeAtParam } from "../../../lib/repertoireLink";
import { extensionIdsOf, nodeIdsOf } from "../../../lib/repertoireTrainer";
import {
  newSavedAnalysisId,
  savedAnalysisNode,
  savedAnalysisOf,
  savedAnalysisToTree,
  type SavedAnalysis,
} from "../../../lib/savedAnalyses";
import {
  findSavedAnalysis,
  saveAnalysis,
  type SavedAnalysisProblem,
} from "../../../lib/savedAnalysisStore";
import { turnOf, useBoardCore } from "../../dev/core/useBoardCore";
import { useEngineModule } from "../../dev/core/useEngineModule";

/**
 * **The Analysis Board's session** (CTA-73) — the v2 core
 * ([`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md))
 * composed for analysis, plus the one thing that is this screen's own: the
 * **saved record** the session is attached to, and what the reader does with
 * its changes.
 *
 * ```
 * useBoardCore      — the tree, the node, the oracle, promotion, orientation
 * useEngineModule   — searching the position on screen, per-FEN evals … and NO reply
 * (this hook)       — the record, the baseline, Save / Update / Save as copy / Discard
 * ```
 *
 * **An analysis board never moves a piece by itself**: it passes no
 * `onBestMove`, so the branch that plays one does not exist for it.
 *
 * ## Explicit save, against a baseline
 *
 * Nothing is written unasked — the board used to write itself on every move
 * and no longer does. The session holds a **baseline**: the tree as it
 * arrived, was loaded, or was last saved. "Changed" is `tree !== baseline`,
 * the repertoire player's rule: every edit makes a new tree and replaying a
 * move already there does not (`addMove`), so it holds for moves added and
 * for every menu edit with nothing to keep in step. With a **record** (an
 * `?analysis=` arrival, or once saved) a change is kept by **Update** (the
 * record takes the tree, the place in it and the engine settings),
 * **Save as copy** (a new record, the session moves to it) or **Discard**
 * (back to the baseline). Without one — a blank board, a `?fen=` or `?game=`
 * arrival, a PGN just loaded — **Save** names it and files it.
 *
 * The moves added since the baseline are the explorer's extensions — tinted in
 * the list and ringed on the map (`extensionIdsOf`, recomputed, never tracked).
 *
 * **A record's settings are the settings screen's** — its name, description,
 * side (`orientation`), arrows and folder. Update keeps the stored ones: a
 * flip or an arrows switch on the board is the session's. A new board's first
 * save takes the side it faces and the arrows switch as it is; a copy takes
 * the original's.
 */

export type AnalysisBoardStart = {
  /** A position to open on — the `?fen=` hand-off. Turns the board. */
  fen?: string;
  /** A whole game to open on — a `?game=` arrival. Does not turn the board. */
  tree?: GameTree;
  /** The mainline ply an arriving game opens at — `?move=`, or its `StartPly`. */
  ply?: number;
  /** A saved analysis to go on working on — `?analysis=`. Beats the other two. */
  resume?: SavedAnalysis;
  /** A permanent link's position, SAN from the start — `?at=`. Beats `ply` and the record's own place. */
  at?: string | null;
};

/** A tree that is nothing yet — the standard start, no moves. */
export const isBlankTree = (tree: GameTree): boolean =>
  tree.moves.length === 0 && tree.startFen === DEFAULT_POSITION;

export const useAnalysisBoard = ({
  fen,
  tree: arrivedTree,
  ply,
  resume,
  at,
}: AnalysisBoardStart = {}) => {
  /*
    What the board opens on, built once: a reopened record (parsed, and its
    place in it), else a game, else a position, else the standard start. Built
    here rather than by the core so the baseline is the very tree the core
    holds — `tree !== baseline` would otherwise be true from the first render.
    A record that will not parse opens as nothing, like an unreadable `?fen=`.
  */
  const [start] = useState(() => {
    const reopened = resume === undefined ? undefined : savedAnalysisToTree(resume);
    const tree =
      reopened ?? arrivedTree ?? (fen === undefined ? emptyTree() : emptyTree(fen));
    const linked = at === undefined || at === null ? null : nodeAtParam(tree, at);
    const nodeId =
      linked ??
      (reopened !== undefined && resume !== undefined
        ? savedAnalysisNode(resume, reopened)
        : undefined);
    // A position turns the board; a game does not; a record keeps its own.
    const orientation: "white" | "black" =
      reopened !== undefined && resume !== undefined
        ? resume.orientation
        : arrivedTree === undefined && fen !== undefined && turnOf(fen) === "b"
          ? "black"
          : "white";
    return {
      tree,
      nodeId: nodeId ?? undefined,
      // `?move=` is a mainline ply of a game; a record or a link beats it.
      ply: reopened === undefined && linked === null && arrivedTree !== undefined ? ply : undefined,
      orientation,
      record: reopened === undefined ? null : (resume ?? null),
    };
  });

  const core = useBoardCore({
    tree: start.tree,
    ply: start.ply,
    nodeId: start.nodeId,
    orientation: start.orientation,
  });
  const { loadTree, goToNode, setOrientation } = core;

  const [record, setRecord] = useState<SavedAnalysis | null>(start.record);
  const [baseline, setBaseline] = useState<GameTree>(start.tree);
  /** A tree the reader loaded (Load tab, Clear) and has not saved yet. */
  const [loadedUnsaved, setLoadedUnsaved] = useState(false);
  const [problem, setProblem] = useState<SavedAnalysisProblem | null>(null);

  const changed = core.tree !== baseline;
  /** Whether leaving now would lose something — what `beforeunload` asks about. */
  const unsaved = changed || (loadedUnsaved && !isBlankTree(core.tree));
  /** Whether there is anything Save could write. */
  const canSave = changed || (record === null && !isBlankTree(core.tree));

  const baselineIds = useMemo(() => nodeIdsOf(baseline), [baseline]);
  const extensionIds = useMemo(
    () => extensionIdsOf(core.tree, baselineIds),
    [core.tree, baselineIds],
  );

  /* The engine — on by default, as the Analysis Board always was. */
  const [settings, setSettings] = useState<AnalysisSettings>(
    () => record?.settings ?? DEFAULT_ANALYSIS_SETTINGS,
  );
  const [engineOn, setEngineOn] = useState(true);
  const [showEvalBar, setShowEvalBar] = useState(true);
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
    // No `onBestMove`: this board never moves a piece.
  });
  const { clearAnalysis } = engine;

  const updateSettings = useCallback(
    (patch: Partial<AnalysisSettings>) =>
      setSettings((current) => ({ ...current, ...patch })),
    [],
  );

  /** The record the session would write under `id` — the tree, where the reader is, how it faces. */
  const recordOf = (id: string, savedAt?: string): SavedAnalysis => {
    const now = new Date();
    return savedAnalysisOf(
      id,
      core.tree,
      sanPathTo(core.tree, core.nodeId),
      settings,
      core.orientation,
      now,
      savedAt ?? now.toISOString(),
    );
  };

  /** A record's settings as stored — what Update and Save as copy keep. */
  const storedSettings = () => {
    const stored = record === null ? null : (findSavedAnalysis(record.id) ?? record);
    return stored === null
      ? null
      : {
          name: stored.name,
          folderId: stored.folderId,
          orientation: stored.orientation,
          description: stored.description,
          showArrows: stored.showArrows,
        };
  };

  /** The session is the record now: its tree the baseline. */
  const settle = (saved: SavedAnalysis) => {
    setRecord(saved);
    setBaseline(core.tree);
    setLoadedUnsaved(false);
    setProblem(null);
  };

  /**
   * A board with no record yet, saved: named, filed, facing the way the board
   * faces and drawing arrows as the board does. `undefined` on failure.
   */
  const saveNew = (
    name: string,
    folderId: string | null,
    showArrows: boolean,
  ): SavedAnalysis | undefined =>
    write({ ...recordOf(newSavedAnalysisId()), name: name.trim(), folderId, showArrows });

  const write = (saved: SavedAnalysis): SavedAnalysis | undefined => {
    const failed = saveAnalysis(saved);
    if (failed !== undefined) {
      setProblem(failed);
      return undefined;
    }
    settle(saved);
    return saved;
  };

  /**
   * **Update**: the record takes the session's tree, place in it and engine
   * settings. Its own settings are the stored ones — edited on its settings
   * screen or filed on the saved list since it was opened, that stands.
   */
  const update = (): SavedAnalysis | undefined => {
    const stored = storedSettings();
    if (record === null || stored === null) return undefined;
    const savedAt = (findSavedAnalysis(record.id) ?? record).savedAt;
    return write({ ...recordOf(record.id, savedAt), ...stored });
  };

  /**
   * **Save as copy**: a new record with the original's settings and folder;
   * the session goes on in it.
   */
  const saveCopy = (name: string): SavedAnalysis | undefined => {
    const stored = storedSettings();
    if (stored === null) return undefined;
    return write({ ...recordOf(newSavedAnalysisId()), ...stored, name: name.trim() });
  };

  /** **Discard**: back to the baseline, on the last of its positions on the way here. */
  const discard = () => {
    const path = pathTo(core.tree, core.nodeId);
    let back: string | null = null;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (findNode(baseline, path[index].id) !== null) {
        back = path[index].id;
        break;
      }
    }
    loadTree(baseline);
    if (back !== null) goToNode(back);
    setProblem(null);
  };

  /**
   * A new game on the board — a PGN loaded, a merge, the Clear button: a new
   * analysis, not yet saved. The record the session was on is left as it was.
   */
  const loadNew = useCallback(
    (next: GameTree) => {
      loadTree(next);
      clearAnalysis();
      setRecord(null);
      setBaseline(next);
      setLoadedUnsaved(true);
      setProblem(null);
    },
    [clearAnalysis, loadTree],
  );

  /** A pasted FEN: a new analysis of that position, facing the side to move. Throws `FenParseError`. */
  const loadFen = useCallback(
    (text: string) => {
      const parsed = parseFen(text);
      loadNew(emptyTree(parsed));
      setOrientation(turnOf(parsed) === "b" ? "black" : "white");
    },
    [loadNew, setOrientation],
  );

  const clearBoard = useCallback(() => loadNew(emptyTree()), [loadNew]);

  return {
    core,
    engine,
    settings,
    updateSettings,
    engineOn,
    setEngineOn,
    showEvalBar,
    setShowEvalBar,
    record,
    changed,
    unsaved,
    canSave,
    extensionIds,
    problem,
    saveNew,
    update,
    saveCopy,
    discard,
    loadNew,
    loadFen,
    clearBoard,
  };
};

export type AnalysisBoardState = ReturnType<typeof useAnalysisBoard>;
