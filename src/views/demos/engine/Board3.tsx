import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  Chessboard,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
} from 'react-chessboard';
import Engine from '../../../lib/engine';

/** How deep Stockfish searches after each move. */
const ENGINE_DEPTH = 18;
/** Ignore the noisy shallow updates the engine streams while it thinks. */
const MIN_REPORT_DEPTH = 10;

/**
 * Demo 3 — Analysis board.
 *
 * Same move loop as Demo 2, plus a Stockfish worker that evaluates every new
 * position. The engine's suggested move is drawn on the board as an arrow via
 * `options.arrows`.
 *
 * The evaluation / mate / best-line values are held in state here (the data
 * layer). Rendering them is a UI concern and is intentionally left out of this
 * board component.
 *
 * Engine lifecycle rules (see .claude/rules/chessboard.md):
 *  - one `Engine` (one Worker) per mounted board, created lazily in a ref;
 *  - subscribe with `engine.onMessage` in an effect and call the returned
 *    unsubscribe on cleanup — never subscribe inside a per-move function;
 *  - `engine.terminate()` on unmount.
 */
function Board3() {
  const engineRef = useRef<Engine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new Engine();
  }
  const engine = engineRef.current;

  const chessGameRef = useRef(new Chess());
  const chessGame = chessGameRef.current;

  const [chessPosition, setChessPosition] = useState(chessGame.fen());
  const [positionEvaluation, setPositionEvaluation] = useState(0);
  const [depth, setDepth] = useState(ENGINE_DEPTH);
  const [bestLine, setBestLine] = useState('');
  const [possibleMate, setPossibleMate] = useState('');

  // Subscribe to engine output exactly once per Engine instance.
  useEffect(() => {
    const unsubscribe = engine.onMessage(
      ({ positionEvaluation, possibleMate, pv, depth }) => {
        if (depth && depth < MIN_REPORT_DEPTH) {
          return;
        }

        // Stockfish reports the score from the side-to-move's perspective;
        // normalise so that a positive number always favours White.
        if (positionEvaluation) {
          setPositionEvaluation(
            ((chessGame.turn() === 'w' ? 1 : -1) *
              Number(positionEvaluation)) /
              100,
          );
        }
        if (possibleMate) setPossibleMate(possibleMate);
        if (depth) setDepth(depth);
        if (pv) setBestLine(pv);
      },
    );

    return unsubscribe;
  }, [engine, chessGame]);

  // Tear the worker down on unmount (and on StrictMode remount).
  useEffect(() => {
    return () => {
      engine.terminate();
      engineRef.current = null;
    };
  }, [engine]);

  // Re-evaluate whenever the position changes and the game is still live.
  useEffect(() => {
    if (!(chessGame.isGameOver() || chessGame.isDraw())) {
      engine.evaluatePosition(chessPosition, ENGINE_DEPTH);
    }
  }, [engine, chessGame, chessPosition]);

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!targetSquare) {
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

    // New position: stop the in-flight search and clear stale engine output.
    // The evaluate effect above kicks off a fresh search.
    engine.stop();
    setPossibleMate('');
    setBestLine('');
    setChessPosition(chessGame.fen());
    return true;
  }

  // Best move comes back as the first token of the principal variation, e.g. "e2e4".
  const bestMove = bestLine.split(' ')[0];

  const chessboardOptions: ChessboardOptions = {
    id: 'analysis-board',
    position: chessPosition,
    onPieceDrop,
    arrows: bestMove
      ? [
          {
            startSquare: bestMove.substring(0, 2),
            endSquare: bestMove.substring(2, 4),
            color: 'rgb(0, 128, 0)',
          },
        ]
      : undefined,
  };

  return <Chessboard options={chessboardOptions} />;
}

export default Board3;
