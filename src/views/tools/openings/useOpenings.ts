import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import type { Arrow } from "react-chessboard";
import {
  KNOWN_MOVE_ARROW_COLOR,
  getPositionBook,
  knownMoveOpenings,
  loadOpeningBook,
  type KnownMoveOpening,
  type OpeningBook,
  type PositionBook,
} from "../../../lib/openings";
import { addMove, emptyTree, type GameTree } from "../../../lib/gameTree";
import { useTreeNavigation } from "../analysis/useTreeNavigation";

/**
 * Everything the Openings screen knows, in one hook — the `useAnalysisBoard`
 * pattern minus the engine: a `chess.js` instance in a ref as the *rules
 * oracle* for the position on screen, the game itself held as a
 * {@link GameTree}, and a promotion picker for the one move `onPieceDrop`
 * cannot finish by itself.
 *
 * ## The game is a tree
 *
 * Exploring an opening *is* branching: stepping back to move 4 and trying the
 * other book reply has to keep both continuations, or the explorer cannot
 * compare them. So this screen holds a tree and navigates it by node id
 * (`useTreeNavigation`), exactly like the Analysis Board — a drop from an
 * earlier ply is a variation, not an error, and dragging is on at every
 * position (both colours; the reader is exploring, not playing a side). The
 * shared `BoardControls` still speak ply, which the navigation derives.
 *
 * The opening book loads lazily (`lib/openings.ts`) and is looked up for *the
 * position on screen*, live or not — stepping back through a line already
 * played is exactly when a reader wants to see what it was called, and what
 * else eco.json knows from there.
 */

/** A tree with nothing in it, taken once — plain data that nothing mutates. */
const NEW_TREE: GameTree = emptyTree();

export const useOpenings = (initialFen?: string) => {
  /*
    One `chess.js` instance, in a ref, moved to whichever position is being
    asked about — the board's position comes from the tree, so this is a rules
    oracle rather than the game itself: it answers "what are the legal moves
    from this FEN" and "what does this drop mean". Reloading only when the FEN
    actually differs keeps a drag from paying for a parse it does not need.
  */
  const chessRef = useRef(new Chess(initialFen));
  const chessAt = useCallback((fen: string) => {
    const chess = chessRef.current;
    if (chess.fen() !== fen) chess.load(fen);
    return chess;
  }, []);

  // Read once, as initial state: arriving at `?fen=` is what mounts the screen.
  const [tree, setTree] = useState<GameTree>(() =>
    initialFen === undefined ? NEW_TREE : emptyTree(initialFen),
  );
  const [orientation, setOrientation] = useState<"white" | "black">(() =>
    initialFen !== undefined && initialFen.split(" ")[1] === "b" ? "black" : "white",
  );
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [hoveredMove, setHoveredMove] = useState<KnownMoveOpening | null>(null);

  const [book, setBook] = useState<OpeningBook | null>(null);
  const [positionBook, setPositionBook] = useState<PositionBook | undefined>(undefined);

  const navigation = useTreeNavigation(tree);
  const { fen, nodeId, goToNode } = navigation;

  // Loaded once per mount; `loadOpeningBook` itself caches across mounts, so a
  // second visit to this screen resolves immediately rather than re-fetching.
  useEffect(() => {
    let cancelled = false;
    loadOpeningBook().then((loaded) => {
      if (cancelled) return;
      setBook(loaded);
      setPositionBook(getPositionBook(loaded));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The known continuations from the position on screen — only the moves that
   * resolve to an opening. Off-book moves stay playable (drag one and the tree
   * keeps it); they simply are not book continuations, so the explorer does not
   * list them.
   */
  const nextMoves: KnownMoveOpening[] = useMemo(
    () => (book === null ? [] : knownMoveOpenings(fen, book, positionBook)),
    [book, fen, positionBook],
  );

  /*
    The whole arrow set for the position on screen: the last-move arrow the
    navigation already computes, plus one arrow per known next move. Arrows
    passed through `options.arrows` are external — the board never clears or
    adds to them itself (`.claude/rules/chessboard.md` §3.4) — so this is the
    complete set, recomputed whenever the position or the book changes.
  */
  const arrows: Arrow[] = useMemo(
    () => [
      ...navigation.arrows,
      ...nextMoves.map((move) => ({
        startSquare: move.from,
        endSquare: move.to,
        color: hoveredMove && hoveredMove.san === move.san ? "#f44336" : KNOWN_MOVE_ARROW_COLOR,
      })),
    ],
    [navigation.arrows, nextMoves, hoveredMove],
  );

  /**
   * The hover color for next-move arrows. This is a distinct color from the
   * last-move arrow (#ffaa00) and the known-move arrows (#4caf50).
   */
  const HOVER_ARROW_COLOR = "#f44336";

  /**
   * Add an already-played move under the node on screen and select it. Replaying
   * a move the tree already holds follows that line rather than duplicating it;
   * anything else branches — both cases are `addMove`'s own rules.
   */
  const commitMove = useCallback(
    (move: Move) => {
      const added = addMove(tree, nodeId, {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: move.after,
      });
      setTree(added.tree);
      goToNode(added.nodeId);
    },
    [goToNode, nodeId, tree],
  );

  const applyMove = useCallback(
    (from: Square, to: Square, promotionPiece?: string) => {
      let move: Move;
      try {
        move = chessAt(fen).move({ from, to, promotion: promotionPiece });
      } catch {
        return false;
      }
      commitMove(move);
      return true;
    },
    [chessAt, commitMove, fen],
  );

  /**
   * The drop handler. Both colours, at any ply: a drop from an earlier position
   * is how a variation starts. Returns `true` for every move actually applied —
   * and also for a promotion, which is applied a moment later once the picker is
   * answered; returning `false` there would snap the pawn back and then jump it
   * forward again when the choice lands.
   */
  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare) return false;

      const chess = chessAt(fen);
      if (chess.isGameOver()) return false;

      const candidates = chess
        .moves({ square: sourceSquare as Square, verbose: true })
        .filter((move) => move.to === targetSquare);

      if (candidates.length === 0) return false;

      if (candidates.some((move) => move.promotion)) {
        setPromotion({ from: sourceSquare as Square, to: targetSquare as Square });
        return true;
      }

      return applyMove(sourceSquare as Square, targetSquare as Square);
    },
    [applyMove, chessAt, fen],
  );

  const resolvePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n" | null) => {
      const pending = promotion;
      setPromotion(null);
      if (pending && piece) applyMove(pending.from, pending.to, piece);
    },
    [applyMove, promotion],
  );

  /**
   * Play a specific move out of {@link nextMoves} — the explorer list's own
   * click handler. Like a drop, it works at any ply: clicking a book move from
   * an earlier position branches the tree there.
   */
  const playMove = useCallback(
    (san: string) => {
      let move: Move;
      try {
        move = chessAt(fen).move(san);
      } catch {
        return;
      }
      commitMove(move);
    },
    [chessAt, commitMove, fen],
  );

  /**
   * Back to the position this screen opened on — the handed-over one when
   * there was one, exactly as Play with Engine's "New game" works and for the
   * same reason: resetting to the standard start would throw away a position
   * the reader came here to explore, with no way back to it.
   */
  const newGame = useCallback(() => {
    chessRef.current = new Chess(initialFen);
    setTree(initialFen === undefined ? NEW_TREE : emptyTree(initialFen));
    setPromotion(null);
    goToNode(null);
  }, [goToNode, initialFen]);

  const flipBoard = useCallback(
    () => setOrientation((side) => (side === "white" ? "black" : "white")),
    [],
  );

  return {
    tree,
    ...navigation,
    arrows,
    orientation,
    flipBoard,
    promotion,
    resolvePromotion,
    onPieceDrop,
    newGame,
    nextMoves,
    playMove,
    setHoveredMove,
  };
};

export type OpeningsState = ReturnType<typeof useOpenings>;
