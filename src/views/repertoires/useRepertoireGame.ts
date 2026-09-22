import { useCallback, useMemo, useState } from "react";
import type { Turn } from "../../lib/engineAnalysis";
import type { GameTree, VariationNode } from "../../lib/gameTree";
import { marksFrom } from "../../lib/playChance";
import {
  backtrackingPolicy,
  backtrackTarget,
  coverageOf,
  isRepertoireLeaf,
  requiredMovesAt,
  type RepertoireGameId,
} from "../../lib/repertoireGames";
import {
  EMPTY_DRILL_SCORE,
  playChancePolicy,
  withVerdict,
  type DrillScore,
  type DrillVerdict,
  type TrainerPolicy,
} from "../../lib/repertoireTrainer";

/**
 * **A repertoire game's state** (CTA-63) — the score, the lines finished, and
 * for Backtracking the coverage — and what the trainer module is handed from
 * it: the policy, the required moves, the verdict callback. The rules
 * themselves are pure (`lib/repertoireGames.ts`); this hook only keeps the
 * session's state beside them, and knows nothing about the board.
 *
 * With no game (the repertoire's own player) it is inert: the play-chance
 * policy, nothing required, nothing counted.
 *
 * **The policy** (CTA-69): the player and *Get to the end* pick by the
 * lichess-tools play chances (`playChancePolicy`, `lib/playChance.ts`);
 * Backtracking keeps picking by what is still uncovered. The chances are
 * read off the **session's** tree, so a `prc` the reader has just set counts
 * at once. The policy is rebuilt when that tree changes — only on a real
 * edit: following a move the repertoire has hands back the same tree.
 */

const NOTHING_COVERED: ReadonlySet<string> = new Set();

export const useRepertoireGame = ({
  game,
  repertoire,
  session = repertoire,
  nodeId,
  turn,
  trainerColor,
}: {
  game: RepertoireGameId | undefined;
  /** The repertoire as it arrived. */
  repertoire: GameTree;
  /** The session's tree — where the play chances are read (CTA-69). */
  session?: GameTree;
  /** The node on screen, and whose turn it is there. */
  nodeId: string | null;
  turn: Turn;
  trainerColor: Turn;
}) => {
  const [score, setScore] = useState<DrillScore>(EMPTY_DRILL_SCORE);
  const [linesFinished, setLinesFinished] = useState(0);
  const [covered, setCovered] = useState<ReadonlySet<string>>(NOTHING_COVERED);

  const coverage = useMemo(() => coverageOf(repertoire, covered), [repertoire, covered]);

  const policy: TrainerPolicy = useMemo(
    () =>
      game === "backtrack" ? backtrackingPolicy(coverage) : playChancePolicy(marksFrom(session)),
    [game, coverage, session],
  );

  const required: readonly VariationNode[] | undefined = useMemo(
    () =>
      game === "backtrack" && turn !== trainerColor
        ? requiredMovesAt(repertoire, nodeId, coverage)
        : undefined,
    [game, turn, trainerColor, repertoire, nodeId, coverage],
  );

  const onJudged = useCallback(
    (verdict: DrillVerdict) => setScore((current) => withVerdict(current, verdict)),
    [],
  );

  /*
    The arrival last counted as a finished line — by identity, so reaching the
    same end again on a later run counts again, and re-rendering on it does not.
  */
  const [counted, setCounted] = useState<object | null>(null);

  /**
   * Whether the node on screen is the end of a line **just reached by play**
   * (`arrival` is the trainer module's), counting it once. Called during
   * render: it only sets this component's own state, guarded by identity.
   */
  const finishedLine = (arrival: { at: string | null } | null): boolean => {
    if (game === undefined || arrival === null || arrival.at !== nodeId) return false;
    if (!isRepertoireLeaf(repertoire, nodeId)) return false;
    if (counted !== arrival) {
      setCounted(arrival);
      setLinesFinished((count) => count + 1);
      if (nodeId !== null && !covered.has(nodeId)) {
        setCovered((current) => new Set(current).add(nodeId));
      }
    }
    return true;
  };

  /** Backtracking: where play goes back to from the line ending at `leafId`. */
  const backFrom = (leafId: string) => backtrackTarget(repertoire, leafId, coverage);

  return {
    score,
    resetScore: useCallback(() => setScore(EMPTY_DRILL_SCORE), []),
    linesFinished,
    coverage,
    /** Backtracking's "start over": nothing covered. */
    resetCoverage: useCallback(() => setCovered(NOTHING_COVERED), []),
    policy,
    required,
    onJudged,
    finishedLine,
    backFrom,
  };
};
