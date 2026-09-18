import { useCallback, useEffect, useState } from "react";
import { pathTo, type GameTree } from "../../../lib/gameTree";
import type { Turn } from "../../../lib/engineAnalysis";
import {
  pickTrainerMove,
  repertoireMovesAt,
  type TrainerPolicy,
} from "../../../lib/repertoireTrainer";
import { turnOf, type BoardCore } from "./useBoardCore";

/**
 * **The trainer** — a capability module (§2 of
 * [`.claude/rules/chessboard-v2.md`](../../../../.claude/rules/chessboard-v2.md)),
 * the sibling of `useEngineModule` and `useOpeningBookModule` (CTA-63).
 *
 * A scripted opponent that answers **only from a repertoire**: when the reader
 * has just moved and it is the trainer's turn at the node on screen, it plays
 * one of the repertoire's moves there, picked by a {@link TrainerPolicy}
 * (`lib/repertoireTrainer.ts` — the choosing is pure and lives there). Where
 * the repertoire has nothing, it plays nothing.
 *
 * ## It moves through the core, under the node on screen
 *
 * The reply goes through the core's `playVariation` — `addMove` under the node
 * the reader is standing on, so a move the repertoire has is *followed*, not
 * duplicated. Not `appendMove`, which is Play v2's engine reply and goes to the
 * end of the mainline: a repertoire is drilled line by line, anywhere in it.
 * The module never touches `chess.js`; only the core calls `.move()`.
 *
 * ## It replies to a move, never to a position
 *
 * The rule the whole module exists to keep: **the trainer answers when the
 * reader has just moved at the node on screen**, never merely because the
 * node on screen is one where it is the trainer's turn. Stepping back with the
 * board controls lands on such nodes all the time, and a reply there would
 * move a piece behind the reader's back.
 *
 * So a reply is *owed* at one node, and only two things owe one:
 *
 * - **a reader's move** — the module hands the screen wrapped `onPieceDrop` /
 *   `resolvePromotion`, which note the node the move was made from; the first
 *   render that stands on a child of it is where the reply is owed;
 * - **{@link TrainerModule.requestReply}** — the screen's own "the session
 *   starts here", which is how the trainer moves first when the reader is Black.
 *
 * Navigating anywhere else drops what is owed, in the same render — so coming
 * back to that node later owes nothing. The reply itself waits `delayMs` on a
 * timer that navigation, a new move and unmounting all clear.
 *
 * ## Designed to be extended, not forked
 *
 * A drill mode (a deviation counted as a mistake, taken back, scored) is a new
 * **option** here — an `onDeviation` callback the wrapped drop calls when the
 * reader's move is not one the repertoire has — not a second module. A
 * weighted or spaced-repetition trainer is a new `policy`. Neither touches the
 * core.
 */

/** What the panel says about the trainer, for the position on screen. */
export type TrainerStatus = "trainer-thinking" | "your-move" | "out-of-book";

export type TrainerModuleStart = {
  /** Off while there is nothing to drill yet — the tree still being read. */
  enabled: boolean;
  /** The pieces of the base this module reads and moves through. */
  core: Pick<
    BoardCore,
    "nodeId" | "fen" | "tree" | "onPieceDrop" | "resolvePromotion" | "playVariation"
  >;
  /**
   * The repertoire **as it arrived** — what the trainer answers from. Not the
   * session's tree: a move the reader added is never one the trainer plays.
   */
  repertoire: GameTree;
  /** The side the trainer plays. */
  trainerColor: Turn;
  /** Which move it plays — {@link pickTrainerMove} unless a screen says otherwise. */
  policy?: TrainerPolicy;
  /** The policy's random source. Stable identity, or the reply timer restarts. */
  random?: () => number;
  /** How long the trainer "thinks" before it moves, in milliseconds. */
  delayMs?: number;
};

/** A reply owed at a node — `null` is the start position. */
type Owed = { at: string | null };

export const useTrainerModule = ({
  enabled,
  core,
  repertoire,
  trainerColor,
  policy = pickTrainerMove,
  random = Math.random,
  delayMs = 400,
}: TrainerModuleStart) => {
  const { nodeId, fen, tree, onPieceDrop, resolvePromotion, playVariation } = core;

  /** The node a reader's move was just made from — until the move lands. */
  const [movedFrom, setMovedFrom] = useState<Owed | null>(null);
  /** Where the trainer owes a reply. */
  const [owed, setOwed] = useState<Owed | null>(null);

  /*
    Both adjusted during render against the node on screen, rather than in an
    effect (`react-hooks/set-state-in-effect`), the way `Sidebar.tsx` follows
    the route: the render that first stands on the new node is the one that
    decides, so there is no frame in which a stale "owed" can be acted on.
  */
  if (movedFrom !== null && movedFrom.at !== nodeId) {
    // The reader's move landed on a child of the node it was made from. Any
    // other change of node is navigation, with a promotion picker still open.
    const landed = nodeId !== null && parentIdOf(tree, nodeId) === movedFrom.at;
    setMovedFrom(null);
    setOwed(landed ? { at: nodeId } : null);
  } else if (owed !== null && owed.at !== nodeId) {
    // Navigated away: what was owed there is dropped, not kept for later.
    setOwed(null);
  }

  const trainerTurn = turnOf(fen) === trainerColor;
  const bookMoves = repertoireMovesAt(repertoire, nodeId).length;
  const replying =
    enabled && owed !== null && owed.at === nodeId && trainerTurn && bookMoves > 0;

  useEffect(() => {
    if (!replying) return;
    const timer = setTimeout(() => {
      setOwed(null);
      const move = policy(repertoire, nodeId, random);
      if (move !== undefined) playVariation([move.san]);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [replying, delayMs, nodeId, playVariation, policy, random, repertoire]);

  /** The reader's drop: noted, then handed to the core unchanged. */
  const onReaderDrop = useCallback(
    (args: Parameters<BoardCore["onPieceDrop"]>[0]) => {
      const accepted = onPieceDrop(args);
      if (accepted) setMovedFrom({ at: nodeId });
      return accepted;
    },
    [nodeId, onPieceDrop],
  );

  /** The picker's answer: a dismissed promotion is no move at all. */
  const onReaderPromotion = useCallback(
    (piece: Parameters<BoardCore["resolvePromotion"]>[0]) => {
      if (piece === null) setMovedFrom(null);
      resolvePromotion(piece);
    },
    [resolvePromotion],
  );

  /** "The session starts here": owe a reply at `at`, the node about to be on screen. */
  const requestReply = useCallback((at: string | null) => {
    setMovedFrom(null);
    setOwed({ at });
  }, []);

  const status: TrainerStatus = replying
    ? "trainer-thinking"
    : bookMoves === 0
      ? "out-of-book"
      : "your-move";

  return {
    status,
    /** Hand these to the board in place of the core's own. */
    onPieceDrop: onReaderDrop,
    resolvePromotion: onReaderPromotion,
    requestReply,
  };
};

/** The id of the move `nodeId` answers — `null` for a first move. */
const parentIdOf = (tree: GameTree, nodeId: string): string | null => {
  // `pathTo` reads the per-tree index; the parent is the next-to-last step.
  const path = pathTo(tree, nodeId);
  return path.length >= 2 ? path[path.length - 2].id : null;
};

export type TrainerModule = ReturnType<typeof useTrainerModule>;
