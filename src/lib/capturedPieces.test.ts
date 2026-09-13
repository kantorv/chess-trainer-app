import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { gameFromChess, type Game } from "./gameModel";
import { parsePgnTree } from "./pgn";
import { fenAtNode, pathTo } from "./gameTree";
import {
  capturedOfLine,
  capturedSummaryOf,
  diffForSide,
  materialDiff,
} from "./capturedPieces";

/**
 * The two things the strips rest on: that the captured lists come off the
 * *history* (so a promoted pawn is never a capture) and that the material diff
 * is relative to the line's own start (so a study that opens imbalanced shows
 * nothing until something is taken).
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** A `Game` replayed out of SAN, the way the PGN screens get one. */
const gameOf = (...sans: string[]): Game => {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return gameFromChess(chess);
};

/** A study's start position: White K+Q, Black K+R+P — an imbalanced baseline. */
const STUDY_FEN = "6rk/7p/8/8/8/8/8/K6Q w - - 0 1";

describe("capturedOfLine", () => {
  it("shows nothing for a line with no captures", () => {
    const game = gameOf("e4", "e5", "Nf3", "Nc6");
    expect(capturedOfLine(game.moves, START)).toEqual({
      white: [],
      black: [],
    });
  });

  it("attributes a capture to the side that made it", () => {
    // 1. e4 d5 2. exd5 — White took a pawn.
    const game = gameOf("e4", "d5", "exd5");
    const captured = capturedOfLine(game.moves, START);

    expect(captured.white).toEqual(["p"]);
    expect(captured.black).toEqual([]);
  });

  it("sorts each side strongest first, however the captures arrived", () => {
    // 1. e4 d5 2. exd5 Nc6 3. dxc6 — the pawn first, the knight second;
    // strongest first puts the knight ahead of it in the list.
    const game = gameOf("e4", "d5", "exd5", "Nc6", "dxc6");
    const captured = capturedOfLine(game.moves, START);

    expect(captured.white).toEqual(["n", "p"]);
  });

  it("attributes correctly for a game that starts with Black to move", () => {
    // 1... e5 2. d4 exd4 — Black took White's pawn.
    const chess = new Chess(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b - - 0 1",
    );
    chess.move("e5");
    chess.move("d4");
    chess.move("exd4");
    const game = gameFromChess(chess);

    const captured = capturedOfLine(
      game.moves,
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b - - 0 1",
    );

    expect(captured.black).toEqual(["p"]);
    expect(captured.white).toEqual([]);
  });

  it("never reports a promoted pawn as a capture", () => {
    // 1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Rg8 5. h8=Q — the promotion push
    // is a new man on the board, not a captured one.
    const game = gameOf("h4", "g5", "hxg5", "h6", "gxh6", "Nf6", "h7", "Rg8", "h8=Q");
    const captured = capturedOfLine(game.moves, START);

    expect(captured.white).toEqual(["p", "p"]);
    expect(captured.white).not.toContain("q");
  });

  it("walks the tree path it is handed, from the tree's own start", () => {
    // A tree screen hands `pathTo` — the moves from the root down to one node.
    const tree = parsePgnTree(`[FEN "${STUDY_FEN}"]\n\n1. Qxh7+ Kxh7`);
    const path = pathTo(tree, "n2");

    const captured = capturedOfLine(path, tree.startFen);
    expect(captured.white).toEqual(["p"]);
    expect(captured.black).toEqual(["q"]);
  });

  it("shows nothing for the start position itself", () => {
    const tree = parsePgnTree(`[FEN "${STUDY_FEN}"]\n\n1. Qxh7+ Kxh7`);
    // An empty path — the reader is standing at the root.
    expect(capturedOfLine(pathTo(tree, null), tree.startFen)).toEqual({
      white: [],
      black: [],
    });
  });

  it("drops an unknown `captured` letter rather than counting it", () => {
    const moves = [
      { san: "e4", captured: "x" },
      { san: "d5" },
    ];
    expect(capturedOfLine(moves, START)).toEqual({ white: [], black: [] });
  });
});

describe("materialDiff", () => {
  it("is level at the standard start", () => {
    expect(materialDiff(START, START)).toBe(0);
  });

  it("counts captures for the side that took them", () => {
    // 1. e4 d5 2. exd5 Nc6 3. dxc6 — White is four points up: two pawns and a knight.
    const game = gameOf("e4", "d5", "exd5", "Nc6", "dxc6");
    expect(materialDiff(game.moves.at(-1)!.fen, START)).toBe(4);
  });

  it("is relative to the baseline, not to the standard start", () => {
    // A study that opens a queen down is not "behind" — that is the exercise.
    // Relative to its own start the diff is level until something is taken.
    expect(materialDiff(STUDY_FEN, STUDY_FEN)).toBe(0);

    // 1. Qxh7+ — White takes the study's pawn: one point up of the baseline.
    const chess = new Chess(STUDY_FEN);
    chess.move("Qxh7+");
    expect(materialDiff(chess.fen(), STUDY_FEN)).toBe(1);
  });

  it("counts a promotion as a gain for the side that made it", () => {
    // 1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Rg8 5. h8=Q — two pawn captures
    // (2) plus the promotion (9 − 1 = 8) is ten points up of the start.
    const game = gameOf("h4", "g5", "hxg5", "h6", "gxh6", "Nf6", "h7", "Rg8", "h8=Q");
    expect(materialDiff(game.moves.at(-1)!.fen, START)).toBe(10);
  });

  it("counts the capture of a promoted piece at its true value", () => {
    // …and then the rook takes the promoted queen back. The board truth is
    // +1 — White ate two pawns and lost his own h-pawn — which a capture-sum
    // alone would misstate, and what a FEN-diff would call a phantom capture.
    const game = gameOf("h4", "g5", "hxg5", "h6", "gxh6", "Nf6", "h7", "Rg8", "h8=Q", "Rxh8");
    expect(materialDiff(game.moves.at(-1)!.fen, START)).toBe(1);
  });
});

describe("diffForSide", () => {
  it("gives the diff to the side that is ahead", () => {
    expect(diffForSide(3, "white")).toBe(3);
    expect(diffForSide(3, "black")).toBeNull();
  });

  it("gives a negative diff to Black as a positive count", () => {
    expect(diffForSide(-5, "black")).toBe(5);
    expect(diffForSide(-5, "white")).toBeNull();
  });

  it("hides the diff when level", () => {
    expect(diffForSide(0, "white")).toBeNull();
    expect(diffForSide(0, "black")).toBeNull();
  });
});

describe("capturedSummaryOf", () => {
  it("carries the lists and the diff together", () => {
    const game = gameOf("e4", "d5", "exd5");
    const summary = capturedSummaryOf(
      game.moves,
      START,
      game.moves.at(-1)!.fen,
    );

    expect(summary.captured.white).toEqual(["p"]);
    expect(summary.captured.black).toEqual([]);
    expect(summary.materialDiff).toBe(1);
  });

  it("is empty and level at ply 0", () => {
    const summary = capturedSummaryOf([], START, START);

    expect(summary.captured).toEqual({ white: [], black: [] });
    expect(summary.materialDiff).toBe(0);
  });

  it("agrees with the tree walk a variation screen hands it", () => {
    const tree = parsePgnTree(`[FEN "${STUDY_FEN}"]\n\n1. Qxh7+ Kxh7`);
    const summary = capturedSummaryOf(
      pathTo(tree, "n2"),
      tree.startFen,
      fenAtNode(tree, "n2"),
    );

    expect(summary.captured.white).toEqual(["p"]);
    expect(summary.captured.black).toEqual(["q"]);
    // White lost his queen for a pawn of an imbalanced baseline: −8 of it.
    expect(summary.materialDiff).toBe(-8);
  });
});
