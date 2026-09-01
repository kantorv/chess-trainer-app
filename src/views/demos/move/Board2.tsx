import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Chessboard,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from 'react-chessboard';

/**
 * Demo 2 — Human vs a random mover.
 *
 * Establishes the interaction loop reused by every later demo:
 *
 *  1. `chess.js` owns the rules and the authoritative game state. It lives in a
 *     ref (not state) so event handlers always read the latest game without
 *     stale closures, and mutating it never triggers a render on its own.
 *  2. The board position is mirrored into React state as a FEN string. Passing
 *     it back through `options.position` makes <Chessboard> a controlled
 *     component — updating the string is what re-renders the board.
 *  3. `onPieceDrop` validates the attempted move through `chess.js` and returns
 *     a boolean: `true` accepts the move, `false` tells the board to snap the
 *     piece back.
 */
function Board2() {
  const chessGameRef = useRef(new Chess());
  const chessGame = chessGameRef.current;

  const [chessPosition, setChessPosition] = useState(chessGame.fen());

  // Pending "CPU" move timer — cleared on unmount so it can't fire into a
  // torn-down component.
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(moveTimerRef.current), []);

  function makeRandomMove() {
    if (chessGame.isGameOver()) {
      return;
    }

    const possibleMoves = chessGame.moves();
    const randomMove =
      possibleMoves[Math.floor(Math.random() * possibleMoves.length)];

    chessGame.move(randomMove);
    setChessPosition(chessGame.fen());
  }

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    // targetSquare is null when the piece is dropped off the board
    if (!targetSquare) {
      return false;
    }

    try {
      chessGame.move({
        from: sourceSquare,
        to: targetSquare,
        // Demo simplification — always promote to a queen. See
        // .claude/rules/chessboard.md for real promotion handling.
        promotion: 'q',
      });
    } catch {
      // chess.js throws on an illegal move — reject it
      return false;
    }

    setChessPosition(chessGame.fen());
    moveTimerRef.current = setTimeout(makeRandomMove, 500);
    return true;
  }

  const chessboardOptions: ChessboardOptions = {
    id: 'play-vs-random',
    position: chessPosition,
    onPieceDrop,
  };

  return <Chessboard options={chessboardOptions} />;
}

export default Board2;
