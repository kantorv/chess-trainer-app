import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Chessboard,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from 'react-chessboard';
import Engine from '../../../lib/engine';

/** Side the human plays; the engine plays the other colour. */
const HUMAN_COLOR = 'w' as const;
/** Search depth for the engine's own moves — lower than analysis for snappier play. */
const ENGINE_DEPTH = 12;

/**
 * Demo 4 — Play against Stockfish.
 *
 * Distinct from Demo 3 (analysis): here the engine actually *moves*. The human
 * drags a piece, `chess.js` validates it, then the engine is asked for its best
 * reply and that move is applied automatically when it comes back.
 *
 * Reuses the ref-owned game + controlled `position` pattern from Demo 2 and the
 * engine-lifecycle pattern from Demo 3 (lazy ref, subscribe-in-effect with
 * unsubscribe, `terminate()` on unmount). See .claude/rules/chessboard.md.
 */
function Board4() {
  const engineRef = useRef<Engine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new Engine();
  }
  const engine = engineRef.current;

  const chessGameRef = useRef(new Chess());
  const chessGame = chessGameRef.current;

  const [chessPosition, setChessPosition] = useState(chessGame.fen());
  const [isEngineThinking, setIsEngineThinking] = useState(false);

  // Apply the engine's chosen move when it arrives.
  useEffect(() => {
    const unsubscribe = engine.onMessage(({ bestMove }) => {
      // Only act on a bestmove that it is actually the engine's turn to play.
      if (
        !bestMove ||
        chessGame.turn() === HUMAN_COLOR ||
        chessGame.isGameOver()
      ) {
        return;
      }

      try {
        chessGame.move({
          from: bestMove.slice(0, 2),
          to: bestMove.slice(2, 4),
          // Engine encodes promotion in the move string, e.g. "e7e8q".
          promotion: bestMove.slice(4) || undefined,
        });
        setChessPosition(chessGame.fen());
      } catch {
        // Ignore a malformed or stale bestmove.
      }
      setIsEngineThinking(false);
    });

    return unsubscribe;
  }, [engine, chessGame]);

  // Tear the worker down on unmount (and on StrictMode remount).
  useEffect(() => {
    return () => {
      engine.terminate();
      engineRef.current = null;
    };
  }, [engine]);

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    // Reject drops off the board and any attempt to move on the engine's turn.
    if (!targetSquare || chessGame.turn() !== HUMAN_COLOR) {
      return false;
    }

    try {
      chessGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // demo simplification — see .claude/rules/chessboard.md
      });
    } catch {
      return false;
    }

    setChessPosition(chessGame.fen());

    if (!chessGame.isGameOver()) {
      setIsEngineThinking(true);
      engine.evaluatePosition(chessGame.fen(), ENGINE_DEPTH);
    }
    return true;
  }

  const chessboardOptions: ChessboardOptions = {
    id: 'play-vs-engine',
    position: chessPosition,
    onPieceDrop,
    boardOrientation: 'white', // HUMAN_COLOR is White in this demo
    // Lock the board while the engine is choosing its move.
    allowDragging: !isEngineThinking,
  };

  return <Chessboard options={chessboardOptions} />;
}

export default Board4;
