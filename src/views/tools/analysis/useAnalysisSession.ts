import { useCallback, useMemo, useState } from "react";

import {
  ANALYSIS_UCI_OPTION,
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
} from "../../../lib/analysisSettings";
import { findNode, pathTo, type GameTree } from "../../../lib/gameTree";
import { extensionIdsOf, nodeIdsOf } from "../../../lib/repertoireTrainer";
import { useBoardCore } from "../../board/core/useBoardCore";
import { useEngineModule } from "../../board/core/useEngineModule";
import { usePlayToggle } from "../../board/core/usePlayToggle";

/**
 * **An analysis session against a baseline** — the part of the Analysis
 * Board every board that analyses a tree shares (the Analysis Board, CTA-73;
 * a Library game, CTA-75): the v2 core, the engine (on, searching the
 * position on screen), **Play** (`usePlayToggle`, off at the start: the engine
 * plays the side not at the bottom only while it is on), and a **baseline**
 * — the tree as it arrived or was last kept — with what follows from it:
 *
 * - `changed` is `core.tree !== baseline`, the repertoire player's rule —
 *   every edit makes a new tree, replaying a move already there does not;
 * - `extensionIds` are the moves added since, tinted in the list and ringed
 *   on the map (recomputed, never tracked);
 * - `discard` goes back to the baseline, on the last of its positions on the
 *   way to where the reader stands; `rebase` makes a kept tree the baseline.
 *
 * What is **kept**, and where, is the screen's: a saved analysis
 * (`useAnalysisBoard`), or a Library collection's game. Composed from the
 * core's modules ([`chessboard.md`](../../../../.claude/rules/chessboard.md) §9)
 * — nothing here that a module owns.
 */

export type AnalysisSessionStart = {
  /** The tree the board opens on — also the first baseline. */
  tree: GameTree;
  /** A mainline ply to open at (`?move=`, a `StartPly`). */
  ply?: number;
  /** A node to open on — a record's place, a permanent link. Beats `ply`. */
  nodeId?: string;
  orientation?: "white" | "black";
  /** The engine settings a record was worked under. */
  settings?: AnalysisSettings;
};

export const useAnalysisSession = ({
  tree,
  ply,
  nodeId,
  orientation,
  settings: initialSettings,
}: AnalysisSessionStart) => {
  const core = useBoardCore({ tree, ply, nodeId, orientation });
  const { loadTree, goToNode } = core;

  const [baseline, setBaseline] = useState<GameTree>(tree);
  const changed = core.tree !== baseline;
  const baselineIds = useMemo(() => nodeIdsOf(baseline), [baseline]);
  const extensionIds = useMemo(
    () => extensionIdsOf(core.tree, baselineIds),
    [core.tree, baselineIds],
  );

  /* The engine — on by default, as the Analysis Board always was. */
  const [settings, setSettings] = useState<AnalysisSettings>(
    () => initialSettings ?? DEFAULT_ANALYSIS_SETTINGS,
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
  /*
    Play (CTA-73): the engine plays its best move for the opponent's side,
    search after search, until paused — the shared toggle, off at the start.
  */
  const play = usePlayToggle({ core, engineOn });
  const { playing, thinking } = play;

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
    onBestMove: play.onBestMove,
  });

  /** Play on or off — see `usePlayToggle`. */
  const togglePlaying = () => play.toggle(engine.analysis, engine.evalsByFen);

  const updateSettings = useCallback(
    (patch: Partial<AnalysisSettings>) =>
      setSettings((current) => ({ ...current, ...patch })),
    [],
  );

  /** The tree kept: it is the baseline now, and the additions stop being additions. */
  const rebase = useCallback((kept: GameTree) => setBaseline(kept), []);

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
  };

  return {
    core,
    engine,
    settings,
    updateSettings,
    engineOn,
    setEngineOn,
    playing,
    thinking,
    togglePlaying,
    showEvalBar,
    setShowEvalBar,
    baseline,
    changed,
    extensionIds,
    rebase,
    discard,
  };
};
