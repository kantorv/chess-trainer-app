import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import {
  finalFenOf,
  gameFromChess,
  gameTag,
  initialFenOf,
  type Game,
} from "./gameModel";
import { moveRowsOf } from "./gameNavigation";

/*
  The model is what both producers agree on, so these tests are mostly about the
  live-game half — the PGN half is covered by `pgn.test.ts`, and the point here
  is that a game grown out of `chess.js` comes out the same shape.
*/

const played = (...sans: string[]) => {
  const chess = new Chess();
  sans.forEach((san) => chess.move(san));
  return chess;
};

describe("gameTag", () => {
  it("reads a real value", () => {
    expect(gameTag({ White: "Alice" }, "White")).toBe("Alice");
  });

  it("treats the PGN placeholders as absent", () => {
    expect(gameTag({ White: "?" }, "White")).toBeUndefined();
    expect(gameTag({ Date: "????.??.??" }, "Date")).toBeUndefined();
    expect(gameTag({}, "Event")).toBeUndefined();
  });
});

describe("gameFromChess", () => {
  it("snapshots an untouched game as a moveless one at the start position", () => {
    const game = gameFromChess(new Chess());

    expect(game.moves).toEqual([]);
    expect(initialFenOf(game)).toBe(DEFAULT_POSITION);
    expect(finalFenOf(game)).toBe(DEFAULT_POSITION);
  });

  it("records each move with the position it produced", () => {
    const game = gameFromChess(played("e4", "e5", "Nf3"));

    expect(game.moves.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(game.moves.map((move) => move.ply)).toEqual([1, 2, 3]);
    expect(game.moves[0]).toMatchObject({ from: "e2", to: "e4" });
    // The FEN a move carries is the position *after* it — a viewer jumps to a
    // ply by reading this, never by replaying the game.
    expect(game.moves[2].fen).toContain(" b ");
    expect(finalFenOf(game)).toBe(game.moves[2].fen);
  });

  it("is a copy: mutating the instance afterwards leaves the snapshot alone", () => {
    const chess = played("e4");
    const game = gameFromChess(chess);

    chess.move("e5");

    expect(game.moves).toHaveLength(1);
    expect(gameFromChess(chess).moves).toHaveLength(2);
  });

  it("does not write a FEN header for a game that started normally", () => {
    expect(gameFromChess(played("d4")).headers.FEN).toBeUndefined();
  });

  it("records a custom starting position so the numbering survives", () => {
    // Black to move, move 24 — a game whose moves must not be printed as "1.".
    const start = "8/5k2/8/8/8/6K1/6P1/8 b - - 0 24";
    const chess = new Chess(start);
    chess.move("Ke6");

    const game = gameFromChess(chess);

    expect(game.headers.FEN).toBe(start);
    expect(initialFenOf(game)).toBe(start);
    expect(moveRowsOf(game)[0]).toMatchObject({ number: 24, white: null });
  });

  it("keeps the caller's headers over the reconstructed FEN", () => {
    const chess = played("e4");
    const game = gameFromChess(chess, { White: "Alice", FEN: DEFAULT_POSITION });

    expect(game.headers.White).toBe("Alice");
    expect(game.headers.FEN).toBe(DEFAULT_POSITION);
  });
});

describe("initialFenOf / finalFenOf", () => {
  it("fall back to the standard position for an empty game", () => {
    const empty: Game = { headers: {}, moves: [] };

    expect(initialFenOf(empty)).toBe(DEFAULT_POSITION);
    expect(finalFenOf(empty)).toBe(DEFAULT_POSITION);
  });

  it("ignore a placeholder FEN tag", () => {
    // `chess.js` fills unset tags with "?"; that is not a position.
    expect(initialFenOf({ headers: { FEN: "?" }, moves: [] })).toBe(
      DEFAULT_POSITION,
    );
  });
});
