import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { gameFromChess, type Game } from "../../../lib/gameModel";
import {
  getPositionBook,
  loadOpeningBook,
  nextMoveOpenings,
  type NextMoveOpening,
  type OpeningBook,
  type PositionBook,
} from "../../../lib/openings";
import { useGameNavigation } from "../../shared/useGameNavigation";

/**
 * Everything the Openings screen knows, in one hook — the `usePlayWithEngine`
 * pattern minus the engine: a live `chess.js` instance in a ref, the position
 * it produces mirrored into a `Game` for the shared move list and board
 * controls, and a promotion picker for the one move `onPieceDrop` cannot
 * finish by itself.
 *
 * There is no variation tree here (contrast `useAnalysisBoard`): this screen
 * is one line, growing at its tip, exactly like Play with Engine's game —
 * dragging is disabled off the live position for the same reason theirs is,
 * because a drag anywhere else would apply to a position nobody is looking at
 * and nothing here has a second continuation to keep.
 *
 * The opening book loads lazily (`lib/openings.ts`) and is looked up for
 * *the position on screen*, live or not — stepping back through a game already
 * played is exactly when a reader wants to see what it was called.
 */

const NEW_GAME: Game = gameFromChess(new Chess());

export const useOpenings = (initialFen?: string) => {
  const chessGameRef = useRef(new Chess(initialFen));

  const [game, setGame] = useState<Game>(() =>
    initialFen === undefined ? NEW_GAME : gameFromChess(new Chess(initialFen)),
  );
  const [orientation, setOrientation] = useState<"white" | "black">(() =>
    initialFen !== undefined && initialFen.split(" ")[1] === "b" ? "black" : "white",
  );
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const [book, setBook] = useState<OpeningBook | null>(null);
  const [positionBook, setPositionBook] = useState<PositionBook | undefined>(undefined);

  const { ply, lastPly, fen, arrows, goToPly } = useGameNavigation(game);

  const isLive = ply === lastPly;

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

  const nextMoves: NextMoveOpening[] = useMemo(
    () => (book === null ? [] : nextMoveOpenings(fen, book, positionBook)),
    [book, fen, positionBook],
  );

  const applyMove = useCallback(
    (from: Square, to: Square, promotionPiece?: string) => {
      const chessGame = chessGameRef.current;
      try {
        chessGame.move({ from, to, promotion: promotionPiece });
      } catch {
        return false;
      }
      setGame(gameFromChess(chessGame));
      goToPly(chessGame.history().length);
      return true;
    },
    [goToPly],
  );

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare) return false;

      const chessGame = chessGameRef.current;
      if (!isLive || chessGame.isGameOver()) return false;

      const candidates = chessGame
        .moves({ square: sourceSquare as Square, verbose: true })
        .filter((move) => move.to === targetSquare);

      if (candidates.length === 0) return false;

      if (candidates.some((move) => move.promotion)) {
        setPromotion({ from: sourceSquare as Square, to: targetSquare as Square });
        return true;
      }

      return applyMove(sourceSquare as Square, targetSquare as Square);
    },
    [applyMove, isLive],
  );

  const resolvePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n" | null) => {
      const pending = promotion;
      setPromotion(null);
      if (pending && piece) applyMove(pending.from, pending.to, piece);
    },
    [applyMove, promotion],
  );

  /** Play a specific move out of {@link nextMoves} — the explorer list's own click handler. */
  const playMove = useCallback(
    (san: string) => {
      if (!isLive) return;
      const chessGame = chessGameRef.current;
      try {
        chessGame.move(san);
      } catch {
        return;
      }
      setGame(gameFromChess(chessGame));
      goToPly(chessGame.history().length);
    },
    [goToPly, isLive],
  );

  /**
   * Back to the position this screen opened on — the handed-over one when
   * there was one, exactly as Play with Engine's "New game" works and for the
   * same reason: resetting to the standard start would throw away a position
   * the reader came here to explore, with no way back to it.
   */
  const newGame = useCallback(() => {
    const fresh = new Chess(initialFen);
    chessGameRef.current = fresh;
    setGame(gameFromChess(fresh));
    setPromotion(null);
    goToPly(0);
  }, [goToPly, initialFen]);

  const flipBoard = useCallback(
    () => setOrientation((side) => (side === "white" ? "black" : "white")),
    [],
  );

  return {
    game,
    ply,
    lastPly,
    fen,
    arrows,
    goToPly,
    isLive,
    orientation,
    flipBoard,
    promotion,
    resolvePromotion,
    onPieceDrop,
    newGame,
    nextMoves,
    playMove,
  };
};

export type OpeningsState = ReturnType<typeof useOpenings>;
