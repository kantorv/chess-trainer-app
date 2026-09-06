import type { Arrow } from "react-chessboard";
import { gameTag, initialFenOf, type Game, type GameMove } from "./gameModel";

/**
 * Walking a game: which position a ply shows, which arrow marks it, and how its
 * moves pair up into lichess-style numbered rows. A game parsed out of a PGN
 * and one growing under the engine screen are the same shape here, so both
 * screens navigate through this one module.
 *
 * Pure functions over the {@link Game} model — no React, no `chess.js`
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
  white: GameMove | null;
  black: GameMove | null;
};

/** The last selectable ply — the position after the final move. */
export const lastPlyOf = (game: Game): number => game.moves.length;

/** A ply pinned into `[0, lastPly]`. Out-of-range input is a clamp, not a throw. */
export const clampPly = (game: Game, ply: number): number =>
  Math.min(Math.max(Math.trunc(ply), 0), lastPlyOf(game));

/**
 * The `?move=` query parameter, read. It carries a ply — the same unit this
 * module speaks — so a study page's URL can name the move the reader is on and
 * a `?game=` hand-off can open the destination on it.
 *
 * The same "validate and ignore what does not pass" rule as `parseFen` and
 * `resolveGameReference`: an absent, non-numeric or negative value is
 * `undefined` (ply 0, as if the parameter had not been there), never a throw.
 * Too *large* a value is not rejected here — that depends on the game, so it is
 * `clampPly`'s job on read, exactly like a ply from any other source.
 */
export const parseMoveParam = (value: string | null): number | undefined => {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  return Number.parseInt(value, 10);
};

/**
 * The ply a game declares it opens on: its `StartPly` tag pair
 * (`[StartPly "27"]`). A puzzle collection uses it to open each chapter at the
 * position that matters rather than at the game's start.
 *
 * The second source of an opening ply beside the `?move=` parameter, read with
 * the same discipline: an absent or unreadable value is "no declared start" —
 * `0`, never a throw. So is a value **past the end of the game**, and it is
 * ignored whole rather than clamped — a tag that names a move the game does
 * not have is a broken tag, not a request for the final position.
 *
 * Precedence is the caller's, and it is one line:
 * `parseMoveParam(param) ?? initialPlyOf(game)` — an explicit `?move=` wins
 * over the tag, the tag wins over ply 0.
 */
export const initialPlyOf = (game: Game): number => {
  const declared = parseMoveParam(gameTag(game.headers, "StartPly") ?? null);
  return declared !== undefined && declared <= lastPlyOf(game) ? declared : 0;
};

/**
 * The position at a ply: the starting position at ply 0, otherwise the FEN the
 * move at that ply already recorded.
 */
export const fenAtPly = (game: Game, ply: number): string => {
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
export const arrowsAtPly = (game: Game, ply: number): Arrow[] => {
  const at = clampPly(game, ply);
  if (at === 0) return [];

  const move = game.moves[at - 1];
  return [
    { startSquare: move.from, endSquare: move.to, color: MOVE_ARROW_COLOR },
  ];
};

/**
 * Where move numbering starts, read off a starting FEN. Almost always "White,
 * move 1" — but a position set up from a FEN can start from Black to move, or
 * from move 24, and printing `1.` there would be a lie.
 *
 * Exported because the variation tree numbers its moves by the same rule
 * (`lib/gameTree.ts` `plyLabel`), and two copies of it would drift.
 */
export const startNumbering = (
  fen: string,
): { whiteFirst: boolean; firstNumber: number } => {
  const [, turn, , , , fullmove] = fen.split(/\s+/);
  const first = Number.parseInt(fullmove ?? "", 10);
  return {
    whiteFirst: turn !== "b",
    firstNumber: Number.isFinite(first) && first > 0 ? first : 1,
  };
};

/** The same, for a game — its numbering comes from its own initial position. */
const numberingOf = (game: Game) => startNumbering(initialFenOf(game));

/**
 * The moves grouped into numbered pairs, so the list can render two columns
 * rather than one row per ply. A game that starts with Black to move opens with
 * a row whose `white` is `null`.
 */
export const moveRowsOf = (game: Game): MoveRow[] => {
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
