import { describe, expect, it } from "vitest";
import {
  CASTLING_FLAGS,
  EMPTY_POSITION,
  START_POSITION,
  castlingField,
  enPassantOptions,
  fenFields,
  fenFromFields,
  positionProblems,
} from "./positionEditor";

describe("fenFields / fenFromFields", () => {
  it("round-trips a FEN through its fields", () => {
    const fen =
      "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2";

    expect(fenFromFields(fenFields(fen))).toBe(fen);
  });

  it("reads the four castling flags apart", () => {
    const { castling } = fenFields(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Kq - 0 1",
    );

    expect(castling).toEqual({ K: true, Q: false, k: false, q: true });
    expect(castlingField(castling)).toBe("Kq");
  });

  it("writes a dash when no side may castle", () => {
    expect(castlingField({ K: false, Q: false, k: false, q: false })).toBe("-");
  });

  it("always writes the flags in FEN order", () => {
    const rights = Object.fromEntries(
      CASTLING_FLAGS.map((flag) => [flag, true]),
    ) as Record<(typeof CASTLING_FLAGS)[number], boolean>;

    expect(castlingField(rights)).toBe("KQkq");
  });

  it("falls back rather than throwing on a truncated FEN", () => {
    // A placement and nothing else — what half a paste looks like.
    const fields = fenFields("8/8/8/8/8/8/8/8");

    expect(fields).toEqual({
      placement: "8/8/8/8/8/8/8/8",
      turn: "w",
      castling: { K: false, Q: false, k: false, q: false },
      enPassant: "-",
      halfmoveClock: 0,
      fullmoveNumber: 1,
    });
  });

  it("drops an en passant target that is not on a possible rank", () => {
    expect(fenFields("8/8/8/8/8/8/8/8 w - e4 0 1").enPassant).toBe("-");
    expect(fenFields("8/8/8/8/8/8/8/8 w - e3 0 1").enPassant).toBe("e3");
  });

  it("keeps the move counters, which have no control of their own", () => {
    const fields = fenFields("8/8/8/8/8/8/8/8 b - - 7 42");

    expect(fields.halfmoveClock).toBe(7);
    expect(fields.fullmoveNumber).toBe(42);
  });
});

describe("enPassantOptions", () => {
  it("offers rank 6 with White to move and rank 3 with Black", () => {
    expect(enPassantOptions("w")).toEqual([
      "-",
      "a6",
      "b6",
      "c6",
      "d6",
      "e6",
      "f6",
      "g6",
      "h6",
    ]);
    expect(enPassantOptions("b")[1]).toBe("a3");
  });
});

describe("positionProblems", () => {
  it("finds nothing wrong with the starting position", () => {
    expect(positionProblems(START_POSITION)).toEqual([]);
  });

  it("reports both missing kings on an empty board", () => {
    expect(positionProblems(EMPTY_POSITION)).toEqual([
      "noWhiteKing",
      "noBlackKing",
    ]);
  });

  it("reports one missing king", () => {
    expect(positionProblems("7k/8/8/8/8/8/8/8 w - - 0 1")).toEqual([
      "noWhiteKing",
    ]);
  });

  it("reports a second king of one colour", () => {
    expect(positionProblems("k6k/8/8/8/8/8/8/K7 w - - 0 1")).toContain(
      "extraKing",
    );
  });

  it("reports a pawn on the first or the last rank", () => {
    expect(positionProblems("P6k/8/8/8/8/8/8/K7 w - - 0 1")).toContain(
      "pawnOnBackRank",
    );
    expect(positionProblems("7k/8/8/8/8/8/8/K5p1 w - - 0 1")).toContain(
      "pawnOnBackRank",
    );
  });

  it("allows a pawn on any rank in between", () => {
    expect(positionProblems("7k/p7/8/8/8/8/7P/K7 w - - 0 1")).toEqual([]);
  });

  it("reports the side not to move standing in check", () => {
    // White to move with a rook already attacking the black king: no game
    // reaches this, because Black's king could simply be captured.
    expect(positionProblems("7k/8/8/8/8/8/8/K6R w - - 0 1")).toContain(
      "opponentInCheck",
    );
  });

  it("says nothing about the side *to* move being in check", () => {
    // The same board with Black to move is an ordinary check.
    expect(positionProblems("7k/8/8/8/8/8/8/K6R b - - 0 1")).toEqual([]);
  });

  it("never throws on a placement it cannot read", () => {
    expect(() => positionProblems("not-a-position w - - 0 1")).not.toThrow();
  });
});
