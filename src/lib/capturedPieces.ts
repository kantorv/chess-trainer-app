import { startNumbering } from "./gameNavigation";

/**
 * What a board that plays or analyses a game shows beside it: the pieces each
 * side has captured, and the material difference between them — the lichess /
 * chess.com feature, derived for one line of play.
 *
 * Two data sources, deliberately different, because a capture and a promotion
 * are the same thing to a position:
 *
 * - The **captured-pieces lists** are history-based: every move's
 *   {@link CapturedMove.captured} names the piece type it took, carried through
 *   `GameMove` and `VariationNode` by the producers (`lib/gameModel.ts`,
 *   `lib/gameTree.ts`, `lib/pgn.ts`). From one FEN you cannot tell "pawn
 *   captured" from "pawn promoted" — a FEN-diff would report a promoted pawn as
 *   a captured one — so the lists are never derived from positions.
 * - The **material diff** counts the pieces each FEN carries, relative to the
 *   line's own start. A promotion is a gain for the side that made it — a queen
 *   on the board is worth nine points whether it began as a pawn or not — which
 *   is what makes the diff correct through promotions where the lists stay
 *   quiet.
 *
 * The two never disagree; they differ exactly where a promotion happens.
 */

/** The piece letters a capture can name — a king is never captured. */
const CAPTURED_PIECE_LETTERS = ["q", "r", "b", "n", "p"] as const;

export type CapturedPieceLetter = (typeof CAPTURED_PIECE_LETTERS)[number];

/** Standard material values: P=1, N=3, B=3, R=5, Q=9. */
const MATERIAL_VALUES: Readonly<
  Record<CapturedPieceLetter, number>
> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const isCapturedPieceLetter = (value: string): value is CapturedPieceLetter =>
  (CAPTURED_PIECE_LETTERS as readonly string[]).includes(value);

/**
 * The pieces each side has captured along one line. Keyed by the side that
 * *took* them — `white` holds black pieces, `black` holds white ones, since a
 * capture is always of the opponent's man. Strongest first, so the strip
 * renders them in the order lichess and chess.com do.
 */
export type CapturedPieces = {
  /** The black pieces White captured. */
  white: readonly CapturedPieceLetter[];
  /** The white pieces Black captured. */
  black: readonly CapturedPieceLetter[];
};

/**
 * The moves a line is walked with: anything carrying the optional
 * {@link CapturedMove.captured}. `GameMove` and `VariationNode` both qualify,
 * so the screens hand this `game.moves.slice(0, ply)` or `pathTo(tree, nodeId)`
 * — the walks they already hold, with no re-simulation.
 */
export type CapturedMove = {
  /** The piece type this move took, as `chess.js` writes it — `"p"`, `"q"`, … */
  captured?: string;
};

/**
 * The pieces each side has captured along the line `moves`, walked from
 * `startFen` — **the line's own start**, not the standard one, because a
 * position set up from a FEN (a queen-vs-rook study) starts imbalanced and
 * nothing on it is "captured" until a capture happens.
 *
 * Which side made each move comes from the start position's turn and the
 * move's index — the same arithmetic `moveRowsOf` pairs numbered rows by
 * (`lib/gameNavigation.ts`), so a game that begins with Black to move is
 * attributed correctly too.
 */
export const capturedOfLine = (
  moves: readonly CapturedMove[],
  startFen: string,
): CapturedPieces => {
  const { whiteFirst } = startNumbering(startFen);
  const white: CapturedPieceLetter[] = [];
  const black: CapturedPieceLetter[] = [];

  moves.forEach((move, index) => {
    const captured = move.captured;
    if (captured === undefined || !isCapturedPieceLetter(captured)) return;
    const slot = index + (whiteFirst ? 0 : 1);
    (slot % 2 === 0 ? white : black).push(captured);
  });

  const strongestFirst = (letters: CapturedPieceLetter[]) =>
    [...letters].sort((a, b) => MATERIAL_VALUES[b] - MATERIAL_VALUES[a]);

  return { white: strongestFirst(white), black: strongestFirst(black) };
};

/**
 * The material each FEN carries: the sum of its pieces' values, per side.
 *
 * Read off the placement field alone — a promoted queen is on the board as a
 * queen, which is the whole point. Unknown letters are skipped rather than
 * thrown on, so a FEN this cannot fully read still yields a best-effort count.
 */
const materialOf = (fen: string): { white: number; black: number } => {
  const placement = fen.split(/\s+/)[0] ?? "";
  let white = 0;
  let black = 0;

  for (const char of placement) {
    if (char === "/") continue;
    // Run-length digits ("8") say how many empty squares, not pieces.
    if (Number.isFinite(Number.parseInt(char, 10))) continue;
    const value =
      MATERIAL_VALUES[char.toLowerCase() as CapturedPieceLetter] ?? 0;
    if (value === 0) continue;
    if (char === char.toUpperCase()) white += value;
    else black += value;
  }

  return { white, black };
};

/**
 * White's material gain minus Black's, relative to the position `baselineFen`
 * — positive means White is ahead *of the baseline*, not of the standard start.
 *
 * The baseline is the line's own start position for the same reason
 * {@link capturedOfLine} walks from it: a study that opens a queen down is not
 * "behind", that is the exercise, and relative to its own start the diff is
 * level until a capture happens. Computed by counting pieces on each board, so
 * a promotion is a gain for the side that made it and the diff is correct
 * through promotions.
 */
export const materialDiff = (fen: string, baselineFen: string): number => {
  const at = materialOf(fen);
  const base = materialOf(baselineFen);
  return at.white - base.white - (at.black - base.black);
};

/** How far ahead `side` is, or `null` when level or behind — what a strip renders. */
export const diffForSide = (
  materialDiff: number,
  side: "white" | "black",
): number | null => {
  if (side === "white") return materialDiff > 0 ? materialDiff : null;
  return materialDiff < 0 ? -materialDiff : null;
};

/**
 * Everything the captured-pieces strips show for one line: the per-side
 * captured lists and the material diff, both relative to the line's start.
 */
export type CapturedSummary = {
  captured: CapturedPieces;
  materialDiff: number;
};

/**
 * The one seam every play/analysis board composes — the screens hand it the
 * moves up to the ply on screen, the line's start position, and the position
 * on screen.
 */
export const capturedSummaryOf = (
  moves: readonly CapturedMove[],
  baselineFen: string,
  currentFen: string,
): CapturedSummary => ({
  captured: capturedOfLine(moves, baselineFen),
  materialDiff: materialDiff(currentFen, baselineFen),
});
