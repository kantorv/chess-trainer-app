import { useCallback, useState } from "react";
import { Chess } from "chess.js";

import type { Analysis, Score } from "../../../lib/engineAnalysis";
import { pathTo } from "../../../lib/gameTree";
import { isTerminal, turnOf, type BoardCore } from "./useBoardCore";

/**
 * **Play — the engine playing the opponent's side** (CTA-73, shared since
 * CTA-74). The Analysis Board's header toggle, lifted out so Play with Engine
 * runs the same copy rather than a second one.
 *
 * The reader plays the side at the bottom of the board (`orientation`), the
 * engine the other. While `playing` is on — and the engine is — a finished
 * search of the position on screen ({@link onBestMove}, handed to
 * `useEngineModule`) is played there, under the node on screen, when it is the
 * engine's side to move; on the reader's turn nothing moves.
 *
 * **It pauses itself** on anything that is not the game going on:
 *
 * - a step that is not one move forward — back, Home, a click on an earlier
 *   move, ↑ / ↓ to another line, a load: the reader has gone to look or to try
 *   something, and goes on by hand until pressing Play again. A move played
 *   (the reader's or the engine's) is a step to a child of the node that was on
 *   screen, and keeps it on;
 * - a **change of side** (the board flipped): the engine's side has changed
 *   under it, and nothing would search the position again to answer it;
 * - the engine switched off, or the position over.
 *
 * Each is adjusted during render against what was last seen, not in an effect
 * (`react-hooks/set-state-in-effect`).
 *
 * Pressing Play at the engine's turn with a search of that position already
 * finished plays its first move at once ({@link toggle}), rather than waiting
 * for a search that has already ended.
 */
export const usePlayToggle = ({
  core,
  engineOn,
  initial = false,
}: {
  core: BoardCore;
  engineOn: boolean;
  /** Whether Play starts on — the Analysis Board's is off, Play with Engine's on. */
  initial?: boolean;
}) => {
  const [playing, setPlaying] = useState(initial);
  if (playing && (!engineOn || isTerminal(core.fen))) setPlaying(false);

  /** The engine's side: the one not at the bottom of the board. */
  const engineTurn = core.orientation === "white" ? "b" : "w";

  /** Whether Play is waiting on the engine — its turn, a search under way. */
  const thinking =
    playing && engineOn && turnOf(core.fen) === engineTurn && !isTerminal(core.fen);

  const [seen, setSeen] = useState({ nodeId: core.nodeId, orientation: core.orientation });
  if (seen.nodeId !== core.nodeId || seen.orientation !== core.orientation) {
    setSeen({ nodeId: core.nodeId, orientation: core.orientation });
    const parentId =
      core.nodeId === null ? undefined : (pathTo(core.tree, core.nodeId).at(-2)?.id ?? null);
    if (playing && (parentId !== seen.nodeId || seen.orientation !== core.orientation)) {
      setPlaying(false);
    }
  }

  const { playVariation } = core;
  const playUci = useCallback(
    (uci: string, fen: string) => {
      let san: string;
      try {
        san = new Chess(fen).move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.slice(4) || undefined,
        }).san;
      } catch {
        return;
      }
      playVariation([san]);
    },
    [playVariation],
  );

  /** For `useEngineModule`: only a search of the position on screen, only while playing, only for the engine's side. */
  const onBestMove = useCallback(
    (bestMove: string, searchedFen: string) => {
      if (!playing || !engineOn || searchedFen !== core.fen) return;
      if (turnOf(searchedFen) !== engineTurn || isTerminal(searchedFen)) return;
      playUci(bestMove, searchedFen);
    },
    [playing, engineOn, core.fen, engineTurn, playUci],
  );

  /**
   * Play on or off. On at the engine's turn, with a finished search of the
   * position on screen already in hand (`analysis` for its line,
   * `evalsByFen` for "finished"), its best move is played at once.
   */
  const toggle = (analysis: Analysis, evalsByFen: ReadonlyMap<string, Score>) => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!engineOn || isTerminal(core.fen)) return;
    setPlaying(true);
    if (turnOf(core.fen) !== engineTurn) return;
    const best = analysis.lines[0]?.san[0];
    if (analysis.fen === core.fen && evalsByFen.has(core.fen) && best) {
      playVariation([best]);
    }
  };

  /**
   * Play on for a game starting over at the start position — New game: the
   * step back to the start is not a pause, so it is marked seen here, in the
   * same batch as the reset that makes it.
   */
  const restart = () => {
    setSeen({ nodeId: null, orientation: core.orientation });
    setPlaying(true);
  };

  return { playing, thinking, engineTurn, onBestMove, toggle, restart };
};

export type PlayToggle = ReturnType<typeof usePlayToggle>;
