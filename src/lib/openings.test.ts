import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import {
  findOpening,
  getPositionBook,
  knownMoveOpenings,
  loadOpeningBook,
  nextMoveOpenings,
  stickyOpening,
  type LastKnownOpening,
  type OpeningBook,
} from "./openings";

/** The position after 1. e4, in full and board-only form. */
const AFTER_E4 = new Chess();
AFTER_E4.move("e4");
const AFTER_E4_FEN = AFTER_E4.fen();
const AFTER_E4_BOARD = AFTER_E4_FEN.split(" ")[0];

/** The position after 1. e4 e5. */
const AFTER_E4_E5 = new Chess();
AFTER_E4_E5.move("e4");
AFTER_E4_E5.move("e5");
const AFTER_E4_E5_FEN = AFTER_E4_E5.fen();

/** A tiny fixture book: one root position, one a ply deeper, and one reachable only by a different castling/turn state. */
const fixtureBook: OpeningBook = {
  [AFTER_E4_FEN]: { eco: "B00", name: "King's Pawn Opening", moves: "1. e4" },
  [AFTER_E4_E5_FEN]: { eco: "C20", name: "King's Pawn Game", moves: "1. e4 e5" },
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
    expect(e4?.from).toBe("e2");
    expect(e4?.to).toBe("e4");
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

describe("knownMoveOpenings", () => {
  it("keeps only the moves that resolve to an opening", () => {
    const known = knownMoveOpenings(DEFAULT_POSITION, fixtureBook);

    // Of the twenty legal first moves, the fixture book names e4 and Nh3.
    expect(known.map((move) => move.san).sort()).toEqual(["Nh3", "e4"]);
    for (const move of known) expect(move.opening).toBeDefined();
  });

  it("is empty from a position the book knows nothing past", () => {
    // The fixture book stops at 1. e4 e5 — nothing is known from there.
    expect(knownMoveOpenings(AFTER_E4_E5_FEN, fixtureBook)).toEqual([]);
  });
});

describe("stickyOpening", () => {
  const positionBook = getPositionBook(fixtureBook);

  /* An off-book position two half-moves in — after 1. e4 a6. */
  const offBook = new Chess();
  offBook.move("e4");
  offBook.move("a6");
  const OFF_BOOK_FEN = offBook.fen();

  it("resolves a known position directly, remembering where it found it", () => {
    expect(stickyOpening(fixtureBook, positionBook, AFTER_E4_FEN, null)).toEqual({
      ply: 1,
      opening: fixtureBook[AFTER_E4_FEN],
    });
  });

  it("is null for an unknown position with nothing behind it", () => {
    expect(stickyOpening(fixtureBook, positionBook, DEFAULT_POSITION, null)).toBeNull();
  });

  it("keeps the last known opening at a later off-book position", () => {
    const known = stickyOpening(fixtureBook, positionBook, AFTER_E4_FEN, null);
    const sticky = stickyOpening(fixtureBook, positionBook, OFF_BOOK_FEN, known);

    expect(sticky?.opening).toBe(known?.opening);
    // Returned by reference, so a memoised caller sees no change.
    expect(sticky).toBe(known);
  });

  it("clears when the position goes back past the remembered one", () => {
    const known = stickyOpening(fixtureBook, positionBook, AFTER_E4_FEN, null);
    expect(stickyOpening(fixtureBook, positionBook, DEFAULT_POSITION, known)).toBeNull();
  });

  it("replaces the memory when a deeper position is known again", () => {
    const first = stickyOpening(fixtureBook, positionBook, AFTER_E4_FEN, null);
    const deeper = stickyOpening(fixtureBook, positionBook, AFTER_E4_E5_FEN, first);

    expect(deeper).toEqual({ ply: 2, opening: fixtureBook[AFTER_E4_E5_FEN] });
    // And the new memory is what a later off-book position sticks to.
    const later: LastKnownOpening | null = stickyOpening(
      fixtureBook,
      positionBook,
      // 1. e4 e5 a3 — off book, a half-move past the new memory.
      (() => {
        const chess = new Chess();
        for (const san of ["e4", "e5", "a3"]) chess.move(san);
        return chess.fen();
      })(),
      deeper,
    );
    expect(later?.opening.name).toBe("King's Pawn Game");
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
