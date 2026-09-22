import { useCallback, useEffect, useRef, useState } from "react";
import { pathTo, type GameTree, type VariationNode } from "../../../lib/gameTree";
import type { Turn } from "../../../lib/engineAnalysis";
import {
  judgeDrop,
  pickTrainerMove,
  repertoireMovesAt,
  type DrillVerdict,
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
 * duplicated: a repertoire is drilled line by line, anywhere in it.
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
 * ## Game mode — the same module, one option more
 *
 * With `drill` on, the wrapped drop **judges** a reader's move before the core
 * sees it (`judgeDrop`, `lib/repertoireTrainer.ts`) — only at the reader's own
 * turn, and only where the repertoire has a move:
 *
 * - one of the repertoire's moves is a **success**, and goes on to the core
 *   (a promotion waits for the picker, and the piece chosen is judged too);
 * - any other legal move is a **failure**, and is **taken back**: the drop is
 *   refused, so the piece snaps back, nothing enters the tree, and the status
 *   says "try again" until the reader gets it right or moves elsewhere;
 * - an illegal drop, or a move past the repertoire's end, is not judged.
 *
 * **Counted once per position**: the first try at a position is the verdict,
 * and retries there after a failure count nothing. Getting it right clears
 * that, and so does `requestReply` (a restart), so the same position met on a
 * later run through the line counts again. The verdict goes out through
 * `onJudged`; what a verdict is worth — a tally today — is the screen's.
 *
 * ## A required move, and where a move landed — for the games
 *
 * Two more seams, both for the repertoire games (`lib/repertoireGames.ts`):
 *
 * - **`required`** — the moves the reader must choose from at the node on
 *   screen (Backtracking: only the ones leading to lines not yet covered). In
 *   game mode, a repertoire move outside it is refused — snapped back, and
 *   **not** judged: it is a right move, only a finished one. The screen marks
 *   the required moves and says why.
 * - **`arrival`** — the node the last *played* move landed on, reader's or
 *   trainer's, while it is still on screen; `null` after navigation. A game
 *   reads "a line was just finished" off it, which navigating onto the end of
 *   a line must never count as.
 *
 * ## Designed to be extended, not forked
 *
 * A weighted or spaced-repetition trainer is a new `policy`; a scoring rule is
 * the screen's `onJudged`. Neither touches the core, and neither is a second
 * module.
 */

/** What the panel says about the trainer, for the position on screen. */
export type TrainerStatus =
  | "trainer-thinking"
  | "your-move"
  | "out-of-book"
  /** Game mode only: the last try here was wrong and was taken back. */
  | "try-again";

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
  /** Game mode: judge the reader's moves, and take a wrong one back. */
  drill?: boolean;
  /** Game mode's verdicts — once per position, the first try's. */
  onJudged?: (verdict: DrillVerdict) => void;
  /**
   * The moves the reader must choose from at the node on screen — a game's
   * constraint. In game mode a repertoire move outside it is refused, unjudged.
   */
  required?: readonly VariationNode[];
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
  drill = false,
  onJudged,
  required,
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
  /** Where the last played move landed, while it is on screen. */
  const [arrival, setArrival] = useState<Owed | null>(null);
  if (arrival !== null && arrival.at !== nodeId) setArrival(null);

  /** Game mode: the node a wrong try was just taken back at. */
  const [mistakeAt, setMistakeAt] = useState<Owed | null>(null);
  if (mistakeAt !== null && mistakeAt.at !== nodeId) setMistakeAt(null);

  /*
    Game mode's bookkeeping, read and written only in the handlers: the
    position whose verdict is already in (a failure, while it is retried), and
    the promotion pieces the repertoire allows for a drop waiting on the picker.
  */
  const judgedAt = useRef<Owed | null>(null);
  const pendingPromotions = useRef<ReadonlySet<string> | null>(null);

  const judge = useCallback(
    (verdict: DrillVerdict) => {
      const already = judgedAt.current !== null && judgedAt.current.at === nodeId;
      if (!already) onJudged?.(verdict);
      // A failure stays judged while it is retried; a success moves on.
      judgedAt.current = verdict === "fail" ? { at: nodeId } : null;
      if (verdict === "fail") setMistakeAt({ at: nodeId });
    },
    [nodeId, onJudged],
  );

  if (movedFrom !== null && movedFrom.at !== nodeId) {
    // The reader's move landed on a child of the node it was made from. Any
    // other change of node is navigation, with a promotion picker still open.
    const landed = nodeId !== null && parentIdOf(tree, nodeId) === movedFrom.at;
    setMovedFrom(null);
    setOwed(landed ? { at: nodeId } : null);
    if (landed) setArrival({ at: nodeId });
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
      if (move === undefined) return;
      playVariation([move.san]);
      // A repertoire move keeps its id in the session tree: this is where it lands.
      setArrival({ at: move.id });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [replying, delayMs, nodeId, playVariation, policy, random, repertoire]);

  /**
   * The reader's drop: in game mode judged first (a wrong move is refused —
   * taken back), then noted and handed to the core unchanged.
   */
  const onReaderDrop = useCallback(
    (args: Parameters<BoardCore["onPieceDrop"]>[0]) => {
      pendingPromotions.current = null;
      if (drill && enabled && args.targetSquare !== null && !trainerTurn) {
        const judgement = judgeDrop(
          repertoire,
          nodeId,
          fen,
          args.sourceSquare,
          args.targetSquare,
        );
        if (judgement.kind === "wrong") {
          judge("fail");
          return false;
        }
        if (judgement.kind === "book") {
          // A finished line's move, where the game requires another: refused,
          // but a right move all the same — not judged.
          if (
            required !== undefined &&
            !judgement.nodes.some((node) => required.some((open) => open.id === node.id))
          ) {
            return false;
          }
          if (judgement.promotions === undefined) judge("success");
          else pendingPromotions.current = judgement.promotions;
        }
      }
      const accepted = onPieceDrop(args);
      if (accepted) setMovedFrom({ at: nodeId });
      return accepted;
    },
    [drill, enabled, fen, judge, nodeId, onPieceDrop, repertoire, required, trainerTurn],
  );

  /**
   * The picker's answer: a dismissed promotion is no move at all. In game
   * mode, a promotion the repertoire makes is judged by the piece chosen.
   */
  const onReaderPromotion = useCallback(
    (piece: Parameters<BoardCore["resolvePromotion"]>[0]) => {
      const allowed = pendingPromotions.current;
      pendingPromotions.current = null;
      if (piece === null) {
        setMovedFrom(null);
        resolvePromotion(null);
        return;
      }
      if (allowed !== null && !allowed.has(piece)) {
        judge("fail");
        setMovedFrom(null);
        resolvePromotion(null);
        return;
      }
      if (allowed !== null) judge("success");
      resolvePromotion(piece);
    },
    [judge, resolvePromotion],
  );

  /** "The session starts here": owe a reply at `at`, the node about to be on screen. */
  const requestReply = useCallback((at: string | null) => {
    setMovedFrom(null);
    setOwed({ at });
    // A new run through the line: its positions are judged afresh.
    judgedAt.current = null;
  }, []);

  const status: TrainerStatus = replying
    ? "trainer-thinking"
    : bookMoves === 0
      ? "out-of-book"
      : drill && mistakeAt !== null && mistakeAt.at === nodeId
        ? "try-again"
        : "your-move";

  return {
    status,
    /** Hand these to the board in place of the core's own. */
    onPieceDrop: onReaderDrop,
    resolvePromotion: onReaderPromotion,
    requestReply,
    /** Where the last played move landed, while it is on screen — `null` otherwise. */
    arrival,
  };
};

/** The id of the move `nodeId` answers — `null` for a first move. */
const parentIdOf = (tree: GameTree, nodeId: string): string | null => {
  // `pathTo` reads the per-tree index; the parent is the next-to-last step.
  const path = pathTo(tree, nodeId);
  return path.length >= 2 ? path[path.length - 2].id : null;
};
