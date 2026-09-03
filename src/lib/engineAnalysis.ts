import { Chess } from "chess.js";

/**
 * Reading the engine's output: what a score means, how it is written, how far
 * the evaluation bar fills, and how a principal variation reads in SAN.
 *
 * Pure functions over plain data — no React, no `Engine` instance. The screen
 * collects raw UCI numbers and calls in here to turn them into something a
 * person can read, which is what lets every rule below be tested directly.
 *
 * ## The one rule everything here exists to enforce
 *
 * Stockfish reports `score cp` / `score mate` **from the side to move's
 * perspective**: `cp 40` after 1.e4 e5 means "the player to move is 0.4 ahead",
 * so the same number means White when it is White's turn and Black when it is
 * Black's. Every display in the app says "up is White" instead, so the score is
 * normalised exactly once, at {@link scoreFromUci}, and everything downstream
 * may assume White's perspective.
 */

/** An engine score, already normalised so that positive favours White. */
export type Score =
  /** Centipawns: `120` is "White is 1.2 pawns up". */
  | { readonly kind: "cp"; readonly value: number }
  /**
   * Mate in `value` *moves*, signed by who delivers it: `3` is "White mates in
   * 3", `-2` is "Black mates in 2". `0` is a delivered mate on the board.
   */
  | { readonly kind: "mate"; readonly value: number };

/** Whose turn it is in the position the engine was given. */
export type Turn = "w" | "b";

/**
 * One line of the engine's current thinking, already read into display terms.
 *
 * Here rather than on a screen because more than one screen collects these now —
 * Play with Engine and the Analysis Board — and the view that renders them
 * (`views/shared/BestVariations.tsx`) must not have to import a type from
 * whichever screen happens to own it.
 */
export type EngineLine = {
  /** 1-based rank among the `MultiPV` lines; 1 is the engine's choice. */
  multipv: number;
  score: Score | null;
  depth: number;
  /** The principal variation in SAN, replayed from the analysed position. */
  san: string[];
};

/** What the engine is currently saying about one position. */
export type Analysis = {
  /** The position these lines describe. Empty before the first result. */
  fen: string;
  /** The deepest ply reached so far in this search. */
  depth: number;
  lines: EngineLine[];
};

/** Nothing said yet — the state before a search, and after one is abandoned. */
export const EMPTY_ANALYSIS: Analysis = { fen: "", depth: 0, lines: [] };

/**
 * The most lines either screen offers to ask the engine for.
 *
 * A UI bound, not an engine one: this build declares `MultiPV min 1 max 500`, and
 * a slider carrying all 500 puts the range anybody actually uses — the first few
 * lines — inside a few pixels at its left end. It is applied through
 * `OptionSlider`'s `maxOffered`, which only ever *narrows* the engine's range, so
 * a build declaring fewer than this still wins and the control can never offer a
 * value the engine would refuse.
 */
export const MAX_VARIATIONS_OFFERED = 10;

/**
 * Fold one `info` line into an existing analysis.
 *
 * The rule worth naming: a result for a **different position replaces the whole
 * set** rather than merging into it. Two positions' lines are not comparable, and
 * half of each would be nonsense on screen. Both engine screens collect results
 * the same way, so the fold lives here and is tested directly.
 */
export const withEngineLine = (
  previous: Analysis,
  fen: string,
  line: EngineLine,
): Analysis => {
  const isSamePosition = previous.fen === fen;
  const lines = isSamePosition ? [...previous.lines] : [];
  lines[line.multipv - 1] = line;

  return {
    fen,
    depth: isSamePosition ? Math.max(previous.depth, line.depth) : line.depth,
    lines,
  };
};

/**
 * Turn one `info` line's raw numbers into a {@link Score} in White's
 * perspective, or `null` when the line carried no score at all.
 *
 * `turn` is the side to move **in the position that was searched** — not the
 * current game turn. Passing the wrong one silently inverts every evaluation on
 * screen, which is why the screen reads it off the displayed FEN rather than off
 * its `chess.js` instance.
 */
export const scoreFromUci = (
  {
    positionEvaluation,
    possibleMate,
  }: { positionEvaluation?: string; possibleMate?: string },
  turn: Turn,
): Score | null => {
  const sign = turn === "w" ? 1 : -1;

  if (possibleMate !== undefined && possibleMate !== "") {
    const mate = Number(possibleMate);
    if (Number.isFinite(mate)) return { kind: "mate", value: sign * mate };
  }

  if (positionEvaluation !== undefined && positionEvaluation !== "") {
    const cp = Number(positionEvaluation);
    if (Number.isFinite(cp)) return { kind: "cp", value: sign * cp };
  }

  return null;
};

/**
 * The score as it is printed: `"+1.24"`, `"-0.35"`, `"M5"`, `"-M3"`.
 *
 * A mate is written as a mate, never as the five-figure centipawn number the
 * engine would otherwise imply — "mate in 3" and "+327.68" are not the same
 * statement, and only one of them is true.
 */
export const formatScore = (score: Score | null): string => {
  if (score === null) return "—";

  if (score.kind === "mate") {
    const moves = Math.abs(score.value);
    // A negative mate is Black's; the minus stays in front of the M.
    return score.value < 0 ? `-M${moves}` : `M${moves}`;
  }

  const pawns = score.value / 100;
  // `toFixed` rounds -0.004 to "-0.00"; normalise that to a plain zero.
  const text = Math.abs(pawns) < 0.005 ? "0.00" : Math.abs(pawns).toFixed(2);
  return `${pawns >= 0.005 ? "+" : pawns <= -0.005 ? "−" : ""}${text}`;
};

/**
 * How much of the evaluation bar White fills, as a fraction in `[0, 1]`.
 *
 * The centipawn curve is the logistic one lichess uses, so the bar moves the way
 * a chess player expects: sharply through the first couple of pawns, and barely
 * at all between +8 and +12, where the game is over either way and a linear bar
 * would still have half its travel left.
 *
 * The ends are clamped short of 0 and 1 so a decided position still leaves the
 * losing side a visible sliver — a bar that empties completely reads as "no data"
 * rather than as "lost".
 */
export const EVAL_BAR_MARGIN = 0.02;

export const evalBarFraction = (score: Score | null): number => {
  if (score === null) return 0.5;

  if (score.kind === "mate") {
    // Sign alone decides it; "mate in 1" and "mate in 9" are both won.
    if (score.value === 0) return 0.5;
    return score.value > 0 ? 1 - EVAL_BAR_MARGIN : EVAL_BAR_MARGIN;
  }

  const winning = 2 / (1 + Math.exp(-0.00368208 * score.value)) - 1;
  const fraction = (winning + 1) / 2;
  return Math.min(
    Math.max(fraction, EVAL_BAR_MARGIN),
    1 - EVAL_BAR_MARGIN,
  );
};

/**
 * Rewrite a principal variation from the engine's long algebraic (`"e2e4 e7e5"`)
 * into SAN (`["e4", "e5"]`), by replaying it from `fen`.
 *
 * Stops at the first move that will not play. The engine only ever sends legal
 * lines, so that means the line and the position have come apart — a PV left
 * over from the previous search — and half a line is better than a thrown error
 * in the middle of a render.
 */
export const pvToSan = (fen: string, pv: string): string[] => {
  if (pv.trim() === "") return [];

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return [];
  }

  const san: string[] = [];
  for (const uci of pv.trim().split(/\s+/)) {
    try {
      san.push(
        chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          // The engine encodes a promotion as the fifth character, e.g. "e7e8q".
          promotion: uci.slice(4) || undefined,
        }).san,
      );
    } catch {
      break;
    }
  }

  return san;
};

/**
 * Where a SAN line's moves sit in the game's numbering, so a variation can be
 * printed the way a book prints one: `23. Nf3 Qe7 24. Rd1`, and `23... Qe7`
 * when the line starts on Black's move.
 *
 * `fen` is the position the line starts from — its move number and side to move
 * are the whole input, which is why this works for a variation off any ply.
 */
export const numberedVariation = (fen: string, san: string[]): string => {
  const [, turn, , , , fullmove] = fen.split(/\s+/);
  const parsed = Number.parseInt(fullmove ?? "", 10);
  let number = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  let whiteToMove = turn !== "b";

  return san
    .map((move, index) => {
      let prefix = "";
      if (whiteToMove) {
        prefix = `${number}. `;
      } else if (index === 0) {
        // Only the first move needs the ellipsis; after that the alternation
        // makes the side obvious.
        prefix = `${number}... `;
      }

      if (!whiteToMove) number += 1;
      whiteToMove = !whiteToMove;

      return `${prefix}${move}`;
    })
    .join(" ");
};
