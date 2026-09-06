import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { parsePgnGames } from "./pgn";
import type { Game } from "./gameModel";
import {
  MOVE_ARROW_COLOR,
  arrowsAtPly,
  clampPly,
  fenAtPly,
  initialPlyOf,
  lastPlyOf,
  moveRowsOf,
  parseMoveParam,
} from "./gameNavigation";

/** `1. e4 e5 2. Nf3 Nc6 3. Bb5` — five plies, so the last pair is half empty. */
const game: Game = parsePgnGames(
  [`[White "Alice"]`, `[Black "Bob"]`, "", "1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0"].join(
    "\n",
  ),
)[0];

/**
 * A game seeded from a FEN with Black to move on move 12 — the case where the
 * pair numbering cannot be derived from the move index alone.
 */
const blackToMove: Game = {
  headers: {
    SetUp: "1",
    FEN: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12",
  },
  moves: [
    { san: "Nf6", from: "g8", to: "f6", fen: "fen-after-1", ply: 1 },
    { san: "Nf3", from: "g1", to: "f3", fen: "fen-after-2", ply: 2 },
    { san: "Nc6", from: "b8", to: "c6", fen: "fen-after-3", ply: 3 },
  ],
};

const emptyGame: Game = { headers: {}, moves: [] };

describe("clampPly", () => {
  it("pins a ply into the range the game actually has", () => {
    expect(lastPlyOf(game)).toBe(5);
    expect(clampPly(game, -4)).toBe(0);
    expect(clampPly(game, 0)).toBe(0);
    expect(clampPly(game, 3)).toBe(3);
    expect(clampPly(game, 5)).toBe(5);
    expect(clampPly(game, 99)).toBe(5);
  });

  it("leaves a moveless game with ply 0 as its only selection", () => {
    expect(clampPly(emptyGame, 7)).toBe(0);
    expect(clampPly(emptyGame, -7)).toBe(0);
  });
});

describe("fenAtPly", () => {
  it("shows the starting position at ply 0", () => {
    expect(fenAtPly(game, 0)).toBe(DEFAULT_POSITION);
    // A FEN-seeded game starts from its own tag, not from the opening position.
    expect(fenAtPly(blackToMove, 0)).toBe(blackToMove.headers.FEN);
  });

  it("shows the position each move already recorded", () => {
    expect(fenAtPly(game, 1)).toBe(game.moves[0].fen);
    expect(fenAtPly(game, 5)).toBe(game.moves[4].fen);
  });

  it("clamps rather than reading off the end", () => {
    expect(fenAtPly(game, 99)).toBe(game.moves[4].fen);
    expect(fenAtPly(game, -1)).toBe(DEFAULT_POSITION);
  });
});

describe("arrowsAtPly", () => {
  it("draws nothing at the starting position", () => {
    expect(arrowsAtPly(game, 0)).toEqual([]);
  });

  it("draws exactly the move that produced the current position", () => {
    expect(arrowsAtPly(game, 1)).toEqual([
      { startSquare: "e2", endSquare: "e4", color: MOVE_ARROW_COLOR },
    ]);
    expect(arrowsAtPly(game, 3)).toEqual([
      { startSquare: "g1", endSquare: "f3", color: MOVE_ARROW_COLOR },
    ]);
  });

  it("returns the whole set for the ply, never an accumulation", () => {
    // Walking the game must never grow the array: the board does not clear
    // external arrows itself, so each ply hands it a complete replacement.
    for (let ply = 1; ply <= lastPlyOf(game); ply += 1) {
      expect(arrowsAtPly(game, ply)).toHaveLength(1);
    }
    // And a fresh array each call, so a caller cannot mutate the next one.
    expect(arrowsAtPly(game, 2)).not.toBe(arrowsAtPly(game, 2));
  });
});

describe("moveRowsOf", () => {
  it("pairs the moves into numbered rows, leaving an odd tail half empty", () => {
    const rows = moveRowsOf(game);

    expect(rows.map((row) => row.number)).toEqual([1, 2, 3]);
    expect(rows[0].white?.san).toBe("e4");
    expect(rows[0].black?.san).toBe("e5");
    expect(rows[2].white?.san).toBe("Bb5");
    expect(rows[2].black).toBeNull();
  });

  it("keeps ply numbers, so a cell knows what to select", () => {
    const rows = moveRowsOf(game);
    expect(rows[0].white?.ply).toBe(1);
    expect(rows[1].black?.ply).toBe(4);
  });

  it("opens with an empty White slot when the FEN starts on Black", () => {
    const rows = moveRowsOf(blackToMove);

    // Numbering comes off the FEN's full-move counter, not the move index.
    expect(rows.map((row) => row.number)).toEqual([12, 13]);
    expect(rows[0].white).toBeNull();
    expect(rows[0].black?.san).toBe("Nf6");
    expect(rows[1].white?.san).toBe("Nf3");
    expect(rows[1].black?.san).toBe("Nc6");
  });

  it("has no rows for a moveless game", () => {
    expect(moveRowsOf(emptyGame)).toEqual([]);
  });
});

describe("parseMoveParam", () => {
  it("reads a ply out of the ?move= parameter", () => {
    expect(parseMoveParam("0")).toBe(0);
    expect(parseMoveParam("12")).toBe(12);
  });

  it("ignores what is not a ply, the way parseFen ignores a bad link", () => {
    expect(parseMoveParam(null)).toBeUndefined();
    expect(parseMoveParam("")).toBeUndefined();
    expect(parseMoveParam("abc")).toBeUndefined();
    expect(parseMoveParam("-3")).toBeUndefined();
    expect(parseMoveParam("2.5")).toBeUndefined();
    expect(parseMoveParam("e4")).toBeUndefined();
  });

  it("does not bound the value — too large is clampPly's call, not this one's", () => {
    expect(parseMoveParam("99999")).toBe(99999);
  });
});

describe("initialPlyOf", () => {
  /** The fixture above (`game`) has five plies; `startPly` reheads it. */
  const startPly = (value: string | undefined): Game => ({
    ...game,
    headers: value === undefined ? {} : { StartPly: value },
  });

  it("is 0 for a game that declares no StartPly", () => {
    expect(initialPlyOf(game)).toBe(0);
  });

  it("reads the ply the StartPly tag declares", () => {
    expect(initialPlyOf(startPly("0"))).toBe(0);
    expect(initialPlyOf(startPly("3"))).toBe(3);
    expect(initialPlyOf(startPly("5"))).toBe(5);
  });

  it.each(["abc", "-3", "2.5", "e4", ""])(
    "treats a value that is not a ply (%s) as no declaration",
    (value) => {
      expect(initialPlyOf(startPly(value))).toBe(0);
    },
  );

  it("ignores a ply past the end of the game whole, rather than clamping it", () => {
    expect(initialPlyOf(startPly("6"))).toBe(0);
    expect(initialPlyOf(startPly("99999"))).toBe(0);
  });

  it("ignores the PGN placeholders gameTag reports as absent", () => {
    expect(initialPlyOf(startPly("?"))).toBe(0);
  });
});
