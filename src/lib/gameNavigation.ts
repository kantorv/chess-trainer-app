import type { Arrow } from "react-chessboard";
import { initialFenOf, type ParsedGame, type ParsedMove } from "./pgn";

/**
 * Walking a parsed game: which position a ply shows, which arrow marks it, and
 * how its moves pair up into lichess-style numbered rows.
 *
 * Pure functions over the {@link ParsedGame} model — no React, no `chess.js`
 * instance. A ply is a *half*-move index: `0` is the starting position and `n`
 * is the position after `game.moves[n - 1]`, which is exactly the `fen` that
 * move already carries. Nothing here re-simulates a game.
 */

/** The colour of the arrow marking the move that produced the current position. */
export const MOVE_ARROW_COLOR = "#ffaa00";

/** One numbered row of the move list: White's move and Black's reply. */
export type MoveRow = {
  /** The full-move number as it is printed, e.g. `1` in `1. e4 e5`. */
  number: number;
  white: ParsedMove | null;
  black: ParsedMove | null;
};

/** The last selectable ply — the position after the final move. */
export const lastPlyOf = (game: ParsedGame): number => game.moves.length;

/** A ply pinned into `[0, lastPly]`. Out-of-range input is a clamp, not a throw. */
export const clampPly = (game: ParsedGame, ply: number): number =>
  Math.min(Math.max(Math.trunc(ply), 0), lastPlyOf(game));

/**
 * The position at a ply: the starting position at ply 0, otherwise the FEN the
 * move at that ply already recorded.
 */
export const fenAtPly = (game: ParsedGame, ply: number): string => {
  const at = clampPly(game, ply);
  return at === 0 ? initialFenOf(game) : game.moves[at - 1].fen;
};

/**
 * The board arrows for a ply: the single from→to arrow of the move that led
 * here, and nothing at ply 0.
 *
 * A fresh array every call, on purpose. Arrows passed through `options.arrows`
 * are external and the board never clears them itself
 * (`.claude/rules/chessboard.md` §3.4) — the caller has to hand it the whole
 * set for the current ply, so this returns exactly that set rather than
 * something to append to.
 */
export const arrowsAtPly = (game: ParsedGame, ply: number): Arrow[] => {
  const at = clampPly(game, ply);
  if (at === 0) return [];

  const move = game.moves[at - 1];
  return [
    { startSquare: move.from, endSquare: move.to, color: MOVE_ARROW_COLOR },
  ];
};

/**
 * Where the game's move numbering starts, read off the initial FEN. Almost
 * always "White, move 1" — but a PGN with a `FEN` tag can start from Black to
 * move, or from move 24, and printing `1.` there would be a lie.
 */
const numberingOf = (game: ParsedGame) => {
  const [, turn, , , , fullmove] = initialFenOf(game).split(/\s+/);
  const first = Number.parseInt(fullmove ?? "", 10);
  return {
    whiteFirst: turn !== "b",
    firstNumber: Number.isFinite(first) && first > 0 ? first : 1,
  };
};

/**
 * The moves grouped into numbered pairs, so the list can render two columns
 * rather than one row per ply. A game that starts with Black to move opens with
 * a row whose `white` is `null`.
 */
export const moveRowsOf = (game: ParsedGame): MoveRow[] => {
  const { whiteFirst, firstNumber } = numberingOf(game);
  const rows: MoveRow[] = [];

  game.moves.forEach((move, index) => {
    // Shifting by one when Black moves first puts every move in the right half
    // of its pair, and keeps the arithmetic below identical for both cases.
    const slot = index + (whiteFirst ? 0 : 1);
    const number = firstNumber + Math.floor(slot / 2);

    let row = rows.at(-1);
    if (row === undefined || row.number !== number) {
      row = { number, white: null, black: null };
      rows.push(row);
    }

    if (slot % 2 === 0) {
      row.white = move;
    } else {
      row.black = move;
    }
  });

  return rows;
};
