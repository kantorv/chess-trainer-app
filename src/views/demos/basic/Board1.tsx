import { Chessboard, type ChessboardOptions } from 'react-chessboard';

/**
 * Demo 1 — Static board.
 *
 * The minimal integration. `react-chessboard` is a pure presentation component:
 * it knows nothing about chess rules and holds no game state. With no `position`
 * given it renders the standard starting position, and with no handlers it is
 * read-only (pieces can be picked up but every drop snaps back).
 *
 * Everything is configured through the single `options` prop. Type the object as
 * `ChessboardOptions` so unknown / misspelled keys are caught at compile time.
 */
function Board1() {
  const chessboardOptions: ChessboardOptions = {
    id: 'basic-board',
  };

  return <Chessboard options={chessboardOptions} />;
}

export default Board1;
