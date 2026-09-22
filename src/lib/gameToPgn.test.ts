import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";

import { gameFromChess, initialFenOf, type Game } from "./gameModel";
import { gameToPgn } from "./gameTree";
import { parsePgnGame } from "./pgn";

/*
  The linear game's writer (`gameToPgn`, `lib/gameTree.ts`) — `treeToPgn` over
  a one-line tree. Moved here from the deleted `savedGames.test.ts` (CTA-79),
  whose record was its first user.
*/

/** A game built by playing SAN moves. */
const playedGame = (moves: readonly string[], startFen?: string): Game => {
  const chess = new Chess(startFen);
  for (const san of moves) chess.move(san);
  return gameFromChess(chess);
};

describe("gameToPgn — the linear game's PGN", () => {
  it("round-trips a game through the existing parser", () => {
    const game = playedGame(["e4", "e5", "Nf3", "Nc6"]);

    const reparsed = parsePgnGame(gameToPgn(game));

    expect(reparsed.moves.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
    // Every ply still carries the position it produced, which is the whole
    // contract the move list and the ply navigation read.
    expect(reparsed.moves.map((move) => move.fen)).toEqual(
      game.moves.map((move) => move.fen),
    );
  });

  it("keeps a game that started from a position, and its move numbering", () => {
    // Black to move at move 20 — a game started from an edited position.
    const setUp = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 20";
    const game = playedGame(["Kh8", "Ra8#"], setUp);

    const pgn = gameToPgn(game);
    const reparsed = parsePgnGame(pgn);

    expect(pgn).toContain(`[FEN "${setUp}"]`);
    expect(pgn).toContain("20... Kh8");
    expect(initialFenOf(reparsed)).toBe(setUp);
    expect(reparsed.moves).toHaveLength(2);
  });

  it("writes a moveless game as its result alone", () => {
    expect(gameToPgn(playedGame([]))).toBe("*");
  });
});
