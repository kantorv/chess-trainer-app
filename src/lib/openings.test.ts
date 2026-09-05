import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import {
  findOpening,
  getPositionBook,
  loadOpeningBook,
  nextMoveOpenings,
  type OpeningBook,
} from "./openings";

/** The position after 1. e4, in full and board-only form. */
const AFTER_E4 = new Chess();
AFTER_E4.move("e4");
const AFTER_E4_FEN = AFTER_E4.fen();
const AFTER_E4_BOARD = AFTER_E4_FEN.split(" ")[0];

/** A tiny fixture book: one root position, and one reachable only by a different castling/turn state. */
const fixtureBook: OpeningBook = {
  [AFTER_E4_FEN]: { eco: "B00", name: "King's Pawn Opening", moves: "1. e4" },
  "rnbqkbnr/pppppppp/8/8/8/7N/PPPPPPPP/RNBQKB1R b KQkq - 1 1": {
    eco: "A00",
    name: "Amar Opening",
    moves: "1. Nh3",
  },
};

describe("findOpening", () => {
  it("matches an exact FEN", () => {
    expect(findOpening(fixtureBook, AFTER_E4_FEN)?.name).toBe("King's Pawn Opening");
  });

  it("reports an unrecognised position as undefined, not an error", () => {
    expect(findOpening(fixtureBook, DEFAULT_POSITION)).toBeUndefined();
  });

  it("falls back to the position-only index when the exact FEN differs", () => {
    // Same board and turn as AFTER_E4_FEN, but with a made-up clock — the kind
    // of difference a transposition or a hand-edited FEN can introduce.
    const almostSameFen = `${AFTER_E4_BOARD} b KQkq e3 0 7`;
    const positionBook = getPositionBook(fixtureBook);

    expect(findOpening(fixtureBook, almostSameFen)).toBeUndefined();
    expect(findOpening(fixtureBook, almostSameFen, positionBook)?.name).toBe(
      "King's Pawn Opening",
    );
  });

  it("does not fall back without a position book", () => {
    const almostSameFen = `${AFTER_E4_BOARD} b KQkq e3 0 7`;
    expect(findOpening(fixtureBook, almostSameFen)).toBeUndefined();
  });
});

describe("getPositionBook", () => {
  it("indexes every entry under its board-only FEN", () => {
    const positionBook = getPositionBook(fixtureBook);
    expect(positionBook[AFTER_E4_BOARD]).toEqual([AFTER_E4_FEN]);
  });
});

describe("nextMoveOpenings", () => {
  it("pairs every legal move with the opening it reaches", () => {
    const results = nextMoveOpenings(DEFAULT_POSITION, fixtureBook);

    const e4 = results.find((r) => r.san === "e4");
    expect(e4?.fen).toBe(AFTER_E4_FEN);
    expect(e4?.opening?.name).toBe("King's Pawn Opening");

    const d4 = results.find((r) => r.san === "d4");
    expect(d4?.opening).toBeUndefined();

    // The starting position has 20 legal moves.
    expect(results).toHaveLength(20);
  });

  it("returns nothing for a FEN that will not parse, rather than throwing", () => {
    expect(nextMoveOpenings("not a fen", fixtureBook)).toEqual([]);
  });

  it("returns nothing from a checkmated position, which has no legal moves", () => {
    // Fool's mate.
    const chess = new Chess();
    for (const san of ["f3", "e5", "g4", "Qh4"]) chess.move(san);
    expect(nextMoveOpenings(chess.fen(), fixtureBook)).toEqual([]);
  });
});

describe("loadOpeningBook", () => {
  it("loads the vendored data and finds a well-known opening", async () => {
    const book = await loadOpeningBook();
    const opening = findOpening(book, AFTER_E4_FEN);
    expect(opening?.eco).toMatch(/^B/);
  });

  it("caches the promise across calls", async () => {
    const [first, second] = await Promise.all([loadOpeningBook(), loadOpeningBook()]);
    expect(first).toBe(second);
  });
});
